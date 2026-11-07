"""Offline contract tests over two pre-existing actual Scala smoke exports.

Mutations below are adversarial unit fixtures, never benchmark/export evidence.
No subprocess, embedding, engine, search, analyze or new target generation.
"""
import copy
import importlib.util
import json
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("threshold_export_contract_tests", ROOT / "export_contract.py")
contract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contract)
SMOKE = ROOT.parent / "scala" / "smoke" / "baseline.jsonl"


def exports():
    return [json.loads(line) for line in SMOKE.read_text(encoding="utf8").splitlines() if line.strip()]


def threshold(request, value):
    result = copy.deepcopy(request)
    for _, _, payload in contract.knn_copies(result["body"]):
        payload["min_score"] = value
    return result


def diagnostic(request, k=10):
    # UNIT FIXTURE ONLY: move existing exact eligibility filter inline and remove
    # radial wrapper, matching the read-only post-3909 production branch shape.
    result = copy.deepcopy(request)
    body = result["body"]
    for path, field, payload in contract.knn_copies(body):
        wrapper = contract.at(body, path[:-5])
        knn = copy.deepcopy(wrapper["bool"]["must"][0])
        inner = knn["knn"][field]
        inner.pop("min_score")
        inner.update(k=k, filter=copy.deepcopy(wrapper["bool"]["filter"][0]))
        wrapper.clear()
        wrapper.update(knn)
    return result


