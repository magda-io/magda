"""Offline falsification tests for C's independent evidence gate.

Tiny handcrafted dictionaries test mechanics only; they are not benchmark records
or generated corpus variants. No generator code, engine or network is imported.
"""
import copy
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("independent_validator", Path(__file__).with_name("validate.py"))
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)


def citation(quote, field="description"):
    return [{"field": field, "quote": quote}]


def observed(value, quote=None):
    return {"value": value, "evidence": citation(quote or value)}


class IndependentGradeTests(unittest.TestCase):
    def setUp(self):
        self.intent = {"kind": "semantic", "required_claims": {
            "product": "probe", "process": "calibration", "constraint": "representative_measurements_not_simulation",
            "facts": ["error", "range", "uncertainty"], "formats_any": ["CSV"]}}
        self.context = {"product": "probe", "process": "calibration",
                        "basis": "representative_measurements_not_simulation", "facts": {"error", "range", "uncertainty"}}

    def grade(self, context=None, formats=None):
        return v.derive_grade(self.intent, "test-id", [context or self.context], formats if formats is not None else {"CSV"})

    def test_supported_three_two_one_zero(self):
        for n in range(4):
            context = dict(self.context, facts=set(["error", "range", "uncertainty"][:n]))
            self.assertEqual(n, self.grade(context))

    def test_wrong_product_process_simulation_and_format_are_zero(self):
        for key, wrong in [("product", "other"), ("process", "inventory"), ("basis", "simulation_only")]:
            self.assertEqual(0, self.grade(dict(self.context, **{key: wrong})))
        self.assertEqual(0, self.grade(formats={"PDF"}))

    def test_generator_fact_tags_cannot_rescue_missing_actual_evidence(self):
        context = dict(self.context, facts=set())
        context["canonical_claims"] = {"facts": ["error", "range", "uncertainty"]}
        context["expected_grade"] = 3
        self.assertEqual(0, self.grade(context))

    def test_administrative_topic_is_diagnostic_not_experimental_evidence(self):
        context = dict(self.context, basis="observed_administrative_records", facts=set())
        self.assertEqual(0, self.grade(context))
        diagnostic = {"kind": "ambiguous", "process_grade_rules": {"calibration": 2}}
        self.assertEqual(2, v.derive_grade(diagnostic, "id", [context], {"CSV"}))

    def test_facts_from_different_context_cannot_be_combined(self):
        other = dict(self.context, product="other", facts={"range", "uncertainty"})
        actual = dict(self.context, facts={"error"})
        self.assertEqual(1, v.derive_grade(self.intent, "id", [actual, other], {"CSV"}))

    def test_exact_identity_not_component_semantics(self):
        intent = {"kind": "exact", "authoritative_target_ids": ["parent"]}
        self.assertEqual(3, v.derive_grade(intent, "parent", [], set()))
        self.assertEqual(0, v.derive_grade(intent, "sole", [self.context], {"CSV"}))

    def test_ambiguous_multiple_defensible_meanings(self):
        intent = {"kind": "ambiguous", "process_grade_rules": {"factory": 3, "nursery": 3}}
        for process in ("factory", "nursery"):
            self.assertEqual(3, v.derive_grade(intent, "id", [{"process": process}], set()))


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.doc = {"identifier": "test-id", "description": "probe calibration empirical measurements error range uncertainty"}
        self.plan = {"hard_negative_for_intent_ids": ["s01"]}
        self.reviewers = {"fresh": {}}
        self.observation = {"reviewer_id": "fresh", "semantic_review_passed": True,
            "exhaustive_searchable_review": True, "issues": [], "no_answer_claims": [],
            "contexts": [{"product": observed("probe"), "process": observed("calibration"),
                "basis": observed("representative_measurements_not_simulation", "empirical measurements"),
                "facts": {"error": citation("error"), "range": citation("range")},
                "distribution_content_verified": True}],
            "hard_negatives": {"s01": {"reason": "Probe, not a crop.", "evidence": citation("probe")}}}

    def test_valid_independently_observed_context(self):
        contexts, identity = v.review_record(self.observation, self.doc, self.plan, self.reviewers)
        self.assertEqual({"error", "range"}, contexts[0]["facts"])
        self.assertIsNone(identity)

    def test_quote_must_exist_in_actual_searchable_field(self):
        bad = copy.deepcopy(self.observation)
        bad["contexts"][0]["facts"]["error"] = citation("fabricated error value")
        with self.assertRaisesRegex(ValueError, "Quote absent"):
            v.review_record(bad, self.doc, self.plan, self.reviewers)

    def test_sidecar_fact_tag_is_not_searchable_evidence(self):
        self.doc["canonical_claims"] = {"facts": "error"}
        bad = copy.deepcopy(self.observation)
        bad["contexts"][0]["facts"]["error"] = citation("error", "canonical_claims.facts")
        with self.assertRaisesRegex(ValueError, "Non-searchable"):
            v.review_record(bad, self.doc, self.plan, self.reviewers)

    def test_negated_measurement_not_positive_evidence(self):
        self.doc["description"] += "; error measurements unavailable"
        bad = copy.deepcopy(self.observation)
        bad["contexts"][0]["facts"]["error"] = citation("error measurements unavailable")
        with self.assertRaisesRegex(ValueError, "denial/absence"):
            v.review_record(bad, self.doc, self.plan, self.reviewers)

    def test_fresh_manual_review_mandatory(self):
        for key in ("semantic_review_passed", "exhaustive_searchable_review"):
            bad = dict(self.observation, **{key: False})
            with self.assertRaisesRegex(ValueError, "review incomplete"):
                v.review_record(bad, self.doc, self.plan, self.reviewers)

    def test_all_named_hard_negatives_require_actual_quotes(self):
        bad = dict(self.observation, hard_negatives={})
        with self.assertRaisesRegex(ValueError, "hard-negative"):
            v.review_record(bad, self.doc, self.plan, self.reviewers)

    def test_unresolved_or_noanswer_claim_rejects(self):
        for key in ("issues", "no_answer_claims"):
            bad = dict(self.observation, **{key: ["unresolved"]})
            with self.assertRaisesRegex(ValueError, "Unresolved"):
                v.review_record(bad, self.doc, self.plan, self.reviewers)


