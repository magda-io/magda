import json
from pathlib import Path
import tempfile
import unittest

from synthetic import compact_runs


class CompactRunTests(unittest.TestCase):
    def test_projection_retains_scores_timing_and_exact_facet_counts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, output = root / "raw.jsonl", root / "compact.jsonl"
            row = {"query_id": "q", "system": "baseline", "seed": 39031,
                   "hits": [{"id": "a001", "rank": 1, "score": 1.234567,
                             "metadata": {"queryContextVector": [1, 2, 3]}}],
                   "latencies_ms": [1.2, 2.3], "total_hits": {"value": 1, "relation": "eq"},
                   "aggregations": {"facet": {"doc_count": 1, "buckets": [
                       {"key": "x", "doc_count": 1, "topHits": {"hits": {"hits": [
                           {"_source": {"queryContextVector": [1, 2, 3]}}]}}}]}}}
            source.write_text(json.dumps(row) + "\n")
            before = source.read_bytes()
            receipt = compact_runs.compact(source, output)
            actual = json.loads(output.read_text())
            self.assertEqual(actual["hits"], [{"id": "a001", "rank": 1, "score": 1.234567}])
            self.assertEqual(actual["latencies_ms"], row["latencies_ms"])
            self.assertEqual(compact_runs.operational.counts(actual["aggregations"]),
                             compact_runs.operational.counts(row["aggregations"]))
            self.assertEqual(receipt["rows"], 1)
            self.assertEqual(source.read_bytes(), before)
            with self.assertRaisesRegex(ValueError, "overwrite"):
                compact_runs.compact(source, output)


if __name__ == "__main__":
    unittest.main()
