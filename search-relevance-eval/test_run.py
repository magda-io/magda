import copy
import importlib.util
import pathlib
import unittest
import hashlib
import json
import tempfile
from types import SimpleNamespace
from unittest import mock
from datetime import datetime, timezone

spec = importlib.util.spec_from_file_location("eval_run", pathlib.Path(__file__).with_name("run.py"))
eval_run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(eval_run)


def fixture():
    projection = {"bool": {"should": [{"nested": {"path": "distributions", "query": {"term": {"distributions.tenantId": 0}}, "inner_hits": {"name": "distributions"}}}, {"match_all": {}}], "minimum_should_match": 1}}
    matching = {"dis_max": {"queries": [
        {"hybrid": {"queries": [{"match": {"title": "water"}}, {"knn": {"queryContextVector": {"vector": [0, 0], "min_score": .5, "boost": 50, "filter": {"term": {"tenantId": 0}}}}}]}},
        {"hybrid": {"queries": [{"nested": {"path": "distributions", "query": {"bool": {"must": [{"match": {"distributions.title": "water"}}], "filter": [{"term": {"distributions.tenantId": 0}}]}}}}, {"nested": {"path": "distributions", "query": {"knn": {"distributions.queryContextVector": {"vector": [0, 0], "min_score": .5}}}}}]}}
    ]}}
    return {"size": 10, "query": {"function_score": {"query": {"bool": {"must": [matching], "filter": [projection, {"term": {"tenantId": 0}}, {"term": {"publishingState": "published"}}]}}, "functions": [{"weight": 1}, {"field_value_factor": {"field": "quality"}}]}}, "aggs": {"publishers-global": {"global": {}, "aggs": {"filter": {"filter": copy.deepcopy(matching)}}}}, "_source": {"excludes": ["accessControl", "queryContextVector", "distributions"]}}


def named(node, key):
    if isinstance(node, list):
        return [v for child in node for v in named(child, key)]
    if not isinstance(node, dict):
        return []
    return ([node[key]] if key in node else []) + [v for child in node.values() for v in named(child, key)]


