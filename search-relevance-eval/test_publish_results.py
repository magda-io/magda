import importlib.util
import json
import pathlib
import unittest

spec = importlib.util.spec_from_file_location("publish_results", pathlib.Path(__file__).with_name("publish_results.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class PublicationTests(unittest.TestCase):
    def test_compaction_only_removes_duplicated_inputs(self):
        original = {"raw_records": {"judge_a": [1]}, "resolved_judgments": [{"pair_id": "p", "resolved_grade": 2, "judge_a": {"grade": 1}, "judge_b": {"grade": 2}, "adjudication": {"grade": 2}}], "per_query": [{"ndcg_at_10": .75, "unknown": None}], "evidence_files": {"judge_a": {"sha256": "fixed"}}}
        result = m.compact(original)
        self.assertEqual(result["per_query"], original["per_query"])
        self.assertEqual(result["evidence_files"], original["evidence_files"])
        self.assertEqual(result["resolved_judgments"], [{"pair_id": "p", "resolved_grade": 2}])
        self.assertIn("raw_records", original)
        self.assertNotIn("raw_records", result)

    def test_readable_json_round_trip_is_lossless(self):
        value = {"array": [{"quote": "α\"\n", "metric": .1234, "undefined": None}, {"list": [1, 2]}], "object": {"nested": [3, 4]}, "empty": []}
        rendered = m.render(value)
        self.assertEqual(json.loads(rendered), value)
        self.assertTrue(rendered.endswith("\n"))


if __name__ == "__main__":
    unittest.main()
