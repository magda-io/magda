"""Offline mocks only: mutated requests are NEVER new actual Scala exports."""
import copy
import importlib.util
import json
import pathlib
import tempfile
import types
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parent


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


control = load("raw_threshold_controls_tests", ROOT / "correctness.py")
fixtures = load("raw_threshold_export_test_helpers", ROOT / "test_export_contract.py")


def response(docs, roots, projection, format_roots=None):
    """Explicit synthetic engine response; not a receipt from a real service."""
    by_id = {doc["identifier"]: doc for doc in docs}
    hits = []
    for identifier in sorted(roots):
        children = by_id[identifier]["distributions"]
        projected = [{"_id": identifier, "_nested": {"field": "distributions", "offset": offset},
                      "_source": copy.deepcopy(child)} for offset, child in enumerate(children)
                     if child["identifier"] in projection(identifier)]
        hit = {"_id": identifier, "_score": 50.5, "_source": {"identifier": identifier}}
        if projected:
            hit["inner_hits"] = {"distributions": {"hits": {"total": {"value": len(projected), "relation": "eq"}, "hits": projected}}}
        hits.append(hit)
    format_roots = roots if format_roots is None else format_roots
    children = [c for identifier in format_roots for c in by_id[identifier]["distributions"]]
    parents = {identifier for identifier in format_roots if by_id[identifier]["distributions"]}
    return {"timed_out": False, "_shards": {"failed": 0},
            "hits": {"total": {"value": len(hits), "relation": "eq"}, "hits": hits},
            "aggregations": {"Publisher-global": {"filter": {"doc_count": len(roots),
                "terms-other-options": {"buckets": [{"key": identifier, "doc_count": 1,
                    "topHits": {"hits": {"hits": [{"_id": identifier, "_source": copy.deepcopy(by_id[identifier])}]}}}
                    for identifier in sorted(roots)]}}},
                "Format-global": {"filter": {"doc_count": len(format_roots), "nested-distributions": {
                    "doc_count": len(children), "terms-other-options": {"buckets": [
                        {"key": "CSV", "doc_count": len(children), "reverse": {"doc_count": len(parents)}}] if children else []}}}}}}


def standard_response(selected=None):
    roots = control.verify.expected_roots("baseline") if selected is None else control.verify.FORMAT_ROOTS if selected == "CSV" else set()
    return response(control.verify.fixtures(), roots, control.verify.expected_children, control.verify.expected_roots("baseline"))


