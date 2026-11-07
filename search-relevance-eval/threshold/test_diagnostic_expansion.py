"""Offline toy-source adversarial tests for the separate forced-D expansion gate."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from copy import deepcopy

HERE = Path(__file__).resolve().parent

def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


d = module("threshold_diagnostic_expansion", HERE / "diagnostic_expansion.py")
toy = module("threshold_validator_test_support", HERE / "test_validate.py")
v = toy.v


class DiagnosticExpansionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve()
        self.fixture = toy.StudyFixture(self.root)
        strict_stage = self.fixture.stage()
        self.fixture.expansion()
        evidence = []
        queries = self.fixture.registration["queries"]
        for item in strict_stage["record_evidence"]:
            evidence.append({"seed": item["seed"], "dataset_id": item["dataset_id"], "source": item["source"],
                             "raw_record_sha256": item["raw_record_sha256"],
                             "observation_original_unchanged": item["observation"],
                             "independent_intent_derivation_before_query_masks": item["independent_derivation"]["intent_grades"],
                             "independent_query_grades": {qid: item["independent_derivation"]["intent_grades"][q["intent_id"]] for qid, q in queries.items()},
                             "branch_measurement_support": item["independent_derivation"]["branch_measurement_support"]})
        self.stage = {"record_evidence": evidence, "source_stage_one": {"path": "manifest.json", "sha256": v.sha(self.root / "manifest.json")},
                      "accepted_terminal_bindings": strict_stage["accepted_terminal_bindings"],
                      "explicit_unknown_pairs": [], "manual_actual_record_count": 60, "reviewed_terminal_bundle_count": 1,
                      "spec_freeze_sha256": v.sha(self.root / "spec-freeze.json"), "stage_manifest_sha256": v.sha(self.root / "manifest.json"),
                      "terminal_templates_sha256": v.sha(self.root / "terminals.json"), "pair_scope_adjudication": {},
                      "historical_projection_source_closure": {}, "strict_conformance_failures": [{"failure": "toy intentionally nonconformant"}],
                      "non_scoring_metadata_discrepancies": []}
        toy.dump(self.root / "diagnostic-stage.json", self.stage)
        self.manifest = v.load(self.root / "expansion.json")
        self.manifest.update(stage="expanded", diagnostic_only=True, forced_recommendation="D", promotion_allowed=False,
                             strict_fixture_conformance_passed=False, U_coerced_to_zero=False,
                             stage_validation_sha256=v.sha(self.root / "diagnostic-stage.json"),
                             source_stage_manifest_sha256=self.stage["stage_manifest_sha256"],
                             terminal_templates_sha256=self.stage["terminal_templates_sha256"], record_receipts=[])
        for ref in self.manifest["corpora"]:
            ref["record_count"] = ref["catalog_size"]
            docs, raw = v.jsonl_rows(self.root / ref["path"])
            name = ref["path"] + ".receipt.json"
            toy.dump(self.root / name, {"seed": ref["seed"], "catalog_size": ref["catalog_size"],
                                        "records": [{"identifier": rid, "raw_record_sha256": v.digest(raw[rid]),
                                                     "canonical_record_sha256": v.canonical_sha(doc)} for rid, doc in docs.items()]})
            self.manifest["record_receipts"].append({"seed": ref["seed"], "catalog_size": ref["catalog_size"],
                                                     "path": name, "sha256": v.sha(self.root / name)})
        self.save_manifest()
        self.stage_patch = patch.object(d, "reproduce_diagnostic_stage", return_value=(v, self.fixture.registration, self.stage, self.root / "diagnostic-stage.json"))
        self.approval_patch = patch.object(d, "verify_parent_approval", return_value={"unit_test_only": True})
        self.stage_patch.start(); self.approval_patch.start()

    def tearDown(self):
        self.stage_patch.stop(); self.approval_patch.stop()
        self.tmp.cleanup()

    def save_manifest(self):
        toy.dump(self.root / "expansion.json", self.manifest)

    def run_gate(self):
        return d.validate_diagnostic_expansion(self.root, "expansion.json", "diagnostic-stage.json")

    def update_source(self, size, mutate):
        ref = next(x for x in self.manifest["corpora"] if x["catalog_size"] == size)
        docs = [json.loads(x) for x in (self.root / ref["path"]).read_text().splitlines()]
        mutate(docs)
        (self.root / ref["path"]).write_text("".join(toy.line(x) for x in docs))
        ref["sha256"] = v.sha(self.root / ref["path"])
        receipt_ref = next(x for x in self.manifest["record_receipts"] if x["catalog_size"] == size)
        rows, raw = v.jsonl_rows(self.root / ref["path"])
        toy.dump(self.root / receipt_ref["path"], {"seed": 1, "catalog_size": size,
                                                  "records": [{"identifier": rid, "raw_record_sha256": v.digest(raw[rid]),
                                                               "canonical_record_sha256": v.canonical_sha(doc)} for rid, doc in rows.items()]})
        receipt_ref["sha256"] = v.sha(self.root / receipt_ref["path"])
        self.save_manifest()

    def test_complete_pure_gate_keeps_D_and_tangential_one(self):
        before = {str(p): p.read_bytes() for p in self.root.iterdir()}
        result = self.run_gate()
        summary = result["manifest"]
        self.assertEqual(summary["actual_rows_programmatically_closed_all_sizes"], 183)
        self.assertEqual(summary["total_query_record_seed_size_pairs"], 549)
        self.assertEqual(summary["intentional_ambiguity_pair_count"], 183)
        self.assertEqual(summary["forced_recommendation"], "D")
        self.assertFalse(summary["actual_text_validation_passed"])
        self.assertFalse(summary["embeddings_allowed"])
        rows = [x for x in result["qrels"] if x["dataset_id"] == "g01-r002" and x["query_id"] == "q"]
        self.assertEqual([x["grade"] for x in rows], [1])
        self.assertEqual(before, {str(p): p.read_bytes() for p in self.root.iterdir()})

    def test_free_prose_extra_fact_fails_even_if_receipts_rehashed(self):
        def mutate(docs):
            docs[-1]["description"] += " Additional flow observations."
            docs[-1]["queryContext"] = v.production_context(docs[-1])
        self.update_source(62, mutate)
        with self.assertRaisesRegex(ValueError, "entire metadata"):
            self.run_gate()

    def test_wrong_neutral_quality_cannot_hide_behind_receipt(self):
        self.update_source(62, lambda docs: docs[-1].update(quality=2))
        with self.assertRaisesRegex(ValueError, "entire metadata"):
            self.run_gate()

    def test_core_must_match_original_raw_source(self):
        # Change core at every size so a cross-size subset check alone would pass.
        for size in (60, 61, 62):
            def mutate(docs):
                docs[0]["description"] += " Unreviewed text."
                docs[0]["queryContext"] = v.production_context(docs[0])
            self.update_source(size, mutate)
        with self.assertRaisesRegex(ValueError, "core raw row"):
            self.run_gate()

    def test_missing_catalogue_is_not_optional(self):
        self.manifest["corpora"].pop(); self.save_manifest()
        with self.assertRaisesRegex(ValueError, "mandatory"):
            self.run_gate()

    def test_missing_receipt_fails(self):
        self.manifest["record_receipts"].pop(); self.save_manifest()
        with self.assertRaisesRegex(ValueError, "Every expanded"):
            self.run_gate()

    def test_forged_row_receipt_fails(self):
        ref = self.manifest["record_receipts"][-1]
        receipt = v.load(self.root / ref["path"]); receipt["records"][-1]["raw_record_sha256"] = "0" * 64
        toy.dump(self.root / ref["path"], receipt); ref["sha256"] = v.sha(self.root / ref["path"]); self.save_manifest()
        with self.assertRaisesRegex(ValueError, "claimed raw"):
            self.run_gate()

    def test_promotional_expansion_status_rejected(self):
        self.manifest["promotion_allowed"] = True; self.save_manifest()
        with self.assertRaisesRegex(ValueError, "promotion"):
            self.run_gate()

    def test_stage_hash_drift_rejected(self):
        self.manifest["stage_validation_sha256"] = "0" * 64; self.save_manifest()
        with self.assertRaisesRegex(ValueError, "bindings"):
            self.run_gate()

    def test_masked_core_case_repeats_sizes_without_zero_imputation(self):
        original = next(x for x in self.stage["record_evidence"] if x["dataset_id"] == "t001")
        original["independent_query_grades"]["q"] = "U"
        self.stage["explicit_unknown_pairs"] = [{"seed": 1, "query_id": "q", "dataset_id": "t001",
                                                  "reason": "unit-test explicit uncertainty", "supported_grade_interval": [2, 3]}]
        result = self.run_gate()
        mask = result["manifest"]["scored_uncertainty_mask"]
        self.assertEqual(len(mask), 3)
        self.assertEqual({x["size"] for x in mask}, {60, 61, 62})
        self.assertEqual(len({x["uncertainty_case_key"] for x in mask}), 1)
        self.assertTrue(all(x["grade"] == "U" and x["supported_grade_interval"] == [2, 3] for x in mask))

    def test_masked_representative_cannot_be_coerced_numeric(self):
        self.stage["explicit_unknown_pairs"] = [{"seed": 1, "query_id": "q", "dataset_id": "t001",
                                                  "reason": "explicit uncertainty", "supported_grade_interval": [2, 3]}]
        with self.assertRaisesRegex(ValueError, "coerced"):
            self.run_gate()

    def test_distinct_children_are_not_merged_for_branch_completeness(self):
        context = {"product": "pipes", "process": "leak_tests", "basis": "observed_not_simulated",
                   "facts": {"pressure": [toy.citation("pressure", "distributions.0.description")],
                             "flow": [toy.citation("flow", "distributions.1.description")]}}
        support = v.branch_support(self.fixture.intents[0], [context])
        self.assertFalse(support["nested.0"]["useful_measurement_complete"])
        self.assertFalse(support["nested.1"]["useful_measurement_complete"])

    def test_shared_case_key_is_not_selected_by_catalog_size_or_threshold(self):
        self.assertEqual(d.uncertainty_case_key(38873, "t08p1", "t045"), d.uncertainty_case_key(38873, "t08p3", "t045"))
        self.assertNotEqual(d.uncertainty_case_key(38871, "t03p3", "t013"), d.uncertainty_case_key(38872, "t03p3", "t013"))

    def test_jsonl_output_is_exclusive(self):
        path = self.root / "output.jsonl"
        d.write_jsonl_exclusive(path, [{"grade": "U", "text": "café"}])
        self.assertEqual(path.read_text(), '{"grade":"U","text":"café"}\n')
        with self.assertRaises(FileExistsError):
            d.write_jsonl_exclusive(path, [])

    def test_locked_validator_bytes_checked(self):
        (self.root / "validate.py").write_text("# untrusted different implementation\n")
        with self.assertRaisesRegex(ValueError, "Locked"):
            d.locked_validator(self.root)


if __name__ == "__main__":
    unittest.main()
