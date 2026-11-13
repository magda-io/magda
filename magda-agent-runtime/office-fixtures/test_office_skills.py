#!/usr/bin/env python3
"""Qualify DSH's Office skills against MAGDA's runtime.

Runs inside the image build, as the runtime user, with the Python returned by
DSH's load_workspace_dependencies tool:

    /usr/local/lib/magda-agent/primary-runtime/dependencies/python/bin/python3 \
        -m unittest discover -s office-fixtures -p 'test_*.py'

It covers the four things the office-docx/pptx/xlsx skills ask the agent to do:
read existing files with the bundled libraries, generate new ones (by running
the skills' own code examples), check them with the shared check_office.py, and
render, convert and recalculate them with the installed LibreOffice Kit CLI.
The fixtures' facts are defined in generate_fixtures.py. Override the image
paths with OFFICE_PRIMARY_RUNTIME, OFFICE_SKILL_ASSETS, LIBREOFFICE_KIT_CLI and
OFFICE_NODE.
"""

import datetime
import importlib.metadata
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
DSH = "/usr/local/lib/magda-agent/dsh/node_modules/@deepseek-ai"
PRIMARY_RUNTIME = os.environ.get("OFFICE_PRIMARY_RUNTIME", "/usr/local/lib/magda-agent/primary-runtime")
ASSETS = os.environ.get("OFFICE_SKILL_ASSETS", f"{DSH}/dsh-skill-office/assets")
KIT_CLI = os.environ.get("LIBREOFFICE_KIT_CLI", f"{DSH}/libreoffice-kit/lib/cli.js")
# The CLI entry skill-office gives the agent: MAGDA's wrapper, which runs KIT_CLI
# one command at a time per Workspace.
CLI = os.environ.get("LIBREOFFICE_KIT_WRAPPER", "/usr/local/lib/magda-agent/libreoffice-kit-cli.mjs")
NODE = os.environ.get("OFFICE_NODE", "/usr/local/bin/node")
CHECKER = os.path.join(ASSETS, "scripts", "check_office.py")

# DSH's locked pure-Python Office libraries (office-runtime/requirements.txt).
LOCKED = {
    "python-docx": "1.2.0",
    "python-pptx": "1.0.2",
    "openpyxl": "3.1.5",
    "XlsxWriter": "3.2.9",
    "typing_extensions": "4.16.0",
    "et_xmlfile": "2.0.0",
}


def normalise(name):
    return re.sub(r"[-_.]+", "-", name).lower()


def fixture(name):
    return os.path.join(HERE, name)


def check(path, *args, raw=False):
    """Run DSH's shared checker as the skills do; return (exit code, report)."""
    result = subprocess.run(
        [sys.executable, CHECKER, path, *args], capture_output=True, text=True, timeout=120
    )
    return result if raw else (result.returncode, json.loads(result.stdout))


def kit(*args, cwd=None):
    """Run the installed LibreOffice Kit CLI as the skills do: <node> <cli> ..."""
    # Run from a task directory, as the skills do (a deleted cwd fails in Node).
    result = subprocess.run(
        [NODE, CLI, *args], capture_output=True, text=True, timeout=600, cwd=cwd or tempfile.gettempdir()
    )
    if result.returncode != 0:
        raise AssertionError(f"kit {' '.join(args)} failed: {result.stdout} {result.stderr}")
    return json.loads(result.stdout)


def assert_not_blank(test, path):
    from PIL import Image

    with Image.open(path) as image:
        # The xlsx skill: composite RGBA onto white before judging blankness.
        rgba = image.convert("RGBA")
        white = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        gray = Image.alpha_composite(white, rgba).convert("L")
        low, high = gray.getextrema()
    test.assertLess(low, 200, f"{path} looks blank (min luminance {low})")
    test.assertGreater(high, 200, f"{path} has no light background")


