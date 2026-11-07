import copy
import importlib.util
import math
from pathlib import Path
import unittest
from unittest import mock

SOURCE = Path(__file__).with_name("diagnostics.py")
spec = importlib.util.spec_from_file_location("threshold_diagnostic_tests", SOURCE)
diag = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diag)


class DiagnosticTests(unittest.TestCase):
    def smoke(self):
        row = diag.replay.load_jsonl(SOURCE.parent.parent / "scala/smoke/baseline.jsonl")[0]
        return row

    def test_mixed_role_probe_only_changes_registered_numeric_leaves(self):
        row = self.smoke()
        original = copy.deepcopy(row)
        mixed = diag.mixed_export(row, .45, .50)
        self.assertEqual(row, original)
        proof = diag.contract.role_threshold_pair(row["request"], mixed["request"],
                    dataset_min_score=.45, distribution_min_score=.50)
        self.assertEqual(proof["changed_min_scores"], 3)
        self.assertEqual(proof["other_changes"], 0)
        with self.assertRaises(ValueError):
            diag.contract.validate_request(mixed["request"], min_score=.45)
        with self.assertRaises(ValueError):
            diag.mixed_export(row, .46, .50)

    def test_exhaustive_projection_retains_query_predicates_and_counts(self):
        request = self.smoke()["request"]
        result = diag.exhaustive_request(request, 2000)
        self.assertEqual(result["body"]["query"],
                         diag._project_response_payloads(request["body"]["query"]))
        self.assertEqual(result["query_params"], request["query_params"])
        self.assertEqual(result["body"]["size"], 2000)
        self.assertFalse(result["body"]["_source"])
        self.assertEqual(request["body"]["size"], 50)
        for bad in (0, -1, True, 10001):
            with self.assertRaises(ValueError):
                diag.exhaustive_request(request, bad)

    def test_complete_collector_rejects_approximate_totals_duplicates_truncation(self):
        response = {"hits": {"total": {"value": 1, "relation": "eq"}, "hits": [{"_id": "a"}]}}
        self.assertEqual(len(diag._complete(response, 10)), 1)
        for mutant in (
            {"hits": {"total": {"value": 1, "relation": "gte"}, "hits": [{"_id": "a"}]}},
            {"hits": {"total": 2, "hits": [{"_id": "a"}]}},
            {"hits": {"total": 2, "hits": [{"_id": "a"}, {"_id": "a"}]}},
            {**response, "timed_out": True},
        ):
            with self.assertRaises(ValueError):
                diag._complete(mutant, 10)

    def test_nested_identity_uses_parent_and_offset(self):
        children = [{"_id": "same-parent", "_nested": {"field": "distributions", "offset": n}}
                    for n in (0, 1)]
        response = {"hits": {"total": 2, "hits": children}}
        self.assertEqual(len(diag._complete(response, 10, child_offsets=True)), 2)
        children[1]["_nested"]["offset"] = 0
        with self.assertRaises(ValueError):
            diag._complete(response, 10, child_offsets=True)

    def test_native_score_probe_is_explicit_unboosted_filtered_geometry(self):
        root = diag.native_request([1., 0.], 2000)
        nested = diag.native_request([1., 0.], 2000, nested=True)
        self.assertEqual(root["query"]["script_score"]["script"]["params"]["space_type"], "l2")
        self.assertNotIn("boost", str(root))
        self.assertEqual(nested["query"]["bool"]["must"][0]["nested"]["score_mode"], "max")
        with self.assertRaises(ValueError):
            diag.native_request([math.nan], 1)


if __name__ == "__main__":
    unittest.main()