class CorpusMechanicsTests(unittest.TestCase):
    def test_structural_ids_and_generator_fields_are_not_searchable(self):
        fields = v.searchable({"identifier": "a001", "facts": ["answer"], "title": "Actual title",
            "distributions": [{"identifier": "secret", "description": "Actual distribution"}]})
        self.assertEqual({"title": "Actual title", "distributions.0.description": "Actual distribution"}, fields)

    def test_identifier_boundary_rejects_component_and_near_id(self):
        self.assertTrue(v.token_present("Model RUN-X120.", "RUN-X120"))
        # Full stops terminate prose but are part of release numbers; use a space before punctuation in evidence.
        self.assertFalse(v.token_present("RUN-X120-SOLE", "RUN-X120"))
        self.assertFalse(v.token_present("RUN-X1200", "RUN-X120"))
        self.assertFalse(v.token_present("RUN-X12O", "RUN-X120"))
        self.assertTrue(v.token_present(" RUN-X120 ", "run-x120"))

    def test_context_is_exact_production_projection(self):
        self.assertEqual("Title: Name\nDescription: Text\n", v.production_context({"title": "Name", "description": "Text"}))
        self.assertEqual("Title: Data\nFormat: CSV\nDescription: Rows\n",
            v.production_context({"title": "Data", "format": "CSV", "description": "Rows"}, True))

    def test_qrels_require_exhaustive_unique_judged_pairs(self):
        queries, ids = {"q": {}}, {"a", "b"}
        complete = [{"query_id": "q", "dataset_id": rid, "grade": 0} for rid in ids]
        self.assertEqual(2, len(v.validate_qrels(complete, queries, ids)))
        for rows in (complete[:1], complete + complete[:1], [dict(complete[0], grade="U"), complete[1]],
                     [dict(complete[0], grade=True), complete[1]]):
            with self.assertRaises(ValueError):
                v.validate_qrels(rows, queries, ids)

    def test_artifact_paths_cannot_escape_root(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "evidence.json").write_text("{}")
            self.assertEqual((root / "evidence.json").resolve(), v.bound(root, "evidence.json"))
            for path in ("../evidence.json", str(root / "evidence.json"), "missing.json"):
                with self.assertRaises(ValueError):
                    v.bound(root, path)

    def test_duplicate_identity_rows_fail(self):
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            v.unique([{"identifier": "a"}, {"identifier": "a"}], "identifier", "ID")


