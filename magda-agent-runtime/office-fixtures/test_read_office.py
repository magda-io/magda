#!/usr/bin/env python3
"""Tests for the bundled magda-builtin-read-office-documents extractor.

Standard library only. Runs on a developer machine and, during the image
build, as the runtime user against the image's own system Python:

    python3 -m unittest discover -s office-fixtures -p 'test_*.py'

Set READ_OFFICE to test a script other than the one in this checkout.
"""

import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.environ.get("READ_OFFICE") or os.path.join(
    HERE, "..", "skills", "magda-builtin-read-office-documents", "scripts", "read_office.py"
)


def fixture(name):
    return os.path.join(HERE, name)


def run(*args):
    result = subprocess.run(
        [sys.executable, SCRIPT, *args], capture_output=True, text=True, timeout=60
    )
    return result.returncode, result.stdout, result.stderr


def read_json(*args):
    code, stdout, stderr = run("--json", *args)
    records = [json.loads(line) for line in stdout.splitlines() if line.strip()]
    return code, records, stderr


def write_zip(directory, name, parts, compression=zipfile.ZIP_DEFLATED):
    target = os.path.join(directory, name)
    with zipfile.ZipFile(target, "w", compression) as package:
        for part_name, data in parts.items():
            package.writestr(part_name, data)
    return target


W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def minimal_docx(body_xml):
    return {
        "[Content_Types].xml": (
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-'
            'officedocument.wordprocessingml.document.main+xml"/></Types>'
        ),
        "_rels/.rels": (
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f'<Relationship Id="rId1" Type="{R}/officeDocument" Target="word/document.xml"/>'
            "</Relationships>"
        ),
        "word/document.xml": f'<w:document xmlns:w="{W}"><w:body>{body_xml}</w:body></w:document>',
    }


class DocxTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        code, cls.text, stderr = run(fixture("report.docx"))
        assert code == 0, stderr

    def test_body_paragraphs_and_headings_are_located(self):
        self.assertIn("# Coastal Monitoring Report  ⟨body ¶1⟩", self.text)
        self.assertIn("## Summary  ⟨body ¶2⟩", self.text)
        self.assertIn(
            "Station BW-7 recorded a peak salinity of 35.2 PSU on 14 March 2026.[^fn1]  ⟨body ¶3⟩",
            self.text,
        )

    def test_style_based_bullets(self):
        self.assertIn("- Turbidity stayed below the 5 NTU trigger at every site.", self.text)

    def test_tables_nested_tables_and_merges(self):
        self.assertIn("| Site | Samples | Lead scientist |", self.text)
        self.assertIn("| North Reef | 42 | Dr Amara Okafor / [nested table .1] |", self.text)
        self.assertIn("**Table 1.1** nested in Table 1 row 2, column 3", self.text)
        self.assertIn("| Replicate A | 7.81 |", self.text)
        self.assertIn("| Total | 79 samples in total | ← |", self.text)

    def test_headers_footers_footnotes_comments(self):
        self.assertIn("CONFIDENTIAL DRAFT - Marine Division  ⟨header (default, section 1) ¶1⟩", self.text)
        self.assertIn("Cover page header  ⟨header (first, section 1) ¶1⟩", self.text)
        self.assertIn("Prepared by Field Operations  ⟨footer (default, section 1) ¶1⟩", self.text)
        self.assertIn("[^fn1]: Calibrated against the CSIRO reference probe in February 2026.", self.text)
        self.assertIn("[comment 0] Priya Natarajan: Check the Eastern Shoal budget first.", self.text)

    def test_summary_counts(self):
        _, records, _ = read_json(fixture("report.docx"))
        summary = records[0]
        self.assertEqual(summary["status"], "ok")
        self.assertEqual(summary["format"], "DOCX")
        self.assertEqual(summary["tables"], 1)
        self.assertEqual(summary["footnotes"], 1)
        self.assertEqual(summary["comments"], 1)
        self.assertEqual(summary["properties"]["title"], "Coastal Monitoring Report")

    def test_tracked_changes_text_boxes_and_alternate_content(self):
        body = (
            "<w:p><w:r><w:t>Budget is </w:t></w:r>"
            "<w:del><w:r><w:delText>$10</w:delText></w:r></w:del>"
            "<w:ins><w:r><w:t>$12</w:t></w:r></w:ins></w:p>"
            '<w:p><w:r><mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">'
            '<mc:Choice Requires="wps"><w:drawing><wp:docPr xmlns:wp="x" id="1" name="Box" descr="Site map"/>'
            "<w:txbxContent><w:p><w:r><w:t>Boxed note</w:t></w:r></w:p></w:txbxContent></w:drawing></mc:Choice>"
            "<mc:Fallback><w:pict><w:txbxContent><w:p><w:r><w:t>Boxed note</w:t></w:r></w:p>"
            "</w:txbxContent></w:pict></mc:Fallback></mc:AlternateContent></w:r></w:p>"
        )
        with tempfile.TemporaryDirectory() as directory:
            code, stdout, _ = run(write_zip(directory, "changes.docx", minimal_docx(body)))
        self.assertEqual(code, 0)
        self.assertIn("Budget is $12", stdout)
        self.assertNotIn("$10", stdout)
        self.assertEqual(stdout.count("Boxed note"), 1)
        self.assertIn("[image: Site map]", stdout)
        self.assertIn("tracked changes", stdout)


class PptxTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        code, cls.text, stderr = run(fixture("briefing.pptx"))
        assert code == 0, stderr

    def test_slides_titles_and_levels(self):
        self.assertIn("## Slide 1\nTitle: Field Season Briefing\n- Prepared for the Steering Committee", self.text)
        self.assertIn("- Expand sampling to three new estuaries\n  - Hawkesbury, Clarence and Richmond", self.text)

    def test_notes_tables_groups_and_charts(self):
        self.assertIn("Speaker notes: Remind the committee that budget approval is due 30 June.", self.text)
        self.assertIn("| Pilbara | 1,250,000 |", self.text)
        self.assertIn("- Figures exclude GST", self.text)
        self.assertIn("Chart: Samples by quarter (barChart)", self.text)
        self.assertIn("series Samples: Q1=120, Q2=135, Q3=160, Q4=98", self.text)

    def test_hidden_slide_is_marked(self):
        self.assertIn("## Slide 5 (hidden)\nTitle: Contingency", self.text)

    def test_slide_selection(self):
        code, stdout, _ = run("--slides", "2", fixture("briefing.pptx"))
        self.assertEqual(code, 0)
        self.assertIn("## Slide 2", stdout)
        self.assertNotIn("## Slide 3", stdout)


class XlsxTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        code, cls.text, stderr = run(fixture("budget.xlsx"))
        assert code == 0, stderr

    def test_sheets_including_hidden(self):
        self.assertIn('Sheets: "Summary", "Detail", "Lookup" (hidden)', self.text)
        self.assertIn('## Sheet "Lookup" (hidden)', self.text)

    def test_cached_values_types_and_dates(self):
        self.assertIn("| 3 | Vessel charter | 250000 | TRUE |", self.text)
        self.assertIn("| 4 | Sensors | 125000.5 | FALSE |", self.text)
        self.assertIn("| 8 | Review date | 2026-03-31 |  |", self.text)
        self.assertIn("Merged ranges: A1:C1", self.text)

    def test_formula_expression_and_cached_value_are_distinct(self):
        self.assertIn("- B6: =SUM(B3:B5) → 785000.5", self.text)
        self.assertIn('- B9: =IF(B6>700000,"Over cap","Within cap") → Over cap', self.text)
        self.assertIn("- C2: =Summary!$B$6*B2 → 196250.125", self.text)

    def test_cell_comments(self):
        self.assertIn("- B6 Finance: Includes GST-free items only", self.text)

    def test_missing_cached_value_is_reported(self):
        code, stdout, _ = run(fixture("uncalculated.xlsx"))
        self.assertEqual(code, 0)
        self.assertIn("- A3: =A1*A2 → (no cached value", stdout)
        self.assertIn("1 formula cells have no cached value", stdout)

    def test_strict_namespace_and_shared_formulas(self):
        code, stdout, _ = run(fixture("strict-shared-formulas.xlsx"))
        self.assertEqual(code, 0)
        for row in range(1, 5):
            self.assertIn(f"- B{row}: =A{row}*2 → {row * 20}", stdout)

    def test_embedded_charts_and_chart_sheets(self):
        code, stdout, _ = run(fixture("charts.xlsx"))
        self.assertEqual(code, 0)
        self.assertIn("Chart: Visits by quarter (lineChart)", stdout)
        self.assertIn('## Chart sheet "Trend"\nChart (barChart)', stdout)
        self.assertEqual(stdout.count("series Visits: Q1=5, Q2=7, Q3=9"), 2)

    def test_sheet_and_range_selection(self):
        code, stdout, _ = run("--sheet", "Detail", "--range", "A2:C3", fixture("budget.xlsx"))
        self.assertEqual(code, 0)
        self.assertIn("| 2 | Q1 | 0.25 | 196250.125 |", stdout)
        self.assertNotIn("| 4 |", stdout)
        self.assertNotIn('## Sheet "Summary"', stdout)
        code, _, stderr = run("--sheet", "Nope", fixture("budget.xlsx"))
        self.assertNotEqual(code, 0)
        self.assertIn("no sheet named", stderr)

    def test_large_sheet_is_streamed_within_a_window(self):
        main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        rows = "".join(
            f'<row r="{r}"><c r="A{r}"><v>{r}</v></c><c r="B{r}"><f>A{r}*2</f><v>{r * 2}</v></c></row>'
            for r in range(1, 20001)
        )
        parts = {
            "[Content_Types].xml": (
                '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-'
                'officedocument.spreadsheetml.sheet.main+xml"/></Types>'
            ),
            "_rels/.rels": (
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                f'<Relationship Id="rId1" Type="{R}/officeDocument" Target="xl/workbook.xml"/></Relationships>'
            ),
            "xl/workbook.xml": (
                f'<workbook xmlns="{main}" xmlns:r="{R}"><sheets>'
                '<sheet name="Big" sheetId="1" r:id="rId1"/></sheets></workbook>'
            ),
            "xl/_rels/workbook.xml.rels": (
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                f'<Relationship Id="rId1" Type="{R}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
            ),
            "xl/worksheets/sheet1.xml": f'<worksheet xmlns="{main}"><sheetData>{rows}</sheetData></worksheet>',
        }
        with tempfile.TemporaryDirectory() as directory:
            path = write_zip(directory, "big.xlsx", parts)
            code, stdout, _ = run("--max-rows", "10", path)
            self.assertEqual(code, 0)
            self.assertIn("Used range: A1:B20000; 40000 non-empty cells", stdout)
            self.assertIn("| 10 | 10 | 20 |", stdout)
            self.assertNotIn("| 11 | 11 |", stdout)
            self.assertIn("- B20: =A20*2 → 40", stdout)
            self.assertIn("[19980 more formulas not listed; use --range]", stdout)
            code, stdout, _ = run("--range", "A19999:B20000", path)
            self.assertIn("| 20000 | 20000 | 40000 |", stdout)
            self.assertIn("- B19999: =A19999*2 → 39998", stdout)

    def test_grid_limits_are_announced(self):
        code, stdout, _ = run("--max-rows", "2", fixture("budget.xlsx"))
        self.assertEqual(code, 0)
        self.assertIn("[Grid limited to 2 rows", stdout)


