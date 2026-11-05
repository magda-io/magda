import importlib.util
import json
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("prepare_review", pathlib.Path(__file__).with_name("prepare_review.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class AdjudicationPreparationTests(unittest.TestCase):
    def fixture(self, root):
        jobs = []
        for role in ("A", "B"):
            packet = root / (role + ".json")
            output = root / (role + ".jsonl")
            packet.write_text(json.dumps({"task": {"query": "water"}, "pairs": [{"pair_id": "p1", "document": {"title": "water"}}, {"pair_id": "p2", "document": {"title": "unrelated"}}]}))
            rows = [{"pair_id": "p1", "grade": 3 if role == "A" else 2, "evidence": "title"}, {"pair_id": "p2", "grade": 0, "evidence": "different title"}]
            output.write_text("".join(json.dumps(r) + "\n" for r in rows))
            jobs.append({"packet": str(packet), "output": str(output), "pairs": 2, "role": role})
        return jobs

    def test_all_conflicts_and_agreed_audit_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            jobs = self.fixture(root)
            result = m.prepare(jobs, root / "review")
            self.assertEqual(result["conflict_pairs"], ["p1"])
            self.assertEqual(result["common_mode_audit_pairs"], ["p2"])
            self.assertEqual(result["agreed_numeric_pairs"], 1)
            packet = json.loads(pathlib.Path(result["review_jobs"][0]["packet"]).read_text())
            self.assertEqual({r["pair_id"] for r in packet["pairs"]}, {"p1", "p2"})
            self.assertNotIn("conflict", packet["pairs"][0])
            self.assertEqual(len(m.jsonl(root / "review/judge-A.jsonl")), 2)

    def test_missing_assessor_output_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            jobs = self.fixture(root)
            jobs[0]["output"] = str(root / "missing.jsonl")
            with self.assertRaises(ValueError):
                m.prepare(jobs, root / "review")

    def test_pair_omission_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            jobs = self.fixture(root)
            pathlib.Path(jobs[0]["output"]).write_text(json.dumps({"pair_id": "p1", "grade": 3, "evidence": "title"}) + "\n")
            with self.assertRaises(ValueError):
                m.prepare(jobs, root / "review")


if __name__ == "__main__":
    unittest.main()