class PayloadTest(unittest.TestCase):
    """The interpreter load_workspace_dependencies returns is MAGDA's payload."""

    def test_interpreter_is_the_payload_venv_over_debian_python(self):
        self.assertEqual(sys.prefix, os.path.join(PRIMARY_RUNTIME, "dependencies", "python"))
        self.assertEqual(sys.base_prefix, "/usr")
        self.assertEqual(os.path.realpath(sys.executable).rsplit("/", 1)[0], "/usr/bin")

    def test_manifest_matches_installed_distributions(self):
        with open(os.path.join(PRIMARY_RUNTIME, "runtime.json"), encoding="utf-8") as handle:
            manifest = json.load(handle)
        self.assertEqual(manifest["platform"], "linux")
        self.assertEqual(manifest["python"], ".".join(map(str, sys.version_info[:3])))
        packages = {normalise(name): version for name, version in manifest["pythonPackages"].items()}
        for name, version in LOCKED.items():
            self.assertEqual(packages.get(normalise(name)), version, name)
        for name in ("lxml", "Pillow", "numpy", "pandas"):
            self.assertIn(normalise(name), packages)
        for name, version in manifest["pythonPackages"].items():
            self.assertEqual(importlib.metadata.version(name), version, name)

    def test_libraries_named_by_the_tool_import(self):
        import docx, lxml, numpy, openpyxl, pandas, PIL, pptx, xlsxwriter  # noqa: F401

    def test_payload_is_not_writable_by_the_runtime_user(self):
        if os.geteuid() == 0:
            self.skipTest("run as the runtime user")
        self.assertFalse(os.access(sys.prefix, os.W_OK))
        self.assertFalse(os.access(os.path.join(PRIMARY_RUNTIME, "runtime.json"), os.W_OK))


class ReadDocxTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import docx

        cls.document = docx.Document(fixture("report.docx"))

    def test_paragraphs_and_headings(self):
        paragraphs = [(p.style.name, p.text) for p in self.document.paragraphs]
        self.assertIn(("Title", "Coastal Monitoring Report"), paragraphs)
        self.assertIn(("Heading 1", "Summary"), paragraphs)
        self.assertIn(
            "Station BW-7 recorded a peak salinity of 35.2 PSU on 14 March 2026.",
            [text for _, text in paragraphs],
        )
        self.assertIn(("List Bullet", "Two loggers were replaced after storm damage."), paragraphs)

    def test_tables_nested_tables_and_merges(self):
        table = self.document.tables[0]
        self.assertEqual([c.text for c in table.rows[0].cells], ["Site", "Samples", "Lead scientist"])
        lead = table.cell(1, 2)
        self.assertTrue(lead.text.startswith("Dr Amara Okafor"))
        nested = lead.tables[0]
        self.assertEqual([[c.text for c in r.cells] for r in nested.rows], [["Replicate A", "7.81"], ["Replicate B", "7.79"]])
        self.assertIs(table.cell(3, 1)._tc, table.cell(3, 2)._tc)

    def test_headers_footers_and_comments(self):
        section = self.document.sections[0]
        self.assertEqual(section.header.paragraphs[0].text, "CONFIDENTIAL DRAFT - Marine Division")
        self.assertEqual(section.first_page_header.paragraphs[0].text, "Cover page header")
        self.assertEqual(section.footer.paragraphs[0].text, "Prepared by Field Operations")
        comments = [(c.author, c.text) for c in self.document.comments]
        self.assertEqual(comments, [("Priya Natarajan", "Check the Eastern Shoal budget first.")])
        self.assertEqual(self.document.core_properties.title, "Coastal Monitoring Report")


class ReadPptxTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from pptx import Presentation

        cls.slides = list(Presentation(fixture("briefing.pptx")).slides)

    def test_titles_levels_and_notes(self):
        self.assertEqual([s.shapes.title.text for s in self.slides],
                         ["Field Season Briefing", "Priorities", "Budget by region", "Samples collected", "Contingency"])
        body = self.slides[1].placeholders[1].text_frame.paragraphs
        self.assertEqual([(p.level, p.text) for p in body],
                         [(0, "Expand sampling to three new estuaries"), (1, "Hawkesbury, Clarence and Richmond"),
                          (0, "Replace ageing loggers before winter")])
        self.assertEqual(self.slides[1].notes_slide.notes_text_frame.text,
                         "Remind the committee that budget approval is due 30 June.")

    def test_tables_groups_charts_and_hidden_slides(self):
        shapes = list(self.slides[2].shapes)
        table = next(s for s in shapes if s.has_table).table
        self.assertEqual([c.text for c in table.rows[1].cells], ["Pilbara", "1,250,000"])
        group = next(s for s in shapes if s.shape_type == 6)  # MSO_SHAPE_TYPE.GROUP
        self.assertEqual([s.text_frame.text for s in group.shapes], ["Figures exclude GST"])
        chart = next(s for s in self.slides[3].shapes if s.has_chart).chart
        self.assertEqual(chart.chart_title.text_frame.text, "Samples by quarter")
        self.assertEqual(list(chart.plots[0].categories), ["Q1", "Q2", "Q3", "Q4"])
        self.assertEqual(list(chart.series[0].values), [120, 135, 160, 98])
        self.assertEqual([s._element.get("show") for s in self.slides], [None, None, None, None, "0"])


class ReadXlsxTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import openpyxl

        cls.formulas = openpyxl.load_workbook(fixture("budget.xlsx"), data_only=False)
        cls.values = openpyxl.load_workbook(fixture("budget.xlsx"), data_only=True)

    def test_sheets_merges_comments_and_types(self):
        self.assertEqual(self.formulas.sheetnames, ["Summary", "Detail", "Lookup"])
        self.assertEqual(self.formulas["Lookup"].sheet_state, "hidden")
        summary = self.formulas["Summary"]
        self.assertEqual([str(r) for r in summary.merged_cells.ranges], ["A1:C1"])
        self.assertEqual(summary["B6"].comment.text, "Includes GST-free items only")
        self.assertIs(summary["C3"].value, True)
        self.assertEqual(summary["B8"].value, datetime.datetime(2026, 3, 31))

    def test_formula_expressions_and_cached_values_are_distinct(self):
        self.assertEqual(self.formulas["Summary"]["B6"].value, "=SUM(B3:B5)")
        self.assertEqual(self.values["Summary"]["B6"].value, 785000.5)
        self.assertEqual(self.formulas["Detail"]["C4"].value, "=Summary!$B$6*B4")
        self.assertAlmostEqual(self.values["Detail"]["C4"].value, 235500.15)
        self.assertEqual(self.values["Summary"]["B9"].value, "Over cap")

    def test_missing_cached_value_is_none(self):
        import openpyxl

        workbook = openpyxl.load_workbook(fixture("uncalculated.xlsx"), data_only=True)
        self.assertIsNone(workbook["Calc"]["A3"].value)

    def test_shared_formulas_are_expanded_per_cell(self):
        import openpyxl

        sheet = openpyxl.load_workbook(fixture("shared-formulas.xlsx"), data_only=False)["Doubles"]
        self.assertEqual([sheet[f"B{r}"].value for r in range(1, 5)], [f"=A{r}*2" for r in range(1, 5)])
        # Sheet-qualified relative references shift; absolute parts do not.
        self.assertEqual([sheet[c].value for c in ("C1", "D1", "E1")],
                         ["=Rates!A1+$A$1", "=Rates!B1+$A$1", "=Rates!C1+$A$1"])
        self.assertEqual([sheet[c].value for c in ("F1", "F2")], ["='Rate Table'!$B1*A1", "='Rate Table'!$B2*A2"])
        cached = openpyxl.load_workbook(fixture("shared-formulas.xlsx"), data_only=True)["Doubles"]
        self.assertEqual([cached[c].value for c in ("B4", "E1", "F2")], [80, 13, 120])

    def test_pandas_reads_cached_values(self):
        import pandas

        frames = pandas.read_excel(fixture("budget.xlsx"), sheet_name=None, header=1)
        self.assertEqual(list(frames), ["Summary", "Detail", "Lookup"])
        self.assertEqual(frames["Summary"].set_index("Item").loc["Total", "Cost"], 785000.5)