class ExportContractTests(unittest.TestCase):
    def test_actual_existing_default_smoke_all_copies(self):
        rows = exports()
        self.assertEqual([row["query_id"] for row in rows], ["smoke-unfiltered", "smoke-filtered"])
        self.assertEqual(contract.validate_exports(rows, min_score=.5, baseline_commit="ba181562")["queries"], 2)
        for row in rows:
            self.assertEqual(contract.validate_request(row["request"], min_score=.5),
                             {"knn_copies": 6, "scopes": 3, "mode": "min-score"})

    def test_threshold_pairs_change_only_all_six_numeric_knn_values(self):
        for row in exports():
            request = row["request"]
            before = copy.deepcopy(request)
            for value in (.01, .25, .5, .75, 1):
                with self.subTest(query=row["query_id"], value=value):
                    candidate = threshold(request, value)
                    result = contract.threshold_pair(request, candidate, .5, value)
                    self.assertEqual(result["changed_min_scores"], 0 if value == .5 else 6)
                    self.assertEqual(result["other_changes"], 0)
            self.assertEqual(request, before)

    def test_invalid_thresholds_not_numeric_bool_or_finite_in_range(self):
        request = exports()[0]["request"]
        for value in (0, -.1, 1.01, float("nan"), float("inf"), -float("inf"), True, False, "0.5", None):
            with self.subTest(value=value), self.assertRaises(ValueError):
                contract.validate_request(threshold(request, value), min_score=value)

    def test_every_root_nested_and_aggregation_copy_required(self):
        request = exports()[1]["request"]
        for path, _, _ in contract.knn_copies(request["body"]):
            for change in ("missing", "stale", "k", "distance", "boost", "inline", "vector"):
                with self.subTest(path=path, change=change):
                    candidate = threshold(request, .75)
                    payload = contract.at(candidate["body"], path)
                    if change == "missing":
                        contract.at(candidate["body"], path[:-2]).clear()
                    elif change == "stale":
                        payload["min_score"] = .5
                    elif change == "k":
                        payload["k"] = 10
                    elif change == "distance":
                        payload["max_distance"] = 1
                    elif change == "boost":
                        payload["boost"] = 1
                    elif change == "inline":
                        payload["filter"] = {"match_all": {}}
                    elif change == "vector":
                        payload["vector"][0] += .1
                    with self.assertRaises(ValueError):
                        contract.threshold_pair(request, candidate, .5, .75)

    def test_strict_pair_rejects_all_non_threshold_request_differences(self):
        request = exports()[1]["request"]
        changes = {
            "pipeline-param": lambda r: r["query_params"].update(search_pipeline="other"),
            "extra-param": lambda r: r["query_params"].update(preference="x"),
            "path": lambda r: r.update(path="/other/_search"),
            "method": lambda r: r.update(method="GET"),
            "size": lambda r: r["body"].update(size=10),
            "body-threshold": lambda r: r["body"].update(min_score=.75),
            "pipeline-body": lambda r: r["body"].update(search_pipeline={"normalization": "min_max"}),
            "post-filter": lambda r: r["body"].update(post_filter={"match_all": {}}),
            "quality": lambda r: r["body"]["query"]["function_score"]["functions"][0].update(weight=2),
            "function-score-mode": lambda r: r["body"]["query"]["function_score"].update(score_mode="max"),
            "filter": lambda r: r["body"]["aggs"]["Publisher-global"]["aggs"]["filter"]["filter"]["bool"].update(boost=2),
            "new-aggregation": lambda r: r["body"]["aggs"].update(extra={"min_score": .75}),
        }
        for name, mutate in changes.items():
            with self.subTest(name=name):
                candidate = threshold(request, .75)
                mutate(candidate)
                with self.assertRaises(ValueError):
                    contract.threshold_pair(request, candidate, .5, .75)

    def test_diagnostic_k10_has_inline_filters_and_no_radial_fields(self):
        for row in exports():
            request = diagnostic(row["request"])
            self.assertEqual(contract.validate_request(request, k=10)["knn_copies"], 6)
            for _, field, payload in contract.knn_copies(request["body"]):
                self.assertNotIn("min_score", payload)
                self.assertNotIn("max_distance", payload)
                self.assertEqual(payload["k"], 10)
                self.assertIn("filter", payload)
                self.assertEqual(payload.get("boost"), 50 if field == contract.ROOT_FIELD else None)

    def test_topk_missing_eligibility_legacy_branch_or_inline_filter_rejected(self):
        request = diagnostic(exports()[0]["request"])
        for path, field, _ in contract.knn_copies(request["body"]):
            for change in ("filter", "tenant", "publishing", "radial", "wrong-k"):
                with self.subTest(path=path, change=change):
                    candidate = copy.deepcopy(request)
                    payload = contract.at(candidate["body"], path)
                    if change == "filter":
                        payload.pop("filter")
                    elif change in ("tenant", "publishing"):
                        filters = payload["filter"]["bool"]["filter"]
                        filters.pop(0 if change == "tenant" else 2)
                    elif change == "radial":
                        payload["min_score"] = .5
                    else:
                        payload["k"] = 1
                    with self.assertRaises(ValueError):
                        contract.validate_request(candidate, k=10)
        candidate = copy.deepcopy(request)
        for _, field, payload in contract.knn_copies(candidate["body"]):
            if field == contract.NESTED_FIELD:
                payload["filter"]["bool"]["filter"][2]["bool"]["should"].pop()
                break
        with self.assertRaisesRegex(ValueError, "legacy"):
            contract.validate_request(candidate, k=10)

    def test_mutually_exclusive_explicit_modes_and_export_provenance(self):
        request = exports()[0]["request"]
        for kwargs in ({}, {"min_score": .5, "k": 10}, {"k": 0}, {"k": True}):
            with self.assertRaises(ValueError):
                contract.validate_request(request, **kwargs)
        rows = exports()
        with self.assertRaisesRegex(ValueError, "baseline"):
            contract.validate_exports(rows, min_score=.5)
        for row in rows:
            row["baseline_commit"] = contract.BASELINE
        self.assertEqual(contract.validate_exports(rows, min_score=.5)["queries"], 2)
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            contract.validate_exports(rows + rows, min_score=.5)
        with self.assertRaisesRegex(ValueError, "Empty"):
            contract.validate_exports([], min_score=.5)

    def test_diagnostic_k1_is_not_an_exact_radial_set_oracle(self):
        # Mode shape is valid for any positive k; an engine's different k=1 hit
        # set cannot be reclassified here as radial/top-k API unsupported.
        request = diagnostic(exports()[0]["request"], k=1)
        self.assertEqual(contract.validate_request(request, k=1)["mode"], "top-k")


