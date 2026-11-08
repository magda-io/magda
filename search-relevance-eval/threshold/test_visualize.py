"""Invented computed-row fixtures only; no model, corpus, ranks or provenance."""
import copy
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import xml.etree.ElementTree as ET

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("threshold_visualize_test_subject", HERE / "visualize.py")
vis = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vis)
NS = {"s": "http://www.w3.org/2000/svg"}


def populations():
    return dict(before_target_embeddings_and_scores=True,
                status="descriptive_only_not_new_primary_or_promotion_gate",
                common_fully_known_heldout_semantic_intents_all_three_seeds=list(vis.COMMON))


def fake_report():
    """Not measured output. Every number is hand-selected test data."""
    report = dict(schema_version=1, analysis_mode="forced_D_nonpromotional",
                  diagnostic_policy={}, decision={"recommendation": "A"},
                  per_family=[], per_query=[], contrasts=[], native_score_distributions=[],
                  false_positive_exposures=[], latency=[], new_uncertainty_sensitivity=[])
    for seed in vis.SEEDS:
        for size in vis.SIZES:
            for i, system in enumerate((*vis.SYSTEMS, "topk10")):
                for intent in vis.FAMILIES:
                    value = None if intent in ("t03", "t08") else .4 + i * .01
                    report["per_family"].append(dict(cohort="NEW", seed=seed, size=size,
                        system=system, split="heldout", intent_id=intent, complete=True,
                        query_ids=["invented-a", "invented-b", "invented-c"],
                        **{m: value for m, _ in vis.METRICS}))
                if system not in ("ms_050", "topk10"):
                    report["contrasts"].append(dict(seed=seed, size=size, system=system,
                        split="heldout", paired_deltas={m: None for m, _ in vis.METRICS}))
                for q in range(8):
                    report["per_query"].append(dict(cohort="NEW", seed=seed, size=size,
                        system=system, split="heldout", query_id="invented-negative-" + str(q),
                        kind="negative_unrelated" if q < 4 else "negative_or_lookalike",
                        grade0_count_top5=3, grade0_count_top10=4))
                    if system not in ("ms_050", "topk10"):
                        report["false_positive_exposures"].append(dict(seed=seed, size=size,
                            system=system, split="heldout", query_id="invented-negative-" + str(q),
                            kind="negative_unrelated" if q < 4 else "negative_or_lookalike",
                            baseline_grade0_top5=3, candidate_grade0_top5=3,
                            baseline_grade0_top10=4, candidate_grade0_top10=4,
                            new_grade0_top5=1, new_grade0_top10=1,
                            new_grade0_ids_top5=["invented-new"], new_grade0_ids_top10=["invented-new"]))
                report["latency"].append(dict(seed=seed, size=size, system=system,
                    group="heldout_exact", n=90, median_ms=10 + i, p95_ms=20 + i,
                    guard_eligible=False, complete=True, expected_queries=["invented-exact"]))
        for path in ("root", "max_authorized_child"):
            for grade in ("0", "1", "2", "3", "U"):
                counts = [0] * 50
                counts[20] = 1
                report["native_score_distributions"].append(dict(cohort="NEW", seed=seed,
                    size=2000, query_kind="semantic", split="heldout", dataset_grade=grade,
                    score_path=path, n=1, missing=2, bin_edges=[i / 50 for i in range(51)],
                    bin_counts=counts, conditional_density=[count * 50 for count in counts],
                    cdf=[dict(score=i / 50, fraction=0 if i <= 20 else 1) for i in range(51)]))
    report["new_uncertainty_sensitivity"].append(dict(cohort="NEW", seed=vis.SEEDS[0], size=2000,
        bounds=[dict(system=sy, split="heldout", metric=m, minimum=.2, maximum=.8)
                for sy in vis.SYSTEMS for m, _ in vis.METRICS]))
    return report