class UnsupportedInputTest(unittest.TestCase):
    """The libraries and checker reject what the skills say not to relabel."""

    CASES = ["legacy.doc", "legacy.xls", "encrypted.xlsx", "zip-encrypted.xlsx", "truncated.docx", "document.odt"]

    def test_libraries_refuse(self):
        import docx
        import openpyxl

        for name in self.CASES:
            loader = openpyxl.load_workbook if name.endswith((".xls", ".xlsx")) else docx.Document
            with self.subTest(name), self.assertRaises(Exception):
                loader(fixture(name))

    def test_checker_reports_failure(self):
        for name in self.CASES + ["misnamed-spreadsheet.docx"]:
            with self.subTest(name):
                if name.endswith((".docx", ".pptx", ".xlsx")):
                    code, report = check(fixture(name))
                    self.assertEqual(code, 1)
                    self.assertEqual(report["verdict"], "fail")
                else:
                    # Other extensions are refused before reading, with advice not to rename.
                    result = check(fixture(name), raw=True)
                    self.assertEqual(result.returncode, 2)
                    self.assertIn("converting the filename does not convert its contents", result.stderr)


class CheckerTest(unittest.TestCase):
    """check_office.py: structure plus required text, including notes and headers."""

    def test_fixtures_pass_with_required_text(self):
        for name, args in {
            "report.docx": ["--contains", "35.2 PSU", "--contains", "Calibrated against the CSIRO reference probe",
                            "--contains", "CONFIDENTIAL DRAFT"],
            "briefing.pptx": ["--contains", "Pilbara", "--count", "5"],
            "budget.xlsx": ["--contains", "Vessel charter", "--contains", "Lookup", "--count", "3"],
            "charts.xlsx": ["--contains", "Trend"],
            "shared-formulas.xlsx": ["--contains", "Rate Table", "--count", "3"],
        }.items():
            with self.subTest(name):
                code, report = check(fixture(name), *args)
                self.assertEqual((code, report["verdict"]), (0, "pass"), report)

    def test_assertions_fail_when_text_or_count_is_wrong(self):
        code, report = check(fixture("briefing.pptx"), "--contains", "Not in the deck", "--count", "4")
        self.assertEqual(code, 1)
        self.assertEqual([c["status"] for c in report["checks"]], ["pass", "fail", "fail"])


def skill_examples(skill):
    with open(os.path.join(ASSETS, skill, "SKILL.md"), encoding="utf-8") as handle:
        return re.findall(r"```python\n(.*?)```", handle.read(), re.S)


class GenerationTest(unittest.TestCase):
    """Run each skill's own Python examples, then check and reopen the output."""

    def run_examples(self, skill, directory):
        examples = skill_examples(skill)
        self.assertTrue(examples, f"{skill} has no Python examples")
        for code in examples:
            result = subprocess.run([sys.executable, "-c", code], cwd=directory, capture_output=True, text=True, timeout=120)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_docx(self):
        import docx

        with tempfile.TemporaryDirectory() as directory:
            self.run_examples("office-docx", directory)
            path = os.path.join(directory, "report.docx")
            code, report = check(path, "--contains", "Project report", "--contains", "The requested findings go here.")
            self.assertEqual(code, 0, report)
            self.assertEqual(docx.Document(path).paragraphs[0].text, "Project report")

    def test_pptx(self):
        from pptx import Presentation

        with tempfile.TemporaryDirectory() as directory:
            self.run_examples("office-pptx", directory)
            path = os.path.join(directory, "report-edited.pptx")
            code, report = check(path, "--contains", "Quarterly results", "--count", "1")
            self.assertEqual(code, 0, report)
            chart = next(s for s in Presentation(path).slides[0].shapes if s.has_chart).chart
            self.assertEqual(list(chart.series[0].values), [12, 18])

    def test_xlsx(self):
        import openpyxl

        with tempfile.TemporaryDirectory() as directory:
            self.run_examples("office-xlsx", directory)
            path = os.path.join(directory, "report.xlsx")
            code, report = check(path, "--contains", "Revenue", "--count", "1")
            self.assertEqual(code, 0, report)
            self.assertEqual(openpyxl.load_workbook(path)["Revenue"]["B4"].value, "=SUM(B2:B3)")


