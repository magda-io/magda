"""Offline tiny fakes only. DO NOT RUN during primary/mixed latency quiet windows."""
import copy
import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest import mock

SOURCE = Path(__file__).with_name("additional_eligibility.py")
spec = importlib.util.spec_from_file_location("threshold_additional_eligibility_tests", SOURCE)
col = importlib.util.module_from_spec(spec)
spec.loader.exec_module(col)
ex = col.execution


class AdditionalEligibilityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.repo = Path(self.tmp.name).resolve()
        self.root = self.repo / "search-relevance-eval/threshold"
        self.root.mkdir(parents=True)
        self.addCleanup(mock.patch.stopall)
        mock.patch.object(ex, "ROOT", self.root).start()
        mock.patch.object(ex, "REPO", self.repo).start()
        self.http = mock.patch.object(col.diag.replay, "request", side_effect=AssertionError("No live HTTP allowed")).start()
        self.artifacts = self.root / ".local/unit"
        self.args = SimpleNamespace(artifact_root=self.artifacts,
            output=self.artifacts / "additional-eligibility", diagnostic_approval=self.repo / "supplement.json",
            development_record=self.repo / "dev.json", engine_url="http://127.0.0.1:19200")
        self.case = {"cohort": "LEGACY", "seed": 39031, "catalog_size": 180,
                     "index": "magda-relevance-eval-unit"}
        self.original_approval = {"diagnostic_only": True, "forced_recommendation": "D", "promotion_allowed": False}

    def item(self, case=None, query_count=2):
        case = case or self.case
        ids = ["fake-query-%03d" % n for n in range(query_count)]
        exports = {label: {qid: {"query_id": qid, "config_sha": "a" * 64,
            "request": {"method": "POST", "path": "/" + case["index"] + "/_search",
                        "query_params": {"search_pipeline": "magda-datasets-hybrid-search"},
                        "body": {"size": 10, "query": {"fake_source": label, "qid": qid,
                                  "filters": {"format": "CSV"}}}}} for qid in ids}
                   for label in col.SYSTEMS + ["keyword"]}
        primary = {(qid, label): {"hits": [{"id": "primary-parent", "rank": 1}]}
                   for qid in ids for label in col.SYSTEMS}
        return {"case": case, "query_ids": ids, "exports": exports, "primary": primary,
                "query_ids_sha256": ex.digest(ids), "source_files_sha256": {"fake-source": "b" * 64}}

    def fake_full(self, engine, index, request, size, *, primary_ids, receipt_sink):
        receipt_sink({"request_sha256": "c" * 64, "parsed_json_sha256": "d" * 64,
                      "request_started_utc": "unit-start", "request_completed_utc": "unit-end"})
        return {"ids": ["primary-parent", "extra-parent"], "request_sha256": ex.digest(request),
                "primary_ids_missing_from_collector": []}

    def test_case_inventory_is_exact_and_never_new_or_outcome_selected(self):
        cases = [dict(cohort=c, seed=s, catalog_size=n) for c, s, n in col.CASE_IDENTITIES]
        self.assertEqual(col.fixed_cases({"cases": list(reversed(cases))}), cases)
        for bad in (cases[:-1], cases + [cases[0]], [dict(c, seed=0) for c in cases]):
            with self.assertRaises(ValueError):
                col.fixed_cases({"cases": bad})
        self.assertEqual(col.PROFILES, [.50, .48, .46, .45, .44, .42, .40])
        self.http.assert_not_called()

    def test_invalid_original_permission_has_no_output_or_backend(self):
        with mock.patch.object(ex, "verify_installation") as install, self.assertRaises(ValueError):
            col.collect(self.args, {"approval": {}})
        self.assertFalse(self.args.output.exists())
        install.assert_not_called()
        self.http.assert_not_called()

    def test_existing_root_is_never_retried_even_when_empty(self):
        self.args.output.mkdir(parents=True)
        with mock.patch.object(ex, "development_decision") as decision, self.assertRaises(ValueError):
            col.preconditions(self.args, {"approval": self.original_approval})
        decision.assert_not_called()
        self.http.assert_not_called()

    def test_wrong_supplement_rejected_before_geometry_or_outputs(self):
        with mock.patch.object(ex, "read_json", return_value={}), \
             mock.patch.object(col.replay, "sha", return_value="a" * 64), self.assertRaises(ValueError):
            col.supplemental_gate(self.args, {"inputs_sha256": "i", "approval_sha256": "a"}, self.artifacts)
        self.assertFalse(self.args.output.exists())
        self.http.assert_not_called()

    def test_keyword_reused_exactly_once_and_all_seven_sources_passed_unchanged(self):
        item = self.item()
        original = copy.deepcopy(item)
        streams = {name: io.StringIO() for name in ("receipts", "additional-eligibility")}
        with mock.patch.object(col.diag, "fetch_exhaustive", side_effect=self.fake_full) as full, \
             mock.patch.object(col.diag, "fetch_native", side_effect=AssertionError("No native probes")) as native:
            summary = col.collect_case(self.args, item, streams)
        self.assertEqual(full.call_count, 2 * 8)
        native.assert_not_called()
        for offset, qid in enumerate(item["query_ids"]):
            for arm, label in enumerate(["keyword"] + col.SYSTEMS):
                call = full.call_args_list[offset * 8 + arm]
                self.assertIs(call.args[2], item["exports"][label][qid]["request"])
                self.assertEqual(call.args[3], 180)
                self.assertEqual(call.kwargs["primary_ids"], [] if label == "keyword" else ["primary-parent"])
        self.assertEqual(item, original)
        rows = [json.loads(line) for line in streams["additional-eligibility"].getvalue().splitlines()]
        receipts = [json.loads(line) for line in streams["receipts"].getvalue().splitlines()]
        self.assertEqual(len(rows), 14)
        self.assertEqual(len(receipts), 16)
        self.assertEqual(summary["diagnostic_requests"], 16)
        self.assertTrue(summary["complete"])
        self.assertTrue(all(row["complete"] and row["hybrid_membership_is_approximate"] for row in rows))
        self.assertTrue(all("root_vector_ids" not in row and "nested_vector_ids" not in row for row in rows))
        self.assertTrue(all(r["auxiliary_HTTP_timing_not_primary_latency"] for r in receipts))

    def test_window_misses_persist_truthful_status_not_forged_ineligibility(self):
        item = self.item(query_count=1)
        streams = {name: io.StringIO() for name in ("receipts", "additional-eligibility")}
        def missed(*args, **kwargs):
            result = self.fake_full(*args, **kwargs)
            if kwargs["primary_ids"]:
                result.update(ids=[], primary_ids_missing_from_collector=["primary-parent"])
            return result
        with mock.patch.object(col.diag, "fetch_exhaustive", side_effect=missed):
            summary = col.collect_case(self.args, item, streams)
        self.assertFalse(summary["complete"])
        self.assertEqual(summary["capture_status"], "complete_capture_with_window_discrepancies")
        rows = [json.loads(line) for line in streams["additional-eligibility"].getvalue().splitlines()]
        self.assertTrue(all(row["complete"] and not row["source_primary_top10_subset"] for row in rows))
        self.assertTrue(all(row["primary_ids_missing_from_full_collector"] == ["primary-parent"] for row in rows))
        self.assertEqual(len(summary["window_discrepancies"]), 7)

    def test_complete_binds_240_cases_1680_rows_1920_receipts(self):
        prepared = [self.item(dict(cohort=c, seed=s, catalog_size=n,
                                  index="magda-relevance-eval-unit-%s" % s), 75 if c == "LEGACY" else 15)
                    for c, s, n in col.CASE_IDENTITIES]
        self.artifacts.mkdir(parents=True)
        geometry = self.artifacts / "geometry/complete.json"
        approved = {"original_geometry_completion_sha256": "f" * 64}
        args = self.args
        verified = {"inputs_sha256": "i" * 64, "approval_sha256": "a" * 64}
        with mock.patch.object(col, "preconditions", return_value=(self.artifacts, args.output, approved, geometry, prepared)), \
             mock.patch.object(ex, "verify_installation"), \
             mock.patch.object(col.replay, "sha", return_value="e" * 64), \
             mock.patch.object(col.diag, "fetch_exhaustive", side_effect=self.fake_full) as full:
            col.collect(args, verified)
        complete = json.loads((args.output / "complete.json").read_text())
        self.assertEqual(full.call_count, 1920)
        self.assertEqual(complete["task_case_count"], 240)
        self.assertEqual(complete["row_count"], 1680)
        self.assertEqual(complete["diagnostic_request_count"], 1920)
        self.assertTrue(complete["complete"])
        self.assertEqual(len(complete["files_sha256"]), 2)
        self.assertEqual(len((args.output / "additional-eligibility.jsonl").read_text().splitlines()), 1680)
        self.assertEqual(len((args.output / "receipts.jsonl").read_text().splitlines()), 1920)
        self.http.assert_not_called()

    def test_failed_request_retains_receipt_and_no_completion_or_retry(self):
        item = self.item(query_count=1)
        self.artifacts.mkdir(parents=True)
        verified = {"inputs_sha256": "i", "approval_sha256": "a"}
        def failure(*args, **kwargs):
            kwargs["receipt_sink"]({"error_type": "RuntimeError", "error": "unit-failure"})
            raise RuntimeError("unit-failure")
        with mock.patch.object(col, "preconditions", return_value=(self.artifacts, self.args.output,
                  {"original_geometry_completion_sha256": "f"}, self.artifacts / "geometry/complete.json", [item])), \
             mock.patch.object(ex, "verify_installation"), \
             mock.patch.object(col.replay, "sha", return_value="e" * 64), \
             mock.patch.object(col.diag, "fetch_exhaustive", side_effect=failure) as full, self.assertRaises(RuntimeError):
            col.collect(self.args, verified)
        self.assertEqual(full.call_count, 1)
        self.assertTrue((self.args.output / "release.json").exists())
        self.assertFalse((self.args.output / "complete.json").exists())
        retained = [json.loads(line) for line in (self.args.output / "receipts.jsonl").read_text().splitlines()]
        self.assertEqual(retained[0]["error_type"], "RuntimeError")
        self.http.assert_not_called()

    def test_response_projection_retains_arbitrary_actual_functional_filters(self):
        request = self.item(query_count=1)["exports"]["keyword"]["fake-query-000"]["request"]
        original = copy.deepcopy(request)
        projected = col.diag.exhaustive_request(request, 180)
        self.assertEqual(projected["body"]["query"], request["body"]["query"])
        self.assertEqual(projected["query_params"], request["query_params"])
        self.assertEqual(projected["body"]["size"], 180)
        self.assertFalse(projected["body"]["_source"])
        self.assertTrue(projected["body"]["track_total_hits"])
        self.assertEqual(request, original)

    def test_analysis_helper_uses_baseline_full_ids_never_grades_or_branch_inference(self):
        baseline = dict(cohort="REAL", seed=3901, size=494, query_id="q", system="ms_050",
            complete=True, keyword_ids=["keyword"], hybrid_ids=["keyword", "baseline-vector"],
            primary_ids_missing_from_full_collector=[])
        lower = dict(baseline, system="ms_045", hybrid_ids=["keyword", "baseline-vector", "new-vector"])
        old = col.observed_membership_attribution(lower, baseline, "baseline-vector")
        new = col.observed_membership_attribution(lower, baseline, "new-vector")
        keyword = col.observed_membership_attribution(lower, baseline, "keyword")
        self.assertTrue(old["observed_vector_introduced"])
        self.assertFalse(old["observed_new_admission_vs_baseline_full"])
        self.assertTrue(new["observed_new_admission_vs_baseline_full"])
        self.assertFalse(keyword["observed_vector_introduced"])
        self.assertFalse(new["relevance_judgment_derived"])
        self.assertFalse(new["exact_vector_membership_claimed"])
        self.assertFalse(new["root_nested_attribution_available"])
        missed_baseline = dict(baseline, primary_ids_missing_from_full_collector=["new-vector"])
        flagged = col.observed_membership_attribution(lower, missed_baseline, "new-vector")
        self.assertTrue(flagged["primary_window_discrepancy_for_id"])
        self.assertFalse(flagged["usable_for_primary_attribution"])
        self.assertIsNone(flagged["new_admission_classification"])
        with self.assertRaises(ValueError):
            col.observed_membership_attribution(lower, dict(baseline, seed=0), "new-vector")


if __name__ == "__main__":
    unittest.main()
