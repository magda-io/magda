import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location("eval_analyze", pathlib.Path(__file__).with_name("analyze.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class OperationalTests(unittest.TestCase):
    def test_percentile_linear_interpolation(self):
        self.assertEqual(m.percentile([1, 2, 3, 4, 5], .95), 4.8)

    def test_facet_scored_source_excluded_but_counts_retained(self):
        a = {"buckets": [{"key": "b", "doc_count": 2, "topHits": {"score": 9}}, {"key": "a", "doc_count": 1}]}
        b = {"buckets": [{"key": "a", "doc_count": 1}, {"key": "b", "doc_count": 2, "topHits": {"score": 3}}]}
        self.assertEqual(m.counts(a), m.counts(b))

    def test_objective_metrics_do_not_infer_relevance(self):
        queries = [{"id": "q", "split": "heldout"}]
        anchors = [{"query_id": "q", "dataset_ids": ["target"]}]
        runs = []
        for system, rank in [("baseline", 2), ("candidate_03_07", 1)]:
            runs.append({"query_id": "q", "system": system, "hits": [{"id": "target", "rank": rank}], "latency_samples_ms": [10] * 100, "ranking_score_variants": ["stable"], "total_hits": {"value": 1}, "aggregations": {"doc_count": 1}})
        out = m.analyze(queries, anchors, runs)
        self.assertEqual(out["objective_known_answer_summary"]["heldout"]["baseline"]["mrr_at_10"], .5)
        self.assertEqual(out["objective_known_answer_summary"]["heldout"]["candidate_03_07"]["mrr_at_10"], 1)
        self.assertTrue(out["latency_guard"]["passed"])
        self.assertFalse(out["facet_and_total_count_fidelity"][0]["facet_count_differences"])
        self.assertEqual(out["ranking_stability"][0]["repeat_ranking_and_score_variants"], 1)

    def test_small_latency_sample_p95_undefined(self):
        out = m.analyze([{"id": "q", "split": "development"}], [], [{"query_id": "q", "system": "baseline", "hits": [], "latency_samples_ms": [1, 2]}])
        self.assertIsNone(out["latency"]["development"]["baseline"]["p95_ms"])
        self.assertIsNone(out["latency_guard"]["passed"])

    def test_duplicate_run_rejected(self):
        r = {"query_id": "q", "system": "baseline", "hits": []}
        with self.assertRaises(ValueError):
            m.analyze([{"id": "q", "split": "heldout"}], [], [r, r])


if __name__ == "__main__":
    unittest.main()