class RoleDiagnosticTests(unittest.TestCase):
    def mixed(self, request, dataset, distribution):
        candidate = copy.deepcopy(request)
        for _, field, payload in contract.knn_copies(candidate["body"]):
            payload["min_score"] = dataset if field == contract.ROOT_FIELD else distribution
        return candidate

    def test_frozen_role_pairs_only_change_expected_numeric_leaves(self):
        for row in exports():
            request = row["request"]
            before = copy.deepcopy(request)
            for dataset, distribution, changes in ((.5, .5, 0), (.45, .45, 6), (.45, .5, 3), (.5, .45, 3)):
                with self.subTest(dataset=dataset, distribution=distribution):
                    candidate = self.mixed(request, dataset, distribution)
                    report = contract.role_threshold_pair(request, candidate, dataset_min_score=dataset,
                                                          distribution_min_score=distribution)
                    self.assertTrue(report["diagnostic_only"])
                    self.assertEqual(report["changed_min_scores"], changes)
                    self.assertEqual(report["other_changes"], 0)
                    if dataset != distribution:
                        with self.assertRaises(ValueError):
                            contract.validate_request(candidate, min_score=dataset)
                        with self.assertRaises(ValueError):
                            contract.threshold_pair(request, candidate, .5, dataset)
            self.assertEqual(request, before)

    def test_each_incorrect_role_or_facet_copy_and_params_change_rejected(self):
        request = exports()[1]["request"]
        for path, field, _ in contract.knn_copies(request["body"]):
            with self.subTest(path=path):
                candidate = self.mixed(request, .45, .5)
                contract.at(candidate["body"], path)["min_score"] = .5 if field == contract.ROOT_FIELD else .45
                with self.assertRaisesRegex(ValueError, "role threshold"):
                    contract.role_threshold_pair(request, candidate)
        changes = (lambda r: r["query_params"].update(search_pipeline="_none"),
                   lambda r: r["body"]["query"]["function_score"]["functions"][0].update(weight=2),
                   lambda r: r.update(path="/different/_search"),
                   lambda r: r["body"].update(size=10))
        for mutate in changes:
            candidate = self.mixed(request, .45, .5)
            mutate(candidate)
            with self.assertRaises(ValueError):
                contract.role_threshold_pair(request, candidate)

    def test_unregistered_pairs_non_numeric_values_and_nonuniform_reference_rejected(self):
        request = exports()[0]["request"]
        for dataset, distribution in ((.44, .5), (.45, .48), (True, .5), (float("nan"), .5), (.5, "0.45")):
            with self.subTest(dataset=dataset, distribution=distribution), self.assertRaises(ValueError):
                contract.role_threshold_pair(request, self.mixed(request, .45, .5),
                                             dataset_min_score=dataset, distribution_min_score=distribution)
        with self.assertRaises(ValueError):
            contract.role_threshold_pair(threshold(request, .45), self.mixed(request, .45, .5))
        with self.assertRaises(ValueError):
            contract.role_threshold_pair(request, self.mixed(request, .45, .5), reference_score=.45)