class RenderingTest(unittest.TestCase):
    """The installed LibreOffice Kit CLI, invoked as the skills instruct."""

    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        cls.work = cls.directory.name

    @classmethod
    def tearDownClass(cls):
        cls.directory.cleanup()

    def test_capabilities(self):
        capabilities = kit("capabilities", "--json")
        self.assertEqual(capabilities["runtime"]["backend"], "wasm")
        self.assertEqual(os.path.realpath(capabilities["runtime"]["cliPath"]), os.path.realpath(KIT_CLI))
        self.assertTrue(capabilities["recalculation"]["preservesFormulas"])

    def test_render_document_slides_and_worksheet_range(self):
        for name, args, count in [
            ("report.docx", ["--pages", "1"], 1),
            ("briefing.pptx", ["--pages", "3,4"], 2),
            ("budget.xlsx", ["--sheet", "Summary", "--range", "A1:C9"], 1),
        ]:
            with self.subTest(name):
                output = os.path.join(self.work, "preview-" + name.replace(".", "-"))
                manifest = kit("render", "--input", fixture(name), "--output-dir", output, "--dpi", "72", *args)
                self.assertEqual(len(manifest["images"]), count)
                self.assertIsInstance(manifest["missingFonts"], list)
                for image in manifest["images"]:
                    assert_not_blank(self, image["path"])

    def test_convert_to_pdf(self):
        output = os.path.join(self.work, "briefing.pdf")
        result = kit("convert", "--input", fixture("briefing.pptx"), "--output", output)
        self.assertEqual(result["outputPath"], output)
        with open(output, "rb") as handle:
            self.assertEqual(handle.read(5), b"%PDF-")

    def test_strict_workbook_needs_kit_conversion_before_openpyxl(self):
        """openpyxl cannot open ISO Strict workbooks; the checker and the kit can."""
        import openpyxl

        strict = fixture("strict-shared-formulas.xlsx")
        with self.assertRaises(Exception):
            openpyxl.load_workbook(strict)["Doubles"]
        code, report = check(strict, "--contains", "Rate Table")
        self.assertEqual((code, report["verdict"]), (0, "pass"), report)
        output = os.path.join(self.work, "transitional.xlsx")
        kit("convert", "--input", strict, "--output", output)
        sheet = openpyxl.load_workbook(output, data_only=False)["Doubles"]
        self.assertEqual(sheet["E1"].value, "=Rates!C1+$A$1")
        self.assertEqual(openpyxl.load_workbook(output, data_only=True)["Doubles"]["F2"].value, 120)

    def test_recalculate_refreshes_cached_values_and_keeps_formulas(self):
        import openpyxl

        output = os.path.join(self.work, "recalculated.xlsx")
        kit("recalculate", "--input", fixture("uncalculated.xlsx"), "--output", output)
        self.assertEqual(openpyxl.load_workbook(output, data_only=False)["Calc"]["A3"].value, "=A1*A2")
        self.assertEqual(openpyxl.load_workbook(output, data_only=True)["Calc"]["A3"].value, 6)
        with zipfile.ZipFile(fixture("uncalculated.xlsx")) as original:
            self.assertNotIn(b"<v>6</v>", original.read("xl/worksheets/sheet1.xml"))