class RecordGateTests(unittest.TestCase):
    def setUp(self):
        self.doc = {"identifier": "mechanics-only", "title": "TITLE-T82 laboratory inventory",
            "description": "A minimal parser test, not a benchmark corpus record.",
            "quality": 1, "hasQuality": True,
            "distributions": [{"title": "Inventory rows", "description": "Inventory observations",
                               "format": "CSV", "downloadURL": "https://example.invalid/test.csv"}]}
        self.plan = {"distribution_requirements": {"required_formats": ["CSV"]},
            "identifier_requirements": {"authoritative_identifier": "TITLE-T82", "identifier_scope": "title_only"}}
        self.project()

    def project(self):
        self.doc["queryContext"] = v.production_context(self.doc)
        for d in self.doc["distributions"]:
            d["queryContext"] = v.production_context(d, True)

    def test_title_scope_allows_only_exact_production_derived_copy(self):
        v.check_record(self.doc, self.plan, {})
        self.doc["queryContext"] = self.doc["queryContext"].replace("TITLE-T82", "[redacted]")
        with self.assertRaisesRegex(ValueError, "Non-production root"):
            v.check_record(self.doc, self.plan, {})

    def test_title_scope_rejects_identifier_in_other_primary_fields(self):
        self.doc["description"] += " TITLE-T82"
        self.project()
        with self.assertRaisesRegex(ValueError, "scope leakage"):
            v.check_record(self.doc, self.plan, {})

    def test_distribution_only_control_remains_out_of_root_context(self):
        self.plan["identifier_requirements"]["identifier_scope"] = "distribution_only"
        self.doc["title"] = "Laboratory inventory"
        self.doc["distributions"][0]["description"] += " TITLE-T82"
        self.project()
        v.check_record(self.doc, self.plan, {})
        self.doc["title"] += " TITLE-T82"
        self.project()
        with self.assertRaisesRegex(ValueError, "scope leakage"):
            v.check_record(self.doc, self.plan, {})

    def test_format_change_or_unsupported_addition_fails(self):
        for fmt in ("PDF", "CSV JSON"):
            self.doc["distributions"][0]["format"] = fmt
            self.project()
            with self.assertRaisesRegex(ValueError, "distribution format"):
                v.check_record(self.doc, self.plan, {})

    def test_label_leakage_fails_even_if_other_fields_valid(self):
        self.doc["description"] += " grade: 3"
        self.project()
        with self.assertRaisesRegex(ValueError, "Label/answer-key"):
            v.check_record(self.doc, self.plan, {})

    def test_exact_title_control_does_not_trigger_query_leak_detector(self):
        self.plan["identifier_requirements"]["exact_title"] = self.doc["title"]
        query = {"id": "x", "kind": "exact", "query": self.doc["title"]}
        v.check_record(self.doc, self.plan, {"x": query})


