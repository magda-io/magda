"""Synthetic unit tests only: no engine, embeddings, Scala compiler or public I/O."""
import argparse
import copy
import importlib.util
import json
import pathlib
import tempfile
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location("objective_verify", pathlib.Path(__file__).with_name("verify.py"))
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)


def export_fixture():
    root_filter = [{"term": {"tenantId": {"value": 0}}}, {"term": {"publishingState": "published"}}]
    child_filter = [{"term": {"distributions.tenantId": {"value": 0}}},
                    {"term": {"distributions.publishingState": "published"}}]
    projection = {"bool": {"should": [{"nested": {"path": "distributions", "inner_hits": {"name": "distributions"},
                   "query": {"bool": {"must": [{"term": {"distributions.tenantId": {"value": 0}}},
                                                       {"match_all": {}}]}}}}, {"match_all": {}}], "minimum_should_match": 1}}
    root = {"hybrid": {"queries": [
        {"simple_query_string": {"query": "original", "fields": ["title"]}},
        {"bool": {"filter": copy.deepcopy(root_filter), "must": [{"knn": {"queryContextVector": {"vector": [1, 2, 3], "boost": 50, "min_score": .5}}}]}}]}}
    child = {"hybrid": {"queries": [{"nested": {"path": "distributions", "query": {"bool": {
        "filter": copy.deepcopy(child_filter), "must": [query]}}}} for query in (
        {"simple_query_string": {"query": "original", "fields": ["distributions.title"]}},
        {"knn": {"distributions.queryContextVector": {"vector": [1, 2, 3], "min_score": .5}}})]}}
    query = {"bool": {"filter": [projection] + root_filter,
                      "must": [{"dis_max": {"queries": [root, child]}}]}}
    body = {"size": 10, "query": query, "_source": {"excludes": ["accessControl", "distributions"]},
            "aggs": {"Publisher-global": {"global": {}, "aggs": {"filter": {"filter": copy.deepcopy(query),
                "aggs": {"terms-other-options": {"terms": {"field": "publisher.name.keyword"}}}}}}}}
    return {"query_id": "smoke-unfiltered", "baseline_commit": "synthetic",
            "public_corpus_assumptions": {"tenant_id": 0, "publishing_state": "published"}, "request": {"body": body}}


def filtered_export_fixture():
    row = export_fixture()
    row["query_id"] = "smoke-filtered"
    body = row["request"]["body"]
    body["aggs"]["Format-global"] = copy.deepcopy(body["aggs"]["Publisher-global"])
    format_clause = {"bool": {"boost": 2.0, "should": [{"nested": {"path": "distributions", "score_mode": "avg",
                     "query": {"match": {"distributions.format.quote": {"query": "CSV"}}}}}]}}
    for subtree in (body["query"], body["aggs"]["Publisher-global"]):
        for opts in verify.nodes(subtree, "bool"):
            entries = opts.get("filter", [])
            if isinstance(entries, list) and any("tenantId" in entry.get("term", {}) for entry in entries):
                entries.append(copy.deepcopy(format_clause))
    selections = [
        {"bool": {"boost": 2.0, "should": [{"match": {"publisher.name.keyword_lowercase": {"query": "Example Publisher"}}}]}},
        {"bool": {"boost": 2.0, "filter": [{"range": {"temporal.start.date": {"gte": "2020-01-01"}}}]}},
        {"bool": {"boost": 2.0, "should": [{"geo_shape": {"spatial.geoJson": {"indexed_shape": {"index": "regions27", "id": "ste/1"}}}}]}}]
    for opts in verify.nodes(body, "bool"):
        entries = opts.get("filter", [])
        if isinstance(entries, list) and any("tenantId" in entry.get("term", {}) for entry in entries):
            entries.extend(copy.deepcopy(selections))
    return row


def format_response_fixture(system, selected):
    response = response_fixture(system)
    expected = verify.FORMAT_ROOTS if selected == "CSV" else set()
    response["hits"]["hits"] = [hit for hit in response["hits"]["hits"] if hit["_id"] in expected]
    publisher = response["aggregations"]["Publisher-global"]["filter"]
    publisher["doc_count"] = len(expected)
    publisher["terms-other-options"]["buckets"] = [bucket for bucket in publisher["terms-other-options"]["buckets"] if bucket["key"] in expected]
    response["aggregations"]["Format-global"] = {"filter": {"doc_count": len(verify.expected_roots(system))}}
    return response


