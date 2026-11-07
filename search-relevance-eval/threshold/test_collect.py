"""Offline collector mocks only: no corpus/labels/models/engine integration."""
import copy
import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest import mock

SOURCE = Path(__file__).with_name("collect.py")
spec = importlib.util.spec_from_file_location("threshold_collector_tests", SOURCE)
col = importlib.util.module_from_spec(spec)
spec.loader.exec_module(col)
ex = col.execution


class CollectionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.repo = Path(self.tmp.name).resolve()
        self.root = self.repo / "search-relevance-eval/threshold"
        self.root.mkdir(parents=True)
        self.addCleanup(mock.patch.stopall)
        mock.patch.object(ex, "ROOT", self.root).start()
        mock.patch.object(ex, "REPO", self.repo).start()
        self.http = mock.patch.object(col.diag.replay, "request", side_effect=AssertionError("No live backend request")).start()
        self.case = {"cohort": "NEW", "seed": 38871, "catalog_size": 1, "index": "magda-relevance-eval-unit"}
        self.doc = {"identifier": "unit-parent", "tenantId": 0, "publishingState": "published",
            "queryContext": "Unit root projection", "queryContextVector": [1., 0., 0.], "distributions": [
                {"identifier": "unit-child", "tenantId": 0, "publishingState": "published",
                 "queryContext": "Unit child projection", "queryContextVector": [0., 1., 0.]}]}

    def put(self, path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value))
        return path

    def jsonl(self, path, rows):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("".join(json.dumps(row) + "\n" for row in rows))
        return path

    def smoke(self):
        return col.replay.load_jsonl(SOURCE.parent.parent / "scala/smoke/baseline.jsonl")[0]

    def test_source_inventory_binds_actual_projection_dimensions_and_offsets(self):
        original = copy.deepcopy(self.doc)
        inv = col.inventory([self.doc], self.case, 3)["unit-parent"]
        self.assertEqual(inv["root"]["dimension"], 3)
        self.assertEqual(inv["children"][0]["distribution_id"], "unit-child")
        self.assertEqual(inv["children"][0]["offset"], 0)
        self.assertEqual(inv["children"][0]["projection_sha256"], col.projection("Unit child projection"))
        self.assertNotIn("queryContext", json.dumps(inv))
        self.assertEqual(self.doc, original)
        for mutate in (lambda d: d.update(tenantId=1), lambda d: d.update(publishingState="draft"),
            lambda d: d["distributions"][0].update(tenantId=1),
            lambda d: d["distributions"][0].update(queryContextVector=[1.]),
            lambda d: d["distributions"][0].update(queryContext="")):
            bad = copy.deepcopy(self.doc)
            mutate(bad)
            with self.assertRaises(ValueError):
                col.inventory([bad], self.case, 3)

    def test_native_rows_cover_each_actual_child_and_fail_missing_scope(self):
        inv = col.inventory([self.doc], self.case, 3)
        root = {"scores": {"unit-parent": {"score": .8}}, "request_sha256": "r" * 64}
        child = {"scores": {"unit-parent": {"score": .7, "children": [{"offset": 0, "score": .7}]}}, "request_sha256": "n" * 64}
        row = list(col.native_rows(self.case, {"id": "unit-q", "vector": [1., 0., 0.]}, inv, root, child))[0]
        self.assertEqual(row["dimension"], row["root_dimension"])
        self.assertEqual(row["max_child_score"], .7)
        self.assertEqual(row["source"], "engine_exact_docvalues_l2")
        self.assertTrue(row["children"][0]["allowed"])
        for bad_root, bad_child in ((dict(root, scores={}), child), (root, dict(child, scores={})),
            (root, dict(child, scores={"unit-parent": {"score": .7, "children": []}}))):
            with self.assertRaises(ValueError):
                list(col.native_rows(self.case, {"id": "unit-q", "vector": [1., 0., 0.]}, inv, bad_root, bad_child))

    def test_isolated_branches_copy_actual_wrappers_boosts_and_filters_only(self):
        request = self.smoke()["request"]
        original = copy.deepcopy(request)
        wrappers = col.source_wrappers(request, .5)
        for role in ("root", "nested"):
            isolated, proof = col.isolated_request(request, .5, role)
            self.assertEqual(isolated["path"], request["path"])
            self.assertEqual(isolated["query_params"], request["query_params"])
            self.assertFalse(proof["primary_request_modified"])
            copies = col.contract.knn_copies(isolated["body"])
            self.assertEqual(len(copies), 1)
            payload = copies[0][2]
            self.assertEqual(payload["min_score"], .5)
            self.assertEqual(payload.get("boost", 1), 50 if role == "root" else 1)
            if role == "root":
                self.assertEqual(isolated["body"]["query"], wrappers["root"])
            else:
                self.assertEqual(isolated["body"]["query"]["bool"]["filter"], wrappers["parent_filters"])
        self.assertEqual(request, original)

    def tasks(self):
        design = [{"id": "q%02d" % n, "query": "Unit %d" % n, "kind": "semantic",
                   "split": "development" if n == 0 else "heldout"} for n in range(48)]
        design += [{"id": "amb%d" % n, "query": "Unit ambiguity", "kind": "ambiguous_ungraded", "split": "diagnostic"} for n in range(2)]
        embedded = [dict(query, vector=[1., 0., 0.]) for query in design]
        return design, embedded

    def test_numeric_inventory_is_frozen_48_not_score_or_label_selected(self):
        design, embedded = self.tasks()
        self.assertEqual(len(col.scored_queries(embedded, design)), 48)
        for mutate in (lambda rows: rows.pop(), lambda rows: rows[0].update(query="Changed"),
                       lambda rows: rows[0].update(filters={"format": "CSV"})):
            bad = copy.deepcopy(embedded)
            mutate(bad)
            with self.assertRaises(ValueError):
                col.scored_queries(bad, design)
        self.http.assert_not_called()

    def test_geometry_permission_fails_before_metadata_or_native_requests(self):
        args = SimpleNamespace(artifact_root=self.root / ".local/unit", development_record=None)
        with mock.patch.object(ex, "verify_installation") as install, self.assertRaises(ValueError):
            col.preconditions(args, {"approval": {"diagnostic_only": True, "forced_recommendation": "D", "promotion_allowed": False}})
        install.assert_not_called()
        self.http.assert_not_called()

    def test_fixed_source_first10_calibration_uses_real_formula_not_boundary_selection(self):
        case = dict(self.case, catalog_size=12)
        root = self.root / ".local/execution"
        target = ex.case_dir(root, case)
        docs = []
        for number in reversed(range(12)):
            doc = copy.deepcopy(self.doc)
            doc["identifier"] = "unit-%02d" % number
            doc["queryContextVector"] = [number / 12., 0., 0.]
            docs.append(doc)
        self.jsonl(target / "embedded-corpus.jsonl", docs)
        self.jsonl(target / "embedded-queries.jsonl", [
            {"id": "dev-z", "split": "development", "vector": [1., 0., 0.]},
            {"id": "dev-a", "split": "development", "vector": [1., 0., 0.]}])
        row = self.smoke()
        row["query_id"] = "dev-a"
        for _, _, payload in col.contract.knn_copies(row["request"]["body"]):
            payload["vector"] = [1., 0., 0.]
        self.jsonl(target / "exports/ms_050/requests.jsonl", [row])
        observed = {}
        for doc in docs:
            if doc["identifier"] < "unit-10":
                observed[doc["identifier"]] = {"score": 1 / (1 + (1 - doc["queryContextVector"][0]) ** 2)}
        output = io.StringIO()
        with mock.patch.object(ex, "embedding_spec", return_value={"dimension": 3}), \
             mock.patch.object(col.diag, "fetch_native", return_value={"scores": observed, "receipt": {}}) as fetch:
            result = col.calibrate(SimpleNamespace(engine_url="http://127.0.0.1:19200"), {"inputs": {}}, root,
                                   [case], io.StringIO(), output)
        self.assertTrue(result[0]["passed"])
        self.assertEqual(result[0]["query_id"], "dev-a")
        self.assertEqual([p["dataset_id"] for p in result[0]["points"]], ["unit-%02d" % n for n in range(10)])
        self.assertEqual(fetch.call_args.args[3], 10)
        self.assertEqual(result[0]["tolerance"], 1e-5)

    def test_mocked_case_streams_all48_native_and7_actual_branch_memberships(self):
        root = self.root / ".local/execution"
        target = ex.case_dir(root, self.case)
        self.jsonl(target / "embedded-corpus.jsonl", [self.doc])
        design, tasks = self.tasks()
        self.jsonl(target / "embedded-queries.jsonl", tasks)
        smoke = self.smoke()
        for label, threshold in list(col.contract.THRESHOLD_LABELS.items()) + [("keyword", None)]:
            rows = []
            for query in tasks:
                row = copy.deepcopy(smoke)
                row["query_id"] = query["id"]
                if threshold is not None:
                    for _, _, payload in col.contract.knn_copies(row["request"]["body"]):
                        payload["min_score"] = threshold
                        payload["vector"] = [1., 0., 0.]
                rows.append(row)
            self.jsonl(target / "exports" / label / "requests.jsonl", rows)
        primary = [{"query_id": query["id"], "system": label,
                    "hits": [{"id": "unit-parent", "rank": 1, "score": 1.}]}
                   for query in tasks for label in col.contract.THRESHOLD_LABELS]
        self.jsonl(target / "development-runs.jsonl", primary)
        self.jsonl(target / "heldout-runs.jsonl", [])
        streams = {name: io.StringIO() for name in ("native", "eligibility", "vector-inventory", "receipts")}
        def native(engine, index, vector, size, *, nested=False, **kwargs):
            values = {"unit-parent": {"score": .8 if not nested else .7}}
            if nested:
                values["unit-parent"]["children"] = [{"offset": 0, "score": .7}]
            return {"scores": values, "request_sha256": "a" * 64}
        full_calls = []
        def full(engine, index, request, size, *, primary_ids, **kwargs):
            full_calls.append(request)
            # Retain an intentional window discrepancy in a primary full request.
            missing = list(primary_ids) if primary_ids and len(full_calls) == 2 else []
            raw_score = .7 if col.contract.NESTED_FIELD in json.dumps(request) else 40.
            return {"ids": [] if missing else ["unit-parent"], "primary_ids_missing_from_collector": missing,
                    "request_sha256": "b" * 64,
                    "receipt": {"hits": [{"id": "unit-parent", "score": raw_score}]}}
        checked = {"inputs": {"new_validation_manifest": "fake-validation", "source_sha256": {"fake-validation": "c" * 64}}}
        with mock.patch.object(ex, "embedding_spec", return_value={"dimension": 3}), \
             mock.patch.object(col.diag, "fetch_native", side_effect=native) as native_calls, \
             mock.patch.object(col.diag, "fetch_exhaustive", side_effect=full):
            summary = col.collect_case(SimpleNamespace(engine_url="http://127.0.0.1:19200"), checked, root,
                                       self.case, streams, design)
        self.assertEqual(native_calls.call_count, 48 * 2)
        self.assertEqual(len(full_calls), 48 * (1 + 7 * 3))
        self.assertEqual(len(streams["native"].getvalue().splitlines()), 48)
        eligibility = [json.loads(line) for line in streams["eligibility"].getvalue().splitlines()]
        self.assertEqual(len(eligibility), 48 * 7)
        self.assertEqual(summary["native_rows"], 48)
        self.assertEqual(len(summary["window_discrepancies"]), 1)
        self.assertFalse(eligibility[0]["source_primary_top10_subset"])
        self.assertTrue(all("root_vector_ids" in row and "nested_vector_ids" in row for row in eligibility))
        self.assertTrue(all(row["native_scores_are_not_radial_membership"] for row in eligibility))

    def test_diagnostic_error_and_incomplete_receipts_persist_without_retry(self):
        retained = []
        with mock.patch.object(col.diag.replay, "request", side_effect=RuntimeError("unit-failure")) as request, self.assertRaises(RuntimeError):
            col.diag.timed_probe("http://127.0.0.1:19200", "/unit/_search", {}, receipt_sink=retained.append)
        self.assertEqual(request.call_count, 1)
        self.assertEqual(retained[0]["error_type"], "RuntimeError")
        self.assertIn("request_completed_utc", retained[0])
        retained.clear()
        response = {"timed_out": True, "hits": {"total": 0, "hits": []}}
        with mock.patch.object(col.diag.replay, "request", return_value=response), self.assertRaises(ValueError):
            col.diag.fetch_exhaustive("http://127.0.0.1:19200", "magda-relevance-eval-unit", {"body": {}, "query_params": {}},
                                      1, primary_ids=[], receipt_sink=retained.append)
        self.assertEqual(len(retained), 1)
        self.assertTrue(retained[0]["timed_out"])
        self.assertIn("parsed_json_sha256", retained[0])


if __name__ == "__main__":
    unittest.main()