class ReplayTests(unittest.TestCase):
    def test_baseline_unchanged_and_deepcopied(self):
        body = fixture()
        result = eval_run.experimental(body, "baseline")
        self.assertEqual(result, body)
        result["size"] = 99
        self.assertEqual(body["size"], 10)

    def test_legacy_default_systems_and_parser_remain_seven(self):
        self.assertEqual(eval_run.selected_systems(), eval_run.SYSTEMS)
        self.assertEqual(len(eval_run.SYSTEMS), 7)
        args = eval_run.parser().parse_args([
            "run", "--engine-url", "http://localhost:9200", "--index", "magda-relevance-eval-test",
            "--requests", "requests", "--corpus", "corpus", "--output", "out"])
        self.assertIs(args.func, eval_run.run)
        self.assertIsNone(args.systems)
        self.assertEqual(args.repetitions, 3)
        self.assertEqual(args.depth, 10)

    def test_shared_schedule_matches_original_hash_and_interleave(self):
        for qid in ("a", "smoke-filtered", "water quality"):
            systems = eval_run.SYSTEMS
            rotation = int(hashlib.sha256(qid.encode()).hexdigest()[:8], 16) % len(systems)
            expected = systems[rotation:] + systems[:rotation]
            self.assertEqual(eval_run.rotation_order(qid, systems), expected)
            for repetition in range(10):
                offset = repetition % len(expected)
                self.assertEqual(eval_run.measurement_order(expected, repetition), expected[offset:] + expected[:offset])

    def test_executor_utc_brackets_success_and_error_without_changing_timer(self):
        args = SimpleNamespace(engine_url="http://localhost:19200", index="magda-relevance-eval-unit", seed=4)
        started = datetime(2026, 11, 7, 1, 0, tzinfo=timezone.utc)
        completed = datetime(2026, 11, 7, 1, 0, 1, tzinfo=timezone.utc)
        response = {"hits": {"hits": []}, "timed_out": False, "_shards": {"failed": 0}}
        for phase, error in (("warmup", None), ("measured", None), ("measured", TimeoutError("unit"))):
            with self.subTest(phase=phase, error=error), tempfile.TemporaryDirectory() as directory:
                ledger = pathlib.Path(directory) / "receipts.jsonl"
                with mock.patch.object(eval_run, "datetime") as clock, \
                        mock.patch.object(eval_run.time, "perf_counter", side_effect=[10, 10.125]) as timer, \
                        mock.patch.object(eval_run, "request", side_effect=error, return_value=response):
                    clock.now.side_effect = [started, completed]
                    execute = eval_run.response_executor(args, ledger)
                    if error:
                        with self.assertRaises(TimeoutError):
                            execute("/unit/_search", {}, "q", "baseline", phase, 1)
                    else:
                        self.assertEqual(execute("/unit/_search", {}, "q", "baseline", phase, 1), (response, 125))
                    self.assertEqual(clock.now.call_args_list, [mock.call(timezone.utc), mock.call(timezone.utc)])
                    self.assertEqual(timer.call_count, 1 if error else 2)
                receipt = json.loads(ledger.read_text())
                self.assertEqual(receipt["request_started_utc"], started.isoformat())
                self.assertEqual(receipt["request_completed_utc"], completed.isoformat())
                self.assertEqual(receipt["phase"], phase)
                self.assertEqual(receipt["warmup"], phase == "warmup")
                if error:
                    self.assertEqual(receipt["error_type"], "TimeoutError")
                else:
                    self.assertEqual(receipt["elapsed_ms"], 125)

    def test_candidate_two_top_level_families(self):
        body = fixture()
        result = eval_run.experimental(body, "candidate_03_07")
        self.assertEqual(len(named(result, "hybrid")), 1)
        keyword, vector = result["query"]["hybrid"]["queries"]
        self.assertFalse(named(keyword, "knn"))
        self.assertFalse(named(vector, "match"))
        self.assertEqual(len(named(vector, "knn")), 2)
        self.assertEqual(len(named(result, "inner_hits")), 1)
        self.assertIn("inner_hits", str(result["post_filter"]))
        self.assertFalse(named(result["aggs"], "hybrid"))
        self.assertEqual(result["_source"], body["_source"])

    def test_root_security_and_quality_repeated_in_both_families(self):
        result = eval_run.experimental(fixture(), "candidate_03_07")
        for branch in result["query"]["hybrid"]["queries"]:
            self.assertIn({"tenantId": 0}, named(branch, "term"))
            self.assertIn({"publishingState": "published"}, named(branch, "term"))
            self.assertEqual(named(branch, "field_value_factor"), [{"field": "quality"}])
        keyword = result["query"]["hybrid"]["queries"][0]
        self.assertIn({"distributions.tenantId": 0}, named(keyword, "term"))

    def test_fixed_keep50_sensitivity(self):
        primary = eval_run.experimental(fixture(), "candidate_03_07")
        sensitivity = eval_run.experimental(fixture(), "candidate_keep50_03_07")
        self.assertFalse(named(primary["query"], "boost"))
        self.assertEqual(named(sensitivity["query"], "boost"), [50])

    def test_controls_separate_branches(self):
        keyword = eval_run.experimental(fixture(), "keyword")
        vector = eval_run.experimental(fixture(), "vector")
        self.assertFalse(named(keyword, "knn"))
        self.assertFalse(named(vector, "match"))
        self.assertFalse(named(keyword, "hybrid"))
        self.assertFalse(named(vector, "hybrid"))

    def test_public_write_endpoints_and_resource_names_rejected(self):
        for url in ("https://dev.magda.io/api", "http://dev.magda.io", "http://user:password@localhost", "http://localhost?x=y", "file:///tmp/a"):
            with self.assertRaises(ValueError):
                eval_run.local_url(url)
        self.assertEqual(eval_run.local_url("http://127.0.0.1:19200/"), "http://127.0.0.1:19200")
        for name in ("datasets54", "magda-relevance-eval-a/*", "magda-relevance-eval-../_all", "MAGDA-relevance-eval-x"):
            with self.assertRaises(ValueError):
                eval_run.owned(name)

    def test_redirects_are_rejected_without_network_access(self):
        with self.assertRaises(ValueError):
            eval_run.NoRedirect().redirect_request(None, None, 307, "redirect", {}, "https://dev.magda.io/api")
        with self.assertRaises(ValueError):
            eval_run.local_url("http://127.0.0.1:19200/unexpected/path")

    def test_unexpected_baseline_shape_fails_closed(self):
        with self.assertRaises(ValueError):
            eval_run.experimental({"query": {"match_all": {}}}, "candidate_03_07")


if __name__ == "__main__":
    unittest.main()