class KitLockTest(unittest.TestCase):
    """The wrapper admits one LibreOffice Kit command at a time; each peaks near 1.2 GiB."""

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.work = self.directory.name
        self.env = {**os.environ, "MAGDA_LIBREOFFICE_KIT_LOCK": os.path.join(self.work, "locks", "kit.lock")}

    def start(self, *args, **env):
        return subprocess.Popen([NODE, CLI, *args], cwd=self.work, env={**self.env, **env},
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    def hold_lock(self):
        import fcntl

        os.makedirs(os.path.dirname(self.env["MAGDA_LIBREOFFICE_KIT_LOCK"]), exist_ok=True)
        handle = open(self.env["MAGDA_LIBREOFFICE_KIT_LOCK"], "a")
        fcntl.flock(handle, fcntl.LOCK_EX)
        return handle

    def test_render_waits_for_another_kit_command_then_runs(self):
        holder = self.hold_lock()
        output = os.path.join(self.work, "preview")
        render = self.start("render", "--input", fixture("report.docx"), "--output-dir", output, "--pages", "1", "--dpi", "72")
        with self.assertRaises(subprocess.TimeoutExpired):
            render.wait(timeout=3)
        self.assertFalse(os.path.exists(output), "render ran while another Kit command held the lock")
        holder.close()
        stdout, stderr = render.communicate(timeout=300)
        self.assertEqual(render.returncode, 0, stderr)
        self.assertIn("waiting for another LibreOffice Kit command", stderr)
        self.assertEqual(len(json.loads(stdout)["images"]), 1)

    def test_capabilities_does_not_wait(self):
        holder = self.hold_lock()
        self.addCleanup(holder.close)
        capabilities = self.start("capabilities", "--json")
        stdout, _ = capabilities.communicate(timeout=60)
        self.assertEqual(capabilities.returncode, 0)
        self.assertEqual(json.loads(stdout)["runtime"]["backend"], "wasm")

    def test_kit_errors_and_exit_codes_pass_through(self):
        args = ["convert", "--input", os.path.join(self.work, "missing.docx"), "--output", os.path.join(self.work, "out.pdf")]
        wrapped = subprocess.run([NODE, CLI, *args], cwd=self.work, env=self.env, capture_output=True, text=True, timeout=120)
        direct = subprocess.run([NODE, KIT_CLI, *args], cwd=self.work, env=self.env, capture_output=True, text=True, timeout=120)
        self.assertNotEqual(direct.returncode, 0)
        self.assertEqual((wrapped.returncode, wrapped.stdout), (direct.returncode, direct.stdout))

    def long_document(self):
        import docx

        path = os.path.join(self.work, "long.docx")
        document = docx.Document()
        for page in range(60):
            document.add_heading(f"Page {page}", level=1)
            document.add_paragraph("Rendering load text. " * 120)
            document.add_page_break()
        document.save(path)
        return path

    def kit_processes(self, marker):
        """PIDs whose command line names this test's unique output directory."""
        found = []
        for entry in os.listdir("/proc"):
            if not entry.isdigit():
                continue
            try:
                with open(f"/proc/{entry}/cmdline", "rb") as handle:
                    if marker.encode() in handle.read():
                        found.append(int(entry))
            except OSError:
                continue
        return found

    def assert_cancel_releases_lock(self, cancel, new_session):
        import fcntl
        import signal
        import time

        output = os.path.join(self.work, "cancelled-preview")
        # Discard output: a surviving Kit process would otherwise keep the pipes open.
        render = subprocess.Popen([NODE, CLI, "render", "--input", self.long_document(), "--output-dir", output, "--dpi", "150"],
                                  cwd=self.work, env=self.env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                  start_new_session=new_session)
        deadline = time.monotonic() + 30
        while not [pid for pid in self.kit_processes(output) if pid != render.pid] and time.monotonic() < deadline:
            time.sleep(0.1)
        time.sleep(1)
        self.assertIsNone(render.poll(), "render finished before it could be cancelled")
        cancel(render, signal.SIGTERM)
        render.wait(timeout=30)
        deadline = time.monotonic() + 3
        while self.kit_processes(output) and time.monotonic() < deadline:
            time.sleep(0.1)
        self.assertEqual(self.kit_processes(output), [], "a cancelled Kit command kept running")
        # The lock is free at once, not only after a surviving render would have finished.
        with open(self.env["MAGDA_LIBREOFFICE_KIT_LOCK"], "a") as handle:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)

    def test_terminating_the_wrapper_stops_the_kit_and_releases_the_lock(self):
        self.assert_cancel_releases_lock(lambda process, signal: process.send_signal(signal), new_session=False)

    def test_terminating_the_process_group_stops_the_kit_and_releases_the_lock(self):
        # DSH's Bash tool signals the command's process group.
        self.assert_cancel_releases_lock(lambda process, signal: os.killpg(process.pid, signal), new_session=True)

    def test_wait_is_bounded(self):
        holder = self.hold_lock()
        self.addCleanup(holder.close)
        render = self.start("recalculate", "--input", fixture("uncalculated.xlsx"), "--output", os.path.join(self.work, "r.xlsx"),
                            MAGDA_LIBREOFFICE_KIT_LOCK_TIMEOUT_SECONDS="2")
        stdout, stderr = render.communicate(timeout=60)
        self.assertEqual(render.returncode, 75, stderr)
        self.assertEqual(json.loads(stdout)["code"], "busy")
        self.assertFalse(os.path.exists(os.path.join(self.work, "r.xlsx")))


if __name__ == "__main__":
    unittest.main()