class FormatIdentificationTest(unittest.TestCase):
    def assert_unsupported(self, name, expected):
        code, records, _ = read_json(fixture(name))
        self.assertEqual(code, 1)
        self.assertEqual(records[0]["status"], "unsupported")
        self.assertIn(expected, records[0]["error"])
        self.assertEqual(records[0]["content"], "")

    def test_legacy_binary_formats(self):
        self.assert_unsupported("legacy.doc", "legacy Word 97-2003")
        self.assert_unsupported("legacy.xls", "legacy Excel 97-2003")

    def test_password_protected(self):
        self.assert_unsupported("encrypted.xlsx", "password-protected")
        self.assert_unsupported("zip-encrypted.xlsx", "ZIP-level encryption")

    def test_corrupt_and_foreign(self):
        self.assert_unsupported("truncated.docx", "corrupt or truncated")
        self.assert_unsupported("document.odt", "OpenDocument")
        self.assert_unsupported("generate_fixtures.py", "not a ZIP-based")

    def test_content_not_extension_decides(self):
        code, stdout, _ = run(fixture("misnamed-spreadsheet.docx"))
        self.assertEqual(code, 0)
        self.assertIn('"format": "XLSX"', stdout)
        self.assertIn("File name ends in .docx but its content is XLSX", stdout)

    def test_missing_file_and_mixed_batch(self):
        code, records, _ = read_json(fixture("report.docx"), fixture("absent.docx"))
        self.assertEqual(code, 1)
        self.assertEqual([r["status"] for r in records], ["ok", "error"])

    def test_dtd_is_refused(self):
        body = '<?xml version="1.0"?><!DOCTYPE lol [<!ENTITY a "aaaa">]><w:document xmlns:w="%s"/>' % W
        parts = minimal_docx("")
        parts["word/document.xml"] = body
        with tempfile.TemporaryDirectory() as directory:
            code, records, _ = read_json(write_zip(directory, "dtd.docx", parts))
        self.assertEqual(records[0]["status"], "unsupported")
        self.assertIn("DTD", records[0]["error"])

    def test_decompression_bomb_and_size_limits(self):
        parts = minimal_docx("<w:p><w:r><w:t>" + "A" * (12 * 1024 * 1024) + "</w:t></w:r></w:p>")
        with tempfile.TemporaryDirectory() as directory:
            bomb = write_zip(directory, "bomb.docx", parts)
            _, records, _ = read_json(bomb)
            self.assertIn("suspicious compression ratio", records[0]["error"])
            _, records, _ = read_json("--max-input-bytes", "100", bomb)
            self.assertIn("larger than 100 bytes", records[0]["error"])
            _, records, _ = read_json("--max-part-bytes", "1000", fixture("report.docx"))
            self.assertIn("per-part limit", records[0]["error"])

    def test_output_truncation(self):
        code, stdout, _ = run("--max-chars", "300", fixture("report.docx"))
        self.assertEqual(code, 0)
        self.assertIn("[Output truncated at 300 characters", stdout)

    def test_out_file(self):
        with tempfile.TemporaryDirectory() as directory:
            target = os.path.join(directory, "extract.md")
            code, stdout, _ = run("--out", target, fixture("briefing.pptx"))
            self.assertEqual(code, 0)
            self.assertIn("Wrote", stdout)
            with open(target, encoding="utf-8") as handle:
                self.assertIn("Speaker notes:", handle.read())

    def test_input_is_never_modified(self):
        with open(fixture("budget.xlsx"), "rb") as handle:
            before = handle.read()
        run(fixture("budget.xlsx"))
        with open(fixture("budget.xlsx"), "rb") as handle:
            self.assertEqual(handle.read(), before)


if __name__ == "__main__":
    unittest.main()
