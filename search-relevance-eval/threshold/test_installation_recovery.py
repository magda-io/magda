"""Offline mapping/source recovery tests; no engine/model/search operations."""
import copy
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest import mock

SOURCE = Path(__file__).with_name("installation_recovery.py")
spec = importlib.util.spec_from_file_location("installation_recovery_tests", SOURCE)
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


class InstallationRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.expected = {"properties": {
            "publisher": {"type": "object", "properties": {"name": {"type": "keyword"}}},
            "distributions": {"type": "nested", "properties": {"format": {"type": "keyword"}}},
            "queryContextVector": {"type": "knn_vector", "dimension": 768}}}
        self.actual = copy.deepcopy(self.expected)
        self.actual["properties"]["publisher"].pop("type")
        self.actual["properties"]["landingPage"] = copy.deepcopy(r.LANDING_PAGE)
        self.docs = [{"identifier": "unit", "landingPage": "https://unit.invalid", "queryContextVector": [1., 0.]}]
        self.exports = [{"request": {"body": {"query": {"term": {"title": "unit"}}}}}]
        self.patcher = mock.patch.object(r.ex.replay, "request", side_effect=AssertionError("No live HTTP"))
        self.http = self.patcher.start()
        self.addCleanup(self.patcher.stop)

    def test_accepts_only_redundant_object_and_exact_unused_string_extension(self):
        before = copy.deepcopy((self.expected, self.actual, self.docs))
        proof = r.semantic_mapping(self.expected, self.actual, self.docs, self.exports)
        self.assertTrue(proof["semantic_mapping_observation_passed"])
        self.assertFalse(proof["strict_mapping_byte_equality_passed"])
        self.assertEqual(proof["actual_mapping_sha256"], r.ex.digest(self.actual))
        self.assertEqual(proof["licensed_dynamic_extensions"][0]["source_path"], "landingPage")
        self.assertEqual((self.expected, self.actual, self.docs), before)
        self.http.assert_not_called()

    def test_rejects_keyword_nested_knn_analyzer_and_unknown_field_drift(self):
        mutants = []
        for path, value in ((["publisher", "properties", "name", "type"], "text"),
                            (["distributions", "type"], "object"),
                            (["queryContextVector", "dimension"], 3),
                            (["landingPage", "fields", "keyword", "ignore_above"], 255)):
            actual = copy.deepcopy(self.actual)
            node = actual["properties"]
            for part in path[:-1]:
                node = node[part]
            node[path[-1]] = value
            mutants.append(actual)
        mutants.append({**self.actual, "dynamic": False})
        actual = copy.deepcopy(self.actual)
        actual["properties"]["quality"] = {"type": "float"}
        mutants.append(actual)
        actual = copy.deepcopy(self.actual)
        actual["properties"]["publisher"]["properties"]["name"]["analyzer"] = "english"
        mutants.append(actual)
        actual = copy.deepcopy(self.actual)
        actual["properties"]["publisher"]["type"] = None
        mutants.append(actual)
        for actual in mutants:
            with self.subTest(actual=actual), self.assertRaises(ValueError):
                r.semantic_mapping(self.expected, actual, self.docs, self.exports)

    def test_null_source_values_skip_engine_nonindexed_nulls_without_data_mutation(self):
        documents = [{"landingPage": None}, {"landingPage": "https://unit.invalid"},
                     {"distributions": [None, {"issued": None}, {"issued": "2025-01-01T00:00:00Z"}]}]
        before = copy.deepcopy(documents)
        values = [value for doc in documents for value in r.source_values(doc, ["landingPage"])]
        self.assertEqual(values, ["https://unit.invalid"])
        r.semantic_mapping(self.expected, self.actual, documents, self.exports)
        self.assertEqual(r.source_values(documents[-1], ["distributions", "issued"]), ["2025-01-01T00:00:00Z"])
        self.assertEqual(documents, before)
        with self.assertRaises(ValueError):
            r.typed_source([None], "string")
        with self.assertRaises(ValueError):
            r.typed_source([1], "string")
        r.semantic_mapping(self.expected, self.expected, [{"landingPage": None}], self.exports)
        with self.assertRaises(ValueError):
            r.semantic_mapping(self.expected, self.actual, [{"landingPage": None}], self.exports)
        r.typed_source([[None, "eng"]], "string_list")
        r.typed_source([{"id": "unit", "name": None, "url": None}], "source_object")
        with self.assertRaises(ValueError):
            r.typed_source([[None, 1]], "string_list")

    def test_object_type_without_properties_is_not_normalized(self):
        self.assertEqual(r.normalize_objects({"type": "object"}), {"type": "object"})
        self.assertEqual(r.normalize_objects({"type": "nested", "properties": {}}), {"type": "nested", "properties": {}})
        self.assertEqual(r.normalize_objects({"type": "object", "properties": None}), {"type": "object", "properties": None})

    def test_landingpage_null_nonstring_absent_source_and_queried_field_fail(self):
        for docs in ([{"landingPage": None}], [{"landingPage": 1}], [{}], [{"landingPage": ["url"]}]):
            with self.subTest(docs=docs), self.assertRaises(ValueError):
                r.semantic_mapping(self.expected, self.actual, docs, self.exports)
        for body in ({"query": {"term": {"landingPage.keyword": "url"}}},
                     {"query": {"query_string": {"query": "unit"}}},
                     {"query": {"simple_query_string": {"query": "unit", "fields": ["*"]}}},
                     {"query": {"simple_query_string": {"query": "unit", "default_field": "_all"}}}):
            with self.subTest(body=body), self.assertRaises(ValueError):
                r.semantic_mapping(self.expected, self.actual, self.docs, [{"request": {"body": body}}])

    def test_cohort_exact_dynamic_metadata_dates_objects_and_array_types(self):
        for cohort in ("LEGACY", "REAL"):
            expected = {"properties": {"contactPoint": {"type": "object", "properties": {}},
                "spatial": {"type": "object", "properties": {}}, "publisher": {"type": "object", "properties": {}},
                "distributions": {"type": "nested", "properties": {}}}}
            actual, doc = copy.deepcopy(expected), {"distributions": [{}]}
            for field, kind in r.SOURCE_FIELDS[cohort].items():
                mapping, value = actual, doc
                parts = field.split(".")
                for part in parts[:-1]:
                    mapping = mapping["properties"][part]
                    if part == "distributions":
                        value = value[part][0]
                    else:
                        value = value.setdefault(part, {})
                schema = ({"type": "date", "format": "strict_date_optional_time||epoch_millis"} if kind == "date" else
                          {"properties": {key: copy.deepcopy(r.LANDING_PAGE) for key in ("id", "name", "url")}}
                          if kind == "source_object" else copy.deepcopy(r.LANDING_PAGE))
                mapping["properties"][parts[-1]] = schema
                value[parts[-1]] = ("2025-01-01T00:00:00Z" if kind == "date" else ["en"] if kind == "string_list" else
                    {"id": "unit", "name": "unit", "url": "https://unit.invalid"} if kind == "source_object" else "unit")
            proof = r.semantic_mapping(expected, actual, [doc], self.exports, cohort)
            self.assertEqual(len(proof["licensed_dynamic_extensions"]), len(r.SOURCE_FIELDS[cohort]))
            with self.assertRaises(ValueError):
                r.semantic_mapping(expected, actual, [doc], self.exports, "NEW")
        for value, kind in ((None, "date"), ("notdate", "date"), (["en", 1], "string_list"),
                            ({"id": "a", "name": "a", "url": "a", "extra": "a"}, "source_object")):
            with self.subTest(value=value), self.assertRaises((ValueError, TypeError)):
                r.typed_source([value], kind)

    def test_query_text_metadata_words_allowed_but_field_references_rejected(self):
        r.unused_field([{"request": {"body": {"query": {"simple_query_string": {
            "query": "issued permits modified metadata landingPage", "fields": ["title^2", "description"]}}}}}], "issued")
        for body in ({"query": {"range": {"issued": {"gte": "2020"}}}},
                     {"aggs": {"dates": {"terms": {"field": "issued"}}}},
                     {"query": {"simple_query_string": {"query": "unit", "fields": ["issued^2"]}}},
                     {"script": {"source": "doc['issued'].value"}}, {"sort": {"issued": "desc"}}):
            with self.subTest(body=body), self.assertRaises(ValueError):
                r.unused_field([{"request": {"body": body}}], "issued")

    def test_exact_mget_source_vectors_and_metadata_no_search(self):
        row = {"_id": "unit", "_index": r.FIRST_INDEX, "found": True, "_source": copy.deepcopy(self.docs[0])}
        with mock.patch.object(r.ex.replay, "request", return_value={"docs": [row]}) as request:
            proof = r.verify_existing_source("http://127.0.0.1:19200", r.FIRST_INDEX, self.docs)
        self.assertEqual(request.call_args.args[2], "/" + r.FIRST_INDEX + "/_mget")
        self.assertEqual(proof["all_source_documents_verified_by_mget"], 1)
        self.assertEqual(proof["searches_executed"], 0)
        for mutate in (lambda value: value.update(found=False),
                       lambda value: value.update(_index="other"),
                       lambda value: value["_source"].update(queryContextVector=[0., 1.]),
                       lambda value: value["_source"].update(landingPage="changed")):
            bad = copy.deepcopy(row)
            mutate(bad)
            with mock.patch.object(r.ex.replay, "request", return_value={"docs": [bad]}), self.assertRaises(ValueError):
                r.verify_existing_source("http://127.0.0.1:19200", r.FIRST_INDEX, self.docs)

    def test_recovery_approval_must_bind_original_and_evidence_and_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            difference = root / "difference.json"
            difference.write_text(json.dumps({"index": r.FIRST_INDEX}))
            failed = root / "failed.log"
            failed.write_text("original failure retained")
            inventory = root / "inventory.json"
            inventory.write_text(json.dumps({"source_only_no_retrieval": True, "cases": [{
                "cohort": "NEW", "seed": 38871, "size": 60,
                "unmapped_prepared_fields": {"$.landingPage": {}}}]}))
            path = root / "recovery-approval.json"
            value = {"approved_by": "parent-agent", "action": "repair_mapping_observation_guard",
                "diagnostic_only": True, "forced_recommendation": "D", "promotion_allowed": False,
                "production_mapping_unchanged": True, "original_inputs_sha256": "inputs",
                "original_approval_sha256": "approval", "recovery_code_sha256": r.ex.replay.sha(SOURCE),
                "reuse_existing_index": r.FIRST_INDEX, "allow_expected_source_dynamic_fields": r.SOURCE_FIELDS,
                "source_extension_inventory": {"path": inventory.name, "sha256": r.ex.replay.sha(inventory)},
                "installation_failed_log": {"path": failed.name, "sha256": r.ex.replay.sha(failed)},
                "mapping_diff_source": {"path": difference.name, "sha256": r.ex.replay.sha(difference)}}
            args = SimpleNamespace(recovery_approval=path)
            verified = {"inputs_sha256": "inputs", "approval_sha256": "approval", "inputs": {"cases": [
                {"cohort": "NEW", "seed": 38871, "catalog_size": 60}]}}
            with mock.patch.object(r.ex, "REPO", root):
                path.write_text(json.dumps(value))
                r.recovery_gate(args, verified)
                for patch in ({"original_inputs_sha256": "wrong"}, {"recovery_code_sha256": "wrong"},
                              {"production_mapping_unchanged": False}, {"promotion_allowed": True},
                              {"reuse_existing_index": "another"}):
                    path.write_text(json.dumps(dict(value, **patch)))
                    with self.subTest(patch=patch), self.assertRaises(ValueError):
                        r.recovery_gate(args, verified)
        self.http.assert_not_called()

    def test_recovery_reuses_first_without_reinstall_and_creates_only_missing_case(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cases = [{"cohort": "NEW", "seed": seed, "catalog_size": 60,
                      "index": r.FIRST_INDEX if seed == 38871 else "magda-relevance-eval-unit-second"}
                     for seed in (38871, 38872)]
            for case in cases:
                target = r.ex.case_dir(root, case)
                (target / "exports").mkdir(parents=True)
                (target / "embedded-corpus.jsonl").write_text(json.dumps(dict(self.docs[0], distributions=[])) + "\n")
                for label in (*r.ex.contract.THRESHOLD_LABELS, r.ex.contract.DIAGNOSTIC_LABEL, "keyword"):
                    arm = target / "exports" / label
                    arm.mkdir()
                    (arm / "mapping.json").write_text(json.dumps({"mappings": self.expected}))
                    (arm / "requests.jsonl").write_text(json.dumps(self.exports[0]) + "\n")
            original = root / "export-completion.json"
            original.write_text("{}")
            approval = root / "recovery-approval.json"
            approval.write_text("{}")
            args = SimpleNamespace(allow_local_writes=True, artifact_root=root,
                                   recovery_approval=approval, engine_url="http://127.0.0.1:19200")
            verified = {"inputs": {"cases": cases}, "inputs_sha256": "unit"}
            events = []
            metadata = {"count": 60, "mapping_sha256": r.ex.digest(self.actual), "index_uuid": "unit-uuid"}
            def mapping_response(engine, method, path, body=None):
                index = path.split("/")[1]
                return {index: {"mappings": self.actual}}
            with mock.patch.object(r, "recovery_gate", return_value={"mapping_diff_source": {"path": "unit"}}), \
                 mock.patch.object(r.ex, "artifact_root", return_value=root), mock.patch.object(r.ex, "verify_exports"), \
                 mock.patch.object(r, "exists", side_effect=[True, False]), \
                 mock.patch.object(r, "verify_existing_source", side_effect=lambda *a: events.append("mget-first")), \
                 mock.patch.object(r.ex.replay, "install", side_effect=lambda a: events.append("install-" + a.index)), \
                 mock.patch.object(r.ex, "index_metadata", return_value=metadata), \
                 mock.patch.object(r.ex.replay, "request", side_effect=mapping_response):
                r.recover(args, verified)
            self.assertEqual(events, ["mget-first", "install-magda-relevance-eval-unit-second"])
            receipt = json.loads((root / "installation.json").read_text())
            self.assertEqual(len(receipt["cases"]), 2)
            self.assertTrue(receipt["initial_strict_installation_failure_preserved"])
            self.assertFalse(receipt["source_mapping_modified"])
            self.assertTrue(receipt["all_cases_installed_before_timings"])
            self.assertEqual(original.read_text(), "{}")

    def test_recovery_refuses_any_timing_release_before_engine_call(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "release-development.json").write_text("{}")
            args = SimpleNamespace(allow_local_writes=True, artifact_root=root)
            with mock.patch.object(r, "recovery_gate", return_value={}), \
                 mock.patch.object(r.ex, "artifact_root", return_value=root), \
                 mock.patch.object(r, "exists") as head, self.assertRaises(ValueError):
                r.recover(args, {})
            head.assert_not_called()
        self.http.assert_not_called()


if __name__ == "__main__":
    unittest.main()
