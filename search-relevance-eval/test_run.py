import copy
import importlib.util
import pathlib
import unittest

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