def mapping_fixture():
    return {"mappings": {"properties": {"queryContextVector": {"dimension": 3},
            "distributions": {"properties": {"queryContextVector": {"dimension": 3}}}}}}


def response_fixture(system):
    identifiers = sorted(verify.expected_roots(system))
    hits = []
    for identifier in identifiers:
        hit = {"_id": identifier, "_score": .5}
        children = verify.expected_children(identifier)
        if children:
            hit["inner_hits"] = {"distributions": {"hits": {"hits": [{"_source": {"identifier": child}} for child in sorted(children)]}}}
        hits.append(hit)
    return {"hits": {"hits": hits}, "aggregations": {"Publisher-global": {"filter": {
        "doc_count": len(identifiers), "terms-other-options": {"buckets": [{"key": identifier, "doc_count": 1} for identifier in identifiers]}}}}}


def fusion_response(leader, normalized=True):
    other = "vector-leader" if leader == "lexical-leader" else "lexical-leader"
    return {"hits": {"hits": [{"_id": leader, "_score": .9 if normalized else 70.0},
                              {"_id": other, "_score": .1 if normalized else 35.0}]}}


class VerifyTests(unittest.TestCase):
    def test_local_origins_only(self):
        for value in ("https://127.0.0.1:19200", "http://example.org", "http://host.docker.internal", "file:///tmp/x",
                      "http://127.0.0.1:19200/path", "http://user@localhost", "http://localhost?x", "http://localhost#x", "http://localhost:bad"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                verify.local_url(value)
        self.assertEqual(verify.local_url("http://127.0.0.1:19200/"), "http://127.0.0.1:19200")
        self.assertEqual(verify.local_url("http://[::1]:19200"), "http://[::1]:19200")

    def test_uuid_resource_names_only(self):
        good = verify.PREFIX + "12345678-1234-4234-8234-123456789abc-eligibility"
        self.assertEqual(verify.owned(good), good)
        for value in ("datasets54", verify.PREFIX + "test", good + "/*", good + "-extra", good.replace("4234", "1234")):
            with self.subTest(value=value), self.assertRaises(ValueError):
                verify.owned(value)

    def test_redirect_rejected_without_network(self):
        with self.assertRaises(ValueError):
            verify.NoRedirect().redirect_request(None, None, 302, "", {}, "https://example.org")

    def test_transport_disables_environment_proxies(self):
        opener = mock.MagicMock()
        opener.open.return_value.__enter__.return_value.read.return_value = b'{"ok":true}'
        with mock.patch.object(verify.urllib.request, "build_opener", return_value=opener) as build:
            self.assertEqual(verify.request("http://127.0.0.1:19200", "GET", "/"), {"ok": True})
        self.assertEqual(build.call_args.args[0].proxies, {})
        self.assertIsInstance(build.call_args.args[1], verify.NoRedirect)

    def test_actual_export_selection_fails_closed(self):
        row = export_fixture()
        self.assertIs(verify.select_export([row]), row)
        for rows in ([], [row, row], [dict(row, query_id="other")], [dict(row, public_corpus_assumptions={})]):
            with self.assertRaises(ValueError):
                verify.select_export(rows)
        row["request"]["body"]["query"]["bool"]["filter"].append({"match": {"publisher.name.keyword_lowercase": "selected"}})
        with self.assertRaises(ValueError):
            verify.select_export([row])

    def test_fixture_overrides_do_not_mutate_export(self):
        row = export_fixture()
        original = copy.deepcopy(row)
        body, counts = verify.fixture_body(row)
        self.assertEqual(row, original)
        self.assertGreater(counts["root"], 0)
        self.assertGreater(counts["child"], 0)
        self.assertEqual({query["query"] for query in verify.nodes(body, "simple_query_string")}, {"water quality"})
        for knn in verify.nodes(body, "knn"):
            for payload in knn.values():
                self.assertEqual(payload["vector"], [0, 0, 0])
        self.assertEqual(body["_source"], original["request"]["body"]["_source"])

    def test_auth_injected_into_projection_without_publishing_change(self):
        body, _ = verify.fixture_body(export_fixture())
        projection = verify.nodes(body["query"], "nested")[0]["query"]
        terms = verify.nodes(projection, "term")
        self.assertIn({"distributions.accessControl.ownerId": "hidden"}, terms)
        self.assertFalse(any("distributions.publishingState" in term for term in terms))
        self.assertEqual(verify.inject_auth(body), {"root": 0, "child": 0})

    def test_auth_missing_tenant_groups_fails(self):
        with self.assertRaises(ValueError):
            verify.inject_auth({"query": {"match_all": {}}})

    def test_auth_preserved_in_every_transformed_system(self):
        body, _ = verify.fixture_body(export_fixture())
        for system in verify.SYSTEMS:
            current = verify.replay.experimental(body, system)
            terms = verify.nodes(current["query"], "term")
            self.assertIn({"accessControl.ownerId": "hidden"}, terms)
            projection = current.get("post_filter", current["query"])
            self.assertIn({"distributions.accessControl.ownerId": "hidden"}, verify.nodes(projection, "term"))
        candidate = verify.replay.experimental(body, "candidate_03_07")
        for branch in candidate["query"]["hybrid"]["queries"]:
            self.assertIn({"accessControl.ownerId": "hidden"}, verify.nodes(branch, "term"))
            self.assertIn({"distributions.accessControl.ownerId": "hidden"}, verify.nodes(branch, "term"))
        self.assertFalse(verify.nodes(candidate["aggs"], "hybrid"))

    def test_fixed_three_dimensional_fixtures_are_unique(self):
        docs = verify.fixtures()
        self.assertEqual(len(docs), len({doc["identifier"] for doc in docs}))
        for doc in docs:
            for item in [doc] + doc["distributions"]:
                self.assertIn(item["queryContextVector"], (verify.BEST, verify.FAR))
        self.assertEqual(verify.expected_roots("keyword") - verify.expected_roots("vector"), {"lexical-only"})
        self.assertEqual(verify.expected_roots("vector") - verify.expected_roots("keyword"), {"vector-only"})

    def test_eligibility_accepts_sets_not_ranking(self):
        for system in verify.SYSTEMS:
            response = response_fixture(system)
            response["hits"]["hits"].reverse()
            verify.assert_eligibility(response, system)

    def test_eligibility_catches_root_child_and_facet_leaks(self):
        for corrupt in ("root", "child", "facet", "shard"):
            response = response_fixture("baseline")
            if corrupt == "root":
                response["hits"]["hits"].append({"_id": "hidden-root"})
            elif corrupt == "child":
                response["hits"]["hits"][0]["inner_hits"] = {"distributions": {"hits": {"hits": [{"_source": {"identifier": "hidden"}}]}}}
            elif corrupt == "facet":
                response["aggregations"]["Publisher-global"]["filter"]["doc_count"] += 1
            else:
                response["_shards"] = {"failed": 1}
            with self.subTest(corrupt=corrupt), self.assertRaises(AssertionError):
                verify.assert_eligibility(response, "baseline")

    def test_format_adapter_retains_production_format_and_security_without_external_index(self):
        row = filtered_export_fixture()
        original = copy.deepcopy(row)
        body, details = verify.format_fixture_body([row], verify.FORMATS[1])
        self.assertEqual(row, original)
        self.assertTrue(all(details["removed_fixture_selection_wrappers"].values()))
        self.assertFalse(verify.nodes(body, "indexed_shape"))
        self.assertFalse(verify.nodes(body, "range"))
        matches = verify.nodes(body, "match")
        self.assertTrue(matches)
        self.assertTrue(all(match == {"distributions.format.quote": {"query": verify.FORMATS[1]}} for match in matches))
        for system in verify.FORMAT_SYSTEMS:
            current = verify.replay.experimental(body, system)
            self.assertTrue(verify.nodes(current["query"], "match"))
            terms = verify.nodes(current["query"], "term")
            self.assertIn({"accessControl.ownerId": "hidden"}, terms)
            self.assertIn({"distributions.accessControl.ownerId": "hidden"}, terms)
        # No same-child auth condition is fabricated on the independent format nested clause.
        format_nested = [nested for nested in verify.nodes(body, "nested") if "match" in nested.get("query", {})]
        self.assertTrue(format_nested)
        self.assertTrue(all(not verify.nodes(nested, "term") for nested in format_nested))

    def test_format_adapter_requires_known_export_and_removes_no_unrecognized_filters(self):
        row = filtered_export_fixture()
        for rows in ([], [export_fixture()], [row, row]):
            with self.assertRaises(AssertionError):
                verify.format_fixture_body(rows, "CSV")
        row["request"]["body"]["query"]["bool"]["filter"].append({"geo_shape": {"other": {"indexed_shape": {"index": "nonowned"}}}})
        with self.assertRaisesRegex(AssertionError, "nonowned"):
            verify.format_fixture_body([row], "CSV")

    def test_format_controls_exact_csv_and_impossible_sets_all_candidates(self):
        for system in verify.FORMAT_SYSTEMS:
            for selected in verify.FORMATS:
                response = format_response_fixture(system, selected)
                verify.assert_format(response, system, selected)
        self.assertIn("root-only-hidden-child", verify.FORMAT_ROOTS)
        self.assertNotIn("metadata-nochildren", verify.FORMAT_ROOTS)
        self.assertNotIn("draft-child-only", verify.FORMAT_ROOTS)
        self.assertNotIn("hidden-child-only", verify.FORMAT_ROOTS)

    def test_format_controls_detect_lost_constraint_and_wrong_self_excluding_facets(self):
        for corrupt in ("root", "projection", "publisher", "format"):
            response = format_response_fixture("baseline", "CSV")
            if corrupt == "root":
                response["hits"]["hits"].append({"_id": "metadata-nochildren"})
            elif corrupt == "projection":
                response["hits"]["hits"][0].pop("inner_hits", None)
            elif corrupt == "publisher":
                response["aggregations"]["Publisher-global"]["filter"]["doc_count"] += 1
            else:
                response["aggregations"]["Format-global"]["filter"]["doc_count"] = len(verify.FORMAT_ROOTS)
            with self.subTest(corrupt=corrupt), self.assertRaises(AssertionError):
                verify.assert_format(response, "baseline", "CSV")

    def test_fusion_proof_requires_flip_normalization_and_raw_invariance(self):
        valid = [fusion_response("lexical-leader"), fusion_response("vector-leader"),
                 fusion_response("lexical-leader", False), fusion_response("lexical-leader", False)]
        verify.assert_fusion(valid)
        for corrupt in ("flip", "bounded", "baseline", "missing", "nan"):
            responses = copy.deepcopy(valid)
            if corrupt == "flip":
                responses[1] = copy.deepcopy(responses[0])
            elif corrupt == "bounded":
                responses[0]["hits"]["hits"][0]["_score"] = 50
            elif corrupt == "baseline":
                responses[3]["hits"]["hits"][0]["_score"] += 1
            elif corrupt == "missing":
                responses[0]["hits"]["hits"].pop()
            else:
                responses[0]["hits"]["hits"][0]["_score"] = float("nan")
            with self.subTest(corrupt=corrupt), self.assertRaises(AssertionError):
                verify.assert_fusion(responses)

    def setup_run(self, directory):
        root = pathlib.Path(directory)
        baseline, mapping = root / "baseline.jsonl", root / "mapping.json"
        baseline.write_text(json.dumps(export_fixture()) + "\n" + json.dumps(filtered_export_fixture()) + "\n")
        mapping.write_text(json.dumps(mapping_fixture()))
        return argparse.Namespace(engine_url="http://127.0.0.1:19200", baseline_requests=str(baseline),
                                  mapping=str(mapping), output=str(root / "report.json"), allow_local_writes=True)

    def fake_request(self, base, method, path, body=None, content_type=None):
        if method in ("PUT", "DELETE"):
            return {"acknowledged": True}
        if "/_bulk" in path:
            return {"errors": False}
        if "-fusion/_search" in path:
            candidate = "hybrid" in body["query"]
            leader = "vector-leader" if candidate and path.endswith("vector-heavy") else "lexical-leader"
            return fusion_response(leader, candidate)
        query = body["query"]
        if "hybrid" in query:
            system = "candidate_03_07"
        elif verify.nodes(query, "hybrid"):
            system = "baseline"
        elif verify.nodes(query, "knn"):
            system = "vector"
        else:
            system = "keyword"
        formats = [match["distributions.format.quote"]["query"] for match in verify.nodes(query, "match")
                   if "distributions.format.quote" in match]
        if formats:
            return format_response_fixture(system, formats[0])
        return response_fixture(system)

    def test_success_cleans_exact_resources_and_records_all_controls(self):
        with tempfile.TemporaryDirectory() as directory:
            args = self.setup_run(directory)
            with mock.patch.object(verify, "request", side_effect=self.fake_request) as request:
                report = verify.verify(args)
            self.assertEqual(report["status"], "passed")
            self.assertTrue(all(control["status"] == "passed" for control in report["controls"].values()))
            self.assertEqual(len(report["resources"]), 4)
            self.assertTrue(all(resource["cleanup"] == "deleted" for resource in report["resources"]))
            puts = [call.args[2] for call in request.call_args_list if call.args[1] == "PUT"]
            deletes = [call.args[2] for call in request.call_args_list if call.args[1] == "DELETE"]
            self.assertEqual(deletes, list(reversed(puts)))
            for resource in report["resources"]:
                verify.owned(resource["name"])
            self.assertEqual(json.loads(pathlib.Path(args.output).read_text())["status"], "passed")

    def test_failed_control_raises_records_failure_and_cleans_up(self):
        with tempfile.TemporaryDirectory() as directory:
            args = self.setup_run(directory)
            def fail(base, method, path, *rest):
                if "/_search?" in path:
                    raise RuntimeError("synthetic search failure")
                return self.fake_request(base, method, path, *rest)
            with mock.patch.object(verify, "request", side_effect=fail), self.assertRaisesRegex(RuntimeError, "synthetic search failure"):
                verify.verify(args)
            report = json.loads(pathlib.Path(args.output).read_text())
            self.assertEqual(report["status"], "failed")
            self.assertEqual(report["controls"]["eligibility/baseline"]["status"], "failed")
            self.assertEqual(report["controls"]["normalization_executes"]["status"], "not_run")
            self.assertTrue(all(resource["cleanup"] == "deleted" for resource in report["resources"]))

    def test_partial_install_only_deletes_acknowledged_resources(self):
        with tempfile.TemporaryDirectory() as directory:
            args = self.setup_run(directory)
            def fail(base, method, path, *rest):
                if method == "PUT" and path.endswith("-fusion"):
                    raise RuntimeError("synthetic create failure")
                return self.fake_request(base, method, path, *rest)
            with mock.patch.object(verify, "request", side_effect=fail) as request, self.assertRaisesRegex(RuntimeError, "create failure"):
                verify.verify(args)
            deletes = [call.args[2] for call in request.call_args_list if call.args[1] == "DELETE"]
            self.assertEqual(len(deletes), 1)
            self.assertTrue(deletes[0].endswith("-eligibility"))
            report = json.loads(pathlib.Path(args.output).read_text())
            self.assertEqual(report["controls"]["install"]["status"], "failed")

    def test_cleanup_failure_is_not_hidden(self):
        with tempfile.TemporaryDirectory() as directory:
            args = self.setup_run(directory)
            def fail(base, method, path, *rest):
                if method == "DELETE":
                    raise RuntimeError("synthetic cleanup failure")
                return self.fake_request(base, method, path, *rest)
            with mock.patch.object(verify, "request", side_effect=fail), self.assertRaisesRegex(RuntimeError, "Cleanup failed"):
                verify.verify(args)
            report = json.loads(pathlib.Path(args.output).read_text())
            self.assertEqual(report["status"], "failed")
            self.assertTrue(all(resource["cleanup"] == "failed" for resource in report["resources"]))

    def test_write_consent_checked_before_requests(self):
        args = argparse.Namespace(allow_local_writes=False)
        with mock.patch.object(verify, "request") as request, self.assertRaises(ValueError):
            verify.verify(args)
        request.assert_not_called()

    def test_cli_arguments(self):
        args = verify.parser().parse_args(["--engine-url", "http://127.0.0.1:19200", "--baseline-requests", "baseline.jsonl",
                                          "--mapping", "mapping.json", "--output", "report.json", "--allow-local-writes"])
        self.assertTrue(args.allow_local_writes)


if __name__ == "__main__":
    unittest.main()