class DeltaProvenanceTests(unittest.TestCase):
    def test_leaf_comparison_covers_unindexed_metadata_too(self):
        before = {"identifier": "test", "contactPoint": {"email": "old"}, "distributions": [{"title": "old"}]}
        after = copy.deepcopy(before)
        after["contactPoint"]["email"] = "changed"
        after["distributions"][0]["title"] = "changed"
        self.assertEqual({"contactPoint.email", "distributions.0.title"}, set(v.leaf_changes(before, after)))

    def test_repair_delta_checks_raw_bytes_before_hash_and_allowed_fields(self):
        import json
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            before = {"identifier": "parser-test", "title": "Parser mechanics",
                      "description": "Old observed basis", "distributions": [], "contactPoint": "unchanged"}
            before["queryContext"] = v.production_context(before)
            after = copy.deepcopy(before)
            after["description"] = "Corrected observed basis"
            after["queryContext"] = v.production_context(after)
            def dump(name, value):
                (root / name).write_text(json.dumps(value) + "\n")
            dump("old.jsonl", before)
            dump("new.jsonl", after)
            request = {"patches": [{"seed": 1, "dataset_id": "parser-test",
                "before_corpus_sha256": v.sha(root / "old.jsonl"),
                "before_record_sha256": v.canonical_record_sha(before),
                "issue": "Physical-sample provenance wording", "actual_evidence": []}]}
            dump("request.json", request)
            changes, _, _ = v.verify_fixture_delta(root, {1: "old.jsonl"}, {1: "new.jsonl"}, ["request.json"])
            self.assertEqual(["description", "queryContext"], changes[0]["changed_fields"])
            after["contactPoint"] = "silently modified unindexed field"
            dump("new.jsonl", after)
            with self.assertRaisesRegex(ValueError, "exceeded approved fields"):
                v.verify_fixture_delta(root, {1: "old.jsonl"}, {1: "new.jsonl"}, ["request.json"])
            dump("new.jsonl", before)
            (root / "new.jsonl").write_text(json.dumps(before, sort_keys=True) + "\n")
            with self.assertRaisesRegex(ValueError, "Unmodified record bytes rewritten"):
                v.verify_fixture_delta(root, {1: "old.jsonl"}, {1: "new.jsonl"}, ["request.json"])


class VariationAdjudicationTests(unittest.TestCase):
    def test_only_explicit_fullscope_hashbound_judgment_can_supersede_false(self):
        import json
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def dump(name, value):
                (root / name).write_text(json.dumps(value) + "\n")
            dump("corpus.jsonl", {"identifier": "mechanics-only"})
            old_judgment = {"passed": False, "reviewer_id": "old", "rationale": "Question about illustrative values"}
            old = {"reviewer": {"id": "old"}, "record_reviews": [{"seed": 1, "dataset_id": "mechanics-only"}],
                   "variation_review_by_seed": {"1": old_judgment}}
            dump("old.json", old)
            evidence = {"reviewers": [{"id": "old"}], "corpora": [{"seed": 1, "path": "corpus.jsonl",
                "sha256": v.sha(root / "corpus.jsonl"), "variation_review": old_judgment}],
                "source_review_artifacts": [{"path": "old.json", "sha256": v.sha(root / "old.json")}]}
            dump("base.json", evidence)
            new = {"reviewer": {"id": "fresh"}, "sources": {"1": {"path": "corpus.jsonl", "sha256": v.sha(root / "corpus.jsonl")}},
                "reviewed_pairs": [[1, "mechanics-only"]], "variation_review_by_seed": {
                    "1": {"passed": True, "reviewer_id": "fresh", "rationale": "Independently reviewed actual scope against frozen concept-level invariants"}}}
            dump("new.json", new)
            old_hash = v.sha(root / "old.json")
            v.apply_variation_adjudications(root, "base.json", [{"old_review_path": "old.json", "new_review_path": "new.json"}], root / "rebased.json")
            result = json.loads((root / "rebased.json").read_text())
            self.assertTrue(result["corpora"][0]["variation_review"]["passed"])
            self.assertFalse(result["corpora"][0]["variation_review"]["previous_review"]["passed"])
            self.assertEqual(old_hash, v.sha(root / "old.json"))
            v.apply_variation_adjudications(root, "rebased.json", [], root / "rebased-again.json")
            self.assertTrue(json.loads((root / "rebased-again.json").read_text())["corpora"][0]["variation_review"]["passed"])
            new["reviewed_pairs"] = []
            dump("new-incomplete.json", new)
            with self.assertRaisesRegex(ValueError, "exact original record scope"):
                v.apply_variation_adjudications(root, "base.json", [{"old_review_path": "old.json", "new_review_path": "new-incomplete.json"}], root / "bad.json")
            new["reviewed_pairs"] = [[1, "mechanics-only"]]
            new["sources"]["1"]["sha256"] = "incorrect"
            dump("new-stale.json", new)
            with self.assertRaisesRegex(ValueError, "current actual corpus"):
                v.apply_variation_adjudications(root, "base.json", [{"old_review_path": "old.json", "new_review_path": "new-stale.json"}], root / "stale.json")