class VisualizeTests(unittest.TestCase):
    def setUp(self):
        self.report = fake_report()
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.out = Path(self.temp.name) / "charts"

    def render(self, **kwargs):
        return vis.render_report(self.report, self.out, descriptive_populations=populations(), **kwargs)

    def test_exclusive_five_documents_valid_xml_no_report_mutation(self):
        before = copy.deepcopy(self.report)
        with mock.patch.object(vis._analysis, "score_query", side_effect=AssertionError("not a plot operation")):
            paths = self.render()
        self.assertEqual(5, len(paths))
        for path in paths:
            root = ET.parse(path).getroot()
            self.assertEqual("{http://www.w3.org/2000/svg}svg", root.tag)
            text = " ".join(root.itertext())
            self.assertIn("Diagnostic only; recommendation D; not production evidence", text)
            self.assertNotIn("recommendation A", text)
        self.assertEqual(before, self.report)
        original = {p: p.read_bytes() for p in paths}
        with self.assertRaises(FileExistsError):
            self.render()
        self.assertEqual(original, {p: p.read_bytes() for p in paths})

    def test_common_four_not_per_seed_five_and_full_six_null(self):
        panels, common = vis._sweep(self.report, populations())
        self.assertTrue(common)
        self.assertEqual(6, len(panels))
        with mock.patch.object(vis, "_panel", return_value=("", 1)) as panel:
            vis._sweep(self.report, populations())
        lines = panel.call_args_list[0].args[2]
        self.assertEqual([None] * 7, lines[0]["values"])
        self.assertEqual([.4 + i * .01 for i in range(7)], lines[1]["values"])
        text = (self.render()[0]).read_text()
        self.assertIn(vis.COMMON_LABEL, text)
        self.assertIn("full six", text)
        self.assertIn("Full six-family metrics: N/A in all 9 seed/size cases (U)", text)
        self.assertNotIn("N/A 7/7 (gaps)", text)
        self.assertIn("not CI", text)
        self.assertIn("Full-six plausible sensitivity; not a statistical CI", text)

    def test_compact_legend_keeps_all_source_series_and_sensitivity(self):
        with mock.patch.object(vis, "_panel", return_value=("", 1)) as panel:
            vis._sweep(self.report, populations())
        call = panel.call_args_list[0]
        lines = call.args[2]
        self.assertEqual(18, len(lines))
        self.assertEqual(9, sum(s.get("legend", True) for s in lines))
        self.assertTrue(all(s["values"] == [None] * 7 for s in lines[::2]))
        self.assertTrue(any(any(b is not None for b in s["bounds"]) for s in lines[::2]))
        self.assertEqual(3, call.kwargs["legend_columns"])
        self.assertFalse(call.kwargs["legend_topk"])
        self.assertEqual("n=60 · seed38871", lines[1]["legend_label"])
        root = ET.fromstring('<svg xmlns="http://www.w3.org/2000/svg">' + vis._sweep(self.report, populations())[0][0][0] + '</svg>')
        self.assertEqual(63, len(root.findall("s:circle", NS)))
        self.assertTrue(root.findall("s:polygon", NS))
        # Topk numeric values stay in accessible marker titles, not repeated legends.
        self.assertIn("separate topk10", " ".join(root.itertext()))

    def test_partial_full_six_never_collapsed_as_all_na(self):
        for row in self.report["per_family"]:
            if row["seed"] == vis.SEEDS[0] and row["size"] == 60 and row["system"] == "ms_050":
                for metric, _ in vis.METRICS:
                    row[metric] = .5
        with mock.patch.object(vis, "_panel", return_value=("", 1)) as panel:
            vis._sweep(self.report, populations())
        call = panel.call_args_list[0]
        self.assertIsNone(call.kwargs["legend_note"])
        self.assertTrue(all(s.get("legend", True) for s in call.args[2]))
        self.assertEqual(1, call.kwargs["legend_columns"])

    def test_partial_common_four_keeps_visible_na_and_single_column(self):
        for row in self.report["per_family"]:
            if row["seed"] == vis.SEEDS[0] and row["size"] == 60 and row["system"] == "ms_048" and row["intent_id"] == "t04":
                row[vis.METRICS[0][0]] = None
        with mock.patch.object(vis, "_panel", return_value=("", 1)) as panel:
            vis._sweep(self.report, populations())
        self.assertEqual(1, panel.call_args_list[0].kwargs["legend_columns"])
        body = vis._sweep(self.report, populations())[0][0][0]
        self.assertIn("N/A 1/7 (gaps)", body)

    def test_without_population_never_silently_drop_unknown_families(self):
        with mock.patch.object(vis, "_panel", return_value=("", 1)) as panel:
            vis._sweep(self.report, None)
        self.assertEqual(9, len(panel.call_args_list[0].args[2]))
        self.assertTrue(all(s["values"] == [None] * 7 for s in panel.call_args_list[0].args[2]))

    def test_per_seed_known_five_rejected(self):
        p = populations()
        p["common_fully_known_heldout_semantic_intents_all_three_seeds"].append("t08")
        with self.assertRaises(ValueError):
            vis.render_report(self.report, self.out, descriptive_populations=p)
        self.assertFalse(self.out.exists())

    def test_missing_common_family_is_null_not_known_only_mean(self):
        self.report["per_family"] = [r for r in self.report["per_family"] if not
            (r["seed"] == vis.SEEDS[0] and r["size"] == 60 and r["system"] == "ms_048" and r["intent_id"] == "t04")]
        with mock.patch.object(vis, "_panel", return_value=("", 1)) as panel:
            vis._sweep(self.report, populations())
        self.assertIsNone(panel.call_args_list[0].args[2][1]["values"][1])

    def test_null_points_split_lines_never_connect_or_zero(self):
        body, _ = vis._panel("Null test", "invented", [vis._series("partial", [.1, None, .3, .4, None, None, .2], "#265a9e")])
        root = ET.fromstring('<svg xmlns="http://www.w3.org/2000/svg">' + body + '</svg>')
        segments = root.findall("s:polyline", NS)
        self.assertEqual([1, 2, 1], [len(p.attrib["points"].split()) for p in segments])
        self.assertIn("N/A 3/7 (gaps)", body)
        self.assertEqual(4, len(root.findall("s:circle", NS)))

    def test_native_focus_six_panels_each_no_repooling(self):
        other = copy.deepcopy(self.report["native_score_distributions"][0])
        other.update(size=60, n=999, bin_counts=[999] + [0] * 49,
                     conditional_density=[50] + [0] * 49)
        self.report["native_score_distributions"].append(other)
        panels = vis._scores(self.report)
        self.assertEqual(6, len(panels["PDF"]))
        self.assertEqual(6, len(panels["CDF"]))
        self.assertNotIn("n=999", "".join(p for p, _ in panels["PDF"]))
        text = "".join(p for p, _ in panels["PDF"])
        self.assertIn("dataset grade U", text)
        self.assertIn("n=1 missing=2", text)
        self.assertIn("native authorized-child max score", text)
        self.assertIn("not child relevance", text)
        self.assertEqual(7, len(vis._scores(self.report, full=True)["PDF"]))

    def test_native_pdf_uses_exact_bin_edges_not_evenly_spaced_endpoint_proxy(self):
        with mock.patch.object(vis, "_panel", return_value=("", 1)) as panel:
            vis._scores(self.report)
        pdf_line = panel.call_args_list[0].args[2][0]
        self.assertEqual([0, .02, .02, .04], pdf_line["xs"][:4])
        self.assertEqual([.98, 1], pdf_line["xs"][-2:])
        cdf_line = panel.call_args_list[1].args[2][0]
        self.assertEqual([i / 50 for i in range(51)], cdf_line["xs"])
        self.assertEqual([p["fraction"] for p in self.report["native_score_distributions"][5]["cdf"]], cdf_line["values"])

    def test_fixed_bins_and_duplicate_native_identity_rejected(self):
        self.report["native_score_distributions"][0]["bin_edges"][1] = .021
        with self.assertRaises(ValueError):
            self.render()
        self.assertFalse(self.out.exists())
        self.report = fake_report()
        self.report["native_score_distributions"].append(copy.deepcopy(self.report["native_score_distributions"][0]))
        with self.assertRaises(ValueError):
            self.render()

    def test_new_id_additions_are_not_net_fp_count_difference(self):
        with mock.patch.object(vis, "_panel", return_value=("", 1)) as panel:
            vis._false_positives(self.report)
        # Candidate absolute remains 3, but its analyzer-computed new-ID count is 1.
        self.assertEqual([3] * 7, panel.call_args_list[0].args[2][0]["values"])
        self.assertEqual([0] + [1] * 6, panel.call_args_list[1].args[2][0]["values"])

    def test_missing_fp_exposure_row_keeps_full_query_population_null(self):
        self.report["false_positive_exposures"].pop(0)
        with mock.patch.object(vis, "_panel", return_value=("", 1)) as panel:
            vis._false_positives(self.report)
        self.assertIsNone(panel.call_args_list[1].args[2][0]["values"][1])

    def test_n90_p95_retained_descriptive_no_guard(self):
        panels = vis._latency(self.report)
        text = "".join(p for p, _ in panels)
        self.assertIn("n=90 each", text)
        self.assertIn("NO guard", text)
        self.assertIn("descriptive p95", text)
        self.assertIn("n−1", text)
        with mock.patch.object(vis, "_panel", return_value=("", 1)) as panel:
            vis._latency(self.report)
        self.assertEqual([20 + i for i in range(7)], panel.call_args_list[1].args[2][0]["values"])
        self.report["latency"][0]["guard_eligible"] = True
        with self.assertRaises(ValueError):
            self.render()

    def test_missing_latency_row_null_gap_not_removed(self):
        self.report["latency"].pop(1)
        with mock.patch.object(vis, "_panel", return_value=("", 1)) as panel:
            vis._latency(self.report)
        vals = panel.call_args_list[0].args[2][0]["values"]
        self.assertEqual(7, len(vals))
        self.assertIsNone(vals[1])
        self.assertIn("N/A", panel.call_args_list[0].args[2][0]["label"])

    def test_html_is_escaped_and_no_script_nodes(self):
        for row in self.report["latency"]:
            row["group"] = 'invented <script>& "quotes"'
        paths = self.render()
        text = paths[-1].read_text()
        self.assertIn("&lt;script&gt;&amp; &quot;quotes&quot;", text)
        root = ET.parse(paths[-1]).getroot()
        self.assertEqual([], root.findall(".//s:script", NS))

    def test_bool_nan_inf_metrics_rejected_before_output(self):
        for invalid in (True, float("nan"), float("inf")):
            r = copy.deepcopy(self.report)
            next(row for row in r["per_family"] if row["intent_id"] == "t04")[vis.METRICS[0][0]] = invalid
            with self.assertRaises(ValueError):
                vis.render_report(r, self.out, descriptive_populations=populations())
            self.assertFalse(self.out.exists())

    def test_bad_histogram_and_latency_numbers_rejected(self):
        for key, value in (("n", True), ("missing", float("nan"))):
            r = copy.deepcopy(self.report)
            r["native_score_distributions"][0][key] = value
            with self.assertRaises(ValueError):
                vis.render_report(r, self.out)
        for value in (True, float("nan"), -1):
            r = copy.deepcopy(self.report)
            r["latency"][0]["n"] = value
            with self.assertRaises(ValueError):
                vis.render_report(r, self.out)

    def test_preflight_all_filenames_before_any_write(self):
        self.out.mkdir()
        (self.out / "latency.svg").write_text("do not overwrite")
        with self.assertRaises(FileExistsError):
            self.render()
        self.assertEqual(["latency.svg"], [p.name for p in self.out.iterdir()])
        self.assertEqual("do not overwrite", (self.out / "latency.svg").read_text())

    def test_full_distribution_pagination_max_six_panels(self):
        row = copy.deepcopy(self.report["native_score_distributions"][0])
        row["size"] = 60
        self.report["native_score_distributions"].append(row)
        paths = self.render(full_distributions=True)
        pdfs = [p for p in paths if p.name.startswith("native-score-pdf")]
        self.assertEqual(2, len(pdfs))
        for path in paths:
            root = ET.parse(path).getroot()
            self.assertLessEqual(len(root.findall("s:g", NS)), 6)

    def test_strict_mode_never_certifies_green_abc(self):
        self.report["diagnostic_policy"] = None
        self.report["analysis_mode"] = "strict_confirmatory"
        text = self.render()[0].read_text()
        self.assertIn("analyzer decisions not certified by this plotter", text)
        self.assertNotIn("recommendation A", text)

    def test_empty_report_has_explicit_na_panels(self):
        report = dict(schema_version=1)
        paths = vis.render_report(report, self.out)
        self.assertEqual(5, len(paths))
        for path in paths:
            text = " ".join(ET.parse(path).getroot().itertext())
            self.assertIn("N/A", text)


if __name__ == "__main__":
    unittest.main()