class RequestSetTests(unittest.TestCase):
    def sets(self, labels=("ms_050", "ms_045", "topk10diag")):
        result = {}
        for label in labels:
            rows = exports()
            for row in rows:
                row["baseline_commit"] = contract.BASELINE
                row["config_sha"] = "a" * 64
                row["request"] = (diagnostic(row["request"]) if label == contract.DIAGNOSTIC_LABEL
                                  else threshold(row["request"], contract.THRESHOLD_LABELS[label]))
            result[label] = rows
        return result

    def test_subsets_and_all_eight_labels_with_id_based_pairing(self):
        for labels in (("ms_050", "ms_045"), tuple(contract.THRESHOLD_LABELS) + (contract.DIAGNOSTIC_LABEL,)):
            sets = self.sets(labels)
            sets["ms_045"].reverse()
            report = contract.validate_request_sets(sets)
            self.assertEqual(report["query_count"], 2)
            self.assertEqual(report["request_sets"]["ms_045"]["changed_min_scores"], 12)
            self.assertEqual(report["request_sets"]["ms_050"]["changed_min_scores"], 0)
            self.assertEqual(report["full_frozen_label_set"], len(labels) == 8)
            self.assertEqual(len(report["request_sets"]["ms_050"]["exports_canonical_sha256"]), 64)
            json.dumps(report, allow_nan=False)

    def test_labels_duplicates_ids_and_non_threshold_mutations_fail_closed(self):
        for change in ("no-reference", "reference-only", "unknown", "duplicate-id", "missing-id", "blank-id", "pipeline", "wrong-score"):
            with self.subTest(change=change):
                sets = self.sets()
                if change == "no-reference":
                    sets.pop("ms_050")
                elif change == "reference-only":
                    sets = {"ms_050": sets["ms_050"]}
                elif change == "unknown":
                    sets["new-arm"] = sets["ms_045"]
                elif change == "duplicate-id":
                    sets["ms_045"].append(copy.deepcopy(sets["ms_045"][0]))
                elif change == "missing-id":
                    sets["ms_045"].pop()
                elif change == "blank-id":
                    sets["ms_045"][0]["query_id"] = ""
                elif change == "pipeline":
                    sets["ms_045"][0]["request"]["query_params"]["search_pipeline"] = "_none"
                else:
                    sets["ms_045"][0]["request"] = threshold(sets["ms_045"][0]["request"], .44)
                with self.assertRaises(ValueError):
                    contract.validate_request_sets(sets)

    def test_config_binding_and_exclusive_radial_mode(self):
        sets = self.sets()
        with tempfile.TemporaryDirectory() as temp:
            paths = {}
            for label in sets:
                hybrid = ({"k": 10, "minScore": .5} if label == contract.DIAGNOSTIC_LABEL
                          else {"minScore": contract.THRESHOLD_LABELS[label], "k": None, "maxDistance": None})
                path = pathlib.Path(temp) / (label + ".json")
                path.write_text(json.dumps({"config_sha": "a" * 64, "elasticSearch": {
                    "indices": {"datasets": {"hybridSearch": hybrid}}}}), encoding="utf8")
                paths[label] = path
            report = contract.validate_request_sets(sets, paths)
            self.assertEqual(report["request_sets"]["topk10diag"]["mode"], "top-k-diagnostic")
            self.assertEqual(len(report["request_sets"]["ms_045"]["config_file_sha256"]), 64)
            with self.assertRaisesRegex(ValueError, "exactly"):
                contract.validate_request_sets(sets, {"ms_050": paths["ms_050"]})
            original = paths["ms_045"].read_text()
            for key, value in (("k", 10), ("maxDistance", 1), ("minScore", .5)):
                document = json.loads(original)
                document["elasticSearch"]["indices"]["datasets"]["hybridSearch"][key] = value
                paths["ms_045"].write_text(json.dumps(document))
                with self.assertRaisesRegex(ValueError, "exclusively"):
                    contract.validate_request_sets(sets, paths)
            paths["ms_045"].write_text(original)
            sets["ms_045"][0]["config_sha"] = "b" * 64
            with self.assertRaisesRegex(ValueError, "provenance"):
                contract.validate_request_sets(sets, paths)

    def test_topk_separate_structure_not_radial_pair_diff(self):
        sets = self.sets(("ms_050", "topk10diag"))
        report = contract.validate_request_sets(sets)
        self.assertNotIn("changed_min_scores", report["request_sets"]["topk10diag"])
        self.assertEqual(report["request_sets"]["topk10diag"]["queries"], 2)
        for row in sets["topk10diag"]:
            for _, _, payload in contract.knn_copies(row["request"]["body"]):
                payload["k"] = 1
        with self.assertRaises(ValueError):
            contract.validate_request_sets(sets)


if __name__ == "__main__":
    unittest.main()