class CorrectnessTests(unittest.TestCase):
    def setup_args(self, root, k1=False):
        rows = fixtures.exports()
        paths, configs = {}, {}
        for label in control.LABELS:
            current = copy.deepcopy(rows)
            for row in current:
                row["baseline_commit"] = control.contract.BASELINE
                row["request"] = fixtures.diagnostic(row["request"]) if label == "topk10diag" else fixtures.threshold(row["request"], control.contract.THRESHOLD_LABELS[label])
            path, cfgpath = root / (label + ".jsonl"), root / (label + ".json")
            path.write_text("".join(json.dumps(row) + "\n" for row in current))
            config = {"config_sha": current[0]["config_sha"], "elasticSearch": {"indices": {"datasets": {"hybridSearch": {
                "k": 10 if label == "topk10diag" else None, "minScore": .5 if label == "topk10diag" else control.contract.THRESHOLD_LABELS[label], "maxDistance": None}}}}}
            cfgpath.write_text(json.dumps(config))
            paths[label], configs[label] = str(path), str(cfgpath)
        args = types.SimpleNamespace(requests=paths, configs=configs, mapping=str(ROOT.parent / "scala" / "smoke" / "mapping.json"),
            engine_url="http://127.0.0.1:19200", allow_local_writes=True, output=str(root / "report.json"), production_pipeline_id=None,
            topk1_requests=None, topk1_config=None)
        if k1:
            current = copy.deepcopy(rows)
            for row in current:
                row["baseline_commit"] = control.contract.BASELINE
                row["request"] = fixtures.diagnostic(row["request"], k=1)
            path, cfgpath = root / "k1.jsonl", root / "k1.json"
            path.write_text("".join(json.dumps(row) + "\n" for row in current))
            cfgpath.write_text(json.dumps({"config_sha": current[0]["config_sha"], "elasticSearch": {"indices": {"datasets": {"hybridSearch": {"k": 1}}}}}))
            args.topk1_requests, args.topk1_config = str(path), str(cfgpath)
        return args

    def engine(self, call_log, corrupt=None):
        indexed = {}

        def request(base, method, path, body=None, content_type="application/json"):
            call_log.append((base, method, path, copy.deepcopy(body)))
            name = path.split("/")[1]
            if method == "PUT":
                self.assertNotIn("pipeline", path)
                control.owned(name)
                return {"acknowledged": True}
            if method == "DELETE":
                control.owned(name)
                return {"acknowledged": corrupt != "cleanup"}
            if "/_bulk" in path:
                lines = [json.loads(line) for line in body.splitlines()]
                indexed[name] = lines[1::2]
                return {"errors": False, "items": [{"index": {"status": 201}} for _ in lines[1::2]]}
            if method == "GET":
                return {"production-default": {"description": "existing normalizer expected no-op on raw nested FS",
                    "request_processors": [], "response_processors": [], "phase_results_processors": [{"normalization-processor": {
                        "normalization": {"technique": "min_max"}, "combination": {"technique": "arithmetic_mean",
                            "parameters": {"weights": [.3, .7]}}}}]}}
            self.assertIn("/_search?search_pipeline=", path)
            docs = indexed[name]
            if name.endswith("-legacy"):
                result = response(docs, {"legacy"}, lambda _: {"legacy-visible"})
            elif "-prefilter-" in name:
                negative = all("filter" not in payload for _, _, payload in control.contract.knn_copies(body))
                roots = (set() if name.endswith("-root") else {"mixed"}) if negative else {"eligible"}
                result = response(docs, roots, lambda _: set())
            else:
                matches = [m["distributions.format.quote"]["query"] for m in control.verify.nodes(body, "match") if "distributions.format.quote" in m]
                result = standard_response(matches[0] if matches else None)
            if corrupt == "total":
                result["hits"]["total"]["value"] += 1
            elif corrupt == "facet":
                result["aggregations"]["Format-global"]["filter"]["nested-distributions"]["doc_count"] += 1
            elif corrupt and corrupt.endswith("-parity") and not path.endswith("=_none"):
                if corrupt == "score-parity":
                    result["hits"]["hits"][0]["_score"] += 1
                elif corrupt == "id-parity":
                    result["hits"]["hits"][0]["_id"] = "changed-id"
                elif corrupt == "total-parity":
                    result["hits"]["total"]["value"] += 1
                elif corrupt == "facet-parity":
                    result["aggregations"]["Format-global"]["filter"]["nested-distributions"]["doc_count"] += 1
            elif corrupt == "nan":
                result["hits"]["hits"][0]["_score"] = float("nan")
            return result
        return request

    def test_all_eight_modes_and_exact_cleanup_raw_only(self):
        with tempfile.TemporaryDirectory() as directory:
            args = self.setup_args(pathlib.Path(directory))
            calls = []
            with mock.patch.object(control.replay, "request", side_effect=self.engine(calls)), \
                 mock.patch.object(control.verify, "verify", side_effect=AssertionError("whole seven-profile verifier forbidden")), \
                 mock.patch.object(control.replay, "experimental", side_effect=AssertionError("no transformations")):
                report = control.verify_raw(args)
            self.assertEqual(report["status"], "passed")
            self.assertEqual(len(report["responses"]), 32)
            self.assertTrue(report["cleanup_all_acknowledged"])
            self.assertTrue(report["all_eight_raw_mode_controls_passed"])
            self.assertFalse(report["all_mode_claim"])
            self.assertFalse(report["all_threshold_full_opa_service_coverage"])
            self.assertEqual(report["prefilter_topk1"]["status"], "not_run")
            self.assertEqual(report["production_pipeline_parity"]["status"], "not_run")
            self.assertEqual(len([c for c in calls if c[1] == "DELETE"]), 2)
            searches = [c for c in calls if "/_search?" in c[2]]
            self.assertTrue(all(c[2].endswith("search_pipeline=_none") for c in searches))
            self.assertFalse(any("/_search/pipeline/" in c[2] for c in calls))
            for label, mode in report["modes"].items():
                self.assertEqual(mode["status"], "passed")
                for receipt in [r for r in report["executed_requests"] if r["mode"] == label]:
                    for _, field, payload in control.contract.knn_copies(receipt["body"]):
                        self.assertEqual(payload.get("boost"), 50 if field == control.contract.ROOT_FIELD else None)
                        self.assertEqual(payload["vector"], [0, 0, 0])
                        self.assertEqual(payload.get("k"), 10 if label == "topk10diag" else None)
                        self.assertEqual(payload.get("min_score"), None if label == "topk10diag" else control.contract.THRESHOLD_LABELS[label])
            self.assertEqual(json.loads(pathlib.Path(args.output).read_text())["status"], "passed")

    def test_failed_subset_preserves_error_receipts_and_not_run(self):
        for corrupt in ("total", "facet", "nan", "cleanup"):
            with self.subTest(corrupt=corrupt), tempfile.TemporaryDirectory() as directory:
                args = self.setup_args(pathlib.Path(directory))
                calls = []
                with mock.patch.object(control.replay, "request", side_effect=self.engine(calls, corrupt)), self.assertRaises(AssertionError):
                    control.verify_raw(args)
                report = json.loads(pathlib.Path(args.output).read_text())
                self.assertEqual(report["status"], "failed")
                self.assertTrue(report["error"])
                self.assertTrue(report["responses"])
                if corrupt != "cleanup":
                    self.assertEqual(report["modes"]["ms_050"]["status"], "failed")
                    self.assertEqual(report["modes"]["ms_048"]["status"], "not_run")
                    self.assertTrue(report["cleanup_all_acknowledged"])
                else:
                    self.assertFalse(report["cleanup_all_acknowledged"])

    def test_inputs_reject_before_any_network_and_preserve_report(self):
        for kind in ("subset", "stale-threshold", "boost", "config-mask", "unpaired-k1"):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as directory:
                args = self.setup_args(pathlib.Path(directory))
                if kind == "subset":
                    args.requests.pop("ms_040")
                elif kind in ("stale-threshold", "boost"):
                    path = pathlib.Path(args.requests["ms_048"])
                    rows = control.replay.load_jsonl(path)
                    payload = control.contract.knn_copies(rows[0]["request"]["body"])[0][2]
                    payload["min_score" if kind == "stale-threshold" else "boost"] = .5 if kind == "stale-threshold" else 1
                    path.write_text("".join(json.dumps(row) + "\n" for row in rows))
                elif kind == "config-mask":
                    path = pathlib.Path(args.configs["ms_048"])
                    cfg = json.loads(path.read_text())
                    cfg["elasticSearch"]["indices"]["datasets"]["hybridSearch"]["k"] = 10
                    path.write_text(json.dumps(cfg))
                else:
                    args.topk1_requests = "not-used"
                with mock.patch.object(control.replay, "request") as request, self.assertRaises((AssertionError, ValueError)):
                    control.verify_raw(args)
                request.assert_not_called()
                report = json.loads(pathlib.Path(args.output).read_text())
                self.assertEqual(report["inputs"]["status"], "failed")
                self.assertTrue(all(m["status"] == "not_run" for m in report["modes"].values()))

    def test_actual_offset_identity_and_vector_stripped_full_receipts(self):
        value = standard_response()
        control.projection_identity(value, control.verify.fixtures())
        cleaned = control.strip_vectors(value)
        child = next(hit for hit in cleaned["hits"]["hits"] if hit["_id"] == "siblings")["inner_hits"]["distributions"]["hits"]["hits"][0]
        self.assertEqual(child["_nested"], {"field": "distributions", "offset": 1})
        self.assertEqual(child["_source"]["identifier"], "draft-sibling")
        self.assertNotIn("queryContextVector", json.dumps(cleaned))
        self.assertIn("hidden-sibling", json.dumps(cleaned["aggregations"]))
        for mutation in ("missing", "wrong-offset", "wrong-id", "truncated"):
            wrong = copy.deepcopy(value)
            hit = next(h for h in wrong["hits"]["hits"] if h["_id"] == "siblings")
            children = hit["inner_hits"]["distributions"]["hits"]
            if mutation == "missing":
                children["hits"][0].pop("_nested")
            elif mutation == "wrong-offset":
                children["hits"][0]["_nested"]["offset"] = 0
            elif mutation == "wrong-id":
                children["hits"][0]["_source"]["identifier"] = "parent-id-only"
            else:
                children["total"]["value"] += 1
            with self.subTest(mutation=mutation), self.assertRaises(AssertionError):
                control.projection_identity(wrong, control.verify.fixtures())

    def test_uniform_far_omission_retains_all_metadata_and_best_vectors(self):
        original = control.verify.fixtures()
        before = copy.deepcopy(original)
        adapted, receipt = control.omit_far_vectors(original)
        self.assertEqual(original, before)
        self.assertEqual(len(adapted), 15)
        removals = []
        for old, new in zip(original, adapted):
            for scope, a, b in [("root", old, new)] + [("child", a, b) for a, b in zip(old["distributions"], new["distributions"])]:
                if a["queryContextVector"] == control.verify.FAR:
                    self.assertNotIn("queryContextVector", b)
                    removals.append((old["identifier"], scope, a["identifier"]))
                else:
                    self.assertEqual(b["queryContextVector"], [0, 0, 0])
                stripped_a, stripped_b = copy.deepcopy(a), copy.deepcopy(b)
                stripped_a.pop("queryContextVector", None)
                stripped_b.pop("queryContextVector", None)
                if scope == "root":
                    stripped_a.pop("distributions")
                    stripped_b.pop("distributions")
                self.assertEqual(stripped_a, stripped_b)
        self.assertEqual(removals, [(r["dataset_id"], r["scope"], r["identifier"]) for r in receipt["missing_vector_fields"]])
        self.assertEqual(receipt["source_fixture_sha256"], control.digest(original))
        self.assertEqual(receipt["adapted_fixture_sha256"], control.digest(adapted))
        self.assertLessEqual(sum("queryContextVector" in d and d["tenantId"] == 0 and d["publishingState"] == "published"
                                 and d["accessControl"]["ownerId"] == "visible" for d in adapted), 8)

    def test_missing_state_legacy_is_separate_not_ninth_old_root(self):
        docs = control.legacy_fixtures()
        self.assertNotIn("publishingState", docs[0]["distributions"][0])
        self.assertNotIn("publishingState", docs[-1])
        self.assertEqual(len(control.verify.expected_roots("baseline")), 8)
        value = response(docs, {"legacy"}, lambda _: {"legacy-visible"})
        self.assertEqual(control.assert_legacy(value, docs)["root_ids"], ["legacy"])

    def test_optional_authentic_k1_contract_and_explicit_negative_counterexamples(self):
        with tempfile.TemporaryDirectory() as directory:
            args = self.setup_args(pathlib.Path(directory), k1=True)
            calls = []
            with mock.patch.object(control.replay, "request", side_effect=self.engine(calls)):
                report = control.verify_raw(args)
            self.assertEqual(report["prefilter_topk1"]["status"], "passed")
            self.assertEqual(len(report["resources"]), 4)
            self.assertEqual(report["prefilter_topk1"]["details"]["root"]["negative_ids"], [])
            self.assertEqual(report["prefilter_topk1"]["details"]["child"]["negative_ids"], ["mixed"])
            self.assertTrue(report["cleanup_all_acknowledged"])

    def test_optional_existing_pipeline_read_only_hash_and_parity(self):
        for corrupt in (None, "score-parity", "id-parity", "total-parity", "facet-parity"):
            with self.subTest(corrupt=corrupt), tempfile.TemporaryDirectory() as directory:
                args = self.setup_args(pathlib.Path(directory))
                args.production_pipeline_id = "production-default"
                calls = []
                with mock.patch.object(control.replay, "request", side_effect=self.engine(calls, corrupt)):
                    if corrupt:
                        with self.assertRaises(AssertionError):
                            control.verify_raw(args)
                        report = json.loads(pathlib.Path(args.output).read_text())
                    else:
                        report = control.verify_raw(args)
                self.assertEqual(report["production_pipeline_parity"]["status"], "failed" if corrupt else "passed")
                pipeline_calls = [c for c in calls if "/_search/pipeline/" in c[2]]
                self.assertEqual([c[1] for c in pipeline_calls], ["GET"] if corrupt else ["GET", "GET"])
                self.assertTrue(report["production_pipeline_parity"]["contains_normalization_processor"])
                self.assertTrue(report["production_pipeline_parity"]["expected_raw_no_op"])
                self.assertEqual(report["status"], "failed" if corrupt else "passed")
                if not corrupt:
                    details = report["production_pipeline_parity"]["details"]
                    self.assertEqual(len(details["definition_sha256"]), 64)
                    self.assertEqual(details["mode_labels"], list(control.LABELS))
                    invoked = [r for r in report["executed_requests"] if r["pipeline"] == "production-default"]
                    self.assertEqual([r["mode"] for r in invoked], list(control.LABELS))

    def test_existing_pipeline_rejects_external_or_other_processor_paths(self):
        bad_definitions = [
            {"request_processors": [{"script": {"source": "external-path"}}], "phase_results_processors": [{"normalization-processor": {}}]},
            {"response_processors": [{"script": {"source": "external-path"}}], "phase_results_processors": [{"normalization-processor": {}}]},
            {"phase_results_processors": [{"other-processor": {}}]},
            {"phase_results_processors": [{"normalization-processor": {}}, {"normalization-processor": {}}]},
            {"phase_results_processors": []},
        ]
        for definition in bad_definitions:
            with self.subTest(definition=definition), tempfile.TemporaryDirectory() as directory:
                args = self.setup_args(pathlib.Path(directory))
                args.production_pipeline_id = "production-default"
                calls = []
                engine = self.engine(calls)
                def unsupported(base, method, path, body=None, content_type="application/json"):
                    if method == "GET":
                        calls.append((base, method, path, body))
                        return {"production-default": definition}
                    return engine(base, method, path, body, content_type)
                with mock.patch.object(control.replay, "request", side_effect=unsupported), self.assertRaises(AssertionError):
                    control.verify_raw(args)
                self.assertFalse(any("search_pipeline=production-default" in c[2] for c in calls))
                report = json.loads(pathlib.Path(args.output).read_text())
                self.assertEqual(report["production_pipeline_parity"]["status"], "failed")
                self.assertEqual(len(report["production_pipeline_parity"]["definition_sha256"]), 64)
                self.assertTrue(report["cleanup_all_acknowledged"])

    def test_local_uuid_and_opt_in_boundaries(self):
        for bad in ("http://host.docker.internal:9200", "https://localhost", "http://example.com", "http://localhost/path", "http://user@localhost"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                control.local_url(bad)
        good = control.PREFIX + "12345678-1234-4234-8234-123456789abc-eligibility"
        self.assertEqual(control.owned(good), good)
        for bad in ("datasets54", good + "*", good.replace("4234", "1234"), good + "/_search"):
            with self.subTest(bad=bad), self.assertRaises((AssertionError, ValueError)):
                control.owned(bad)
        with tempfile.TemporaryDirectory() as directory:
            args = self.setup_args(pathlib.Path(directory))
            args.allow_local_writes = False
            with mock.patch.object(control.replay, "request") as request, self.assertRaises(AssertionError):
                control.verify_raw(args)
            request.assert_not_called()


if __name__ == "__main__":
    unittest.main()