class DiagnosticScopedCertaintyTests(unittest.TestCase):
    def test_scoped_parser_preserves_record_uncertainty_and_strict_gate_rejects(self):
        fixture = EvidenceTests()
        fixture.setUp()
        row = copy.deepcopy(fixture.observation)
        row["semantic_review_passed"] = False
        row["issues"] = ["Uncertain unrelated metadata attribution; retain this original issue."]
        original = copy.deepcopy(row)
        parsed = v._diagnostic_contexts(row, fixture.doc, fixture.plan, fixture.reviewers)
        self.assertEqual({"error", "range"}, parsed[0]["facts"])
        self.assertEqual(original, row)
        with self.assertRaisesRegex(ValueError, "review incomplete"):
            v.review_record(row, fixture.doc, fixture.plan, fixture.reviewers)

    def test_simulation_is_definitive_zero_even_with_uncertain_subject(self):
        intent = {"intent_id": "test", "kind": "semantic", "required_claims": {
            "product": "probe", "process": "calibration", "constraint": "representative_measurements_not_simulation",
            "facts": ["error", "range", "uncertainty"], "formats_any": []}}
        context = {"product": "unspecified simulation subject", "process": "calibration", "basis": "simulation_only",
                   "facts": {"error", "range", "uncertainty"}, "distribution_content_verified": False}
        self.assertEqual(0, v._diagnostic_grade(intent, "mechanics-only", [context], {"CSV"}))
        diagnostic = {"intent_id": "topic", "kind": "ambiguous", "process_grade_rules": {"calibration": 3}}
        self.assertEqual(3, v._diagnostic_grade(diagnostic, "mechanics-only", [context], {"CSV"}))
        context["basis"] = "representative_measurements_not_simulation"
        with self.assertRaisesRegex(ValueError, "Unmasked unresolved observation"):
            v._diagnostic_grade(intent, "mechanics-only", [context], {"CSV"})

    def test_known_positive_requires_verified_measurement_content(self):
        intent = {"intent_id": "test", "kind": "semantic", "required_claims": {
            "product": "probe", "process": "calibration", "constraint": "representative_measurements_not_simulation",
            "facts": ["error", "range", "uncertainty"], "formats_any": []}}
        context = {"product": "probe", "process": "calibration", "basis": "representative_measurements_not_simulation",
                   "facts": {"error", "range", "uncertainty"}, "distribution_content_verified": False}
        with self.assertRaisesRegex(ValueError, "verified content association"):
            v._diagnostic_grade(intent, "mechanics-only", [context], {"CSV"})
        context["distribution_content_verified"] = True
        self.assertEqual(3, v._diagnostic_grade(intent, "mechanics-only", [context], {"CSV"}))


if __name__ == "__main__":
    unittest.main()
