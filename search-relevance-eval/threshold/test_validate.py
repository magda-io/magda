"""Offline adversarial tests; tiny toy evidence only, never study generation."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from copy import deepcopy

SPEC = importlib.util.spec_from_file_location("threshold_independent_validation", Path(__file__).with_name("validate.py"))
v = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(v)


def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, sort_keys=True) + "\n")


def line(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"


def make_doc(rid, title, description, publisher="Test office"):
    doc = {"identifier": rid, "title": title, "description": description,
           "keywords": [], "publisher": {"name": publisher}, "quality": 1.0,
           "hasQuality": True, "tenantId": 0, "publishingState": "published", "catalog": None,
           "landingPage": "https://reserved.invalid/" + rid, "distributions": []}
    for index, fmt in enumerate(("CSV", "JSON")):
        child = {"identifier": rid + "-d" + str(index), "title": "Data file",
                 "description": "Downloadable encoding of the documented collection.", "format": fmt,
                 "downloadURL": "https://reserved.invalid/" + rid + "/" + fmt,
                 "tenantId": 0, "publishingState": "published"}
        child["queryContext"] = v.production_context(child, True)
        doc["distributions"].append(child)
    doc["queryContext"] = v.production_context(doc)
    return doc


def citation(quote, field="description"):
    return {"field": field, "quote": quote}


def manual_row(seed, doc, source, raw, facts):
    return {"seed": seed, "dataset_id": doc["identifier"], "reviewer_id": "fresh",
            "source_path": source, "raw_record_sha256": v.digest(raw),
            "canonical_record_sha256": v.canonical_sha(doc), "exhaustive_searchable_review": True,
            "semantic_review_passed": True, "issues": [],
            "contexts": [{"product": {"value": "pipes", "evidence": [citation("pipes")]},
                          "process": {"value": "leak_tests", "evidence": [citation("observed leak tests")]},
                          "basis": {"value": "observed_not_simulated", "evidence": [citation("Physical observations")]},
                          "facts": {fact: [citation(fact)] for fact in facts}, "format_content_verified": True}],
            "negative_absence": {"checked_intents": ["tz"], "absent_all": True,
                                 "rationale": "All actual pipe content lacks the requested stellar spectrum conjunction.",
                                 "evidence": [citation("pipes")]}}


class StudyFixture:
    """Small synthetic UNIT TEST contract, distinct from frozen benchmark."""
    def __init__(self, root):
        self.root = root
        facts = ["pressure", "flow", "locations"]
        self.intents = [
            {"intent_id": "s", "kind": "semantic", "split": "heldout", "paraphrase_query_ids": ["q"],
             "required_claims": {"product": "pipes", "process": "leak_tests", "basis": "observed_not_simulated", "facts": facts}},
            {"intent_id": "tz", "kind": "negative_unrelated", "split": "heldout", "paraphrase_query_ids": ["n"], "required_absent_claim": "stellar_spectra"},
            {"intent_id": "td", "kind": "ambiguous_ungraded", "split": "diagnostic", "paraphrase_query_ids": ["d"]}]
        queries = [{"id": qid, "intent_id": iid, "kind": kind, "split": split, "query": text}
                   for qid, iid, kind, split, text in (("q", "s", "semantic", "heldout", "observed municipal leaks"),
                                                     ("n", "tz", "negative_unrelated", "heldout", "stellar spectra"),
                                                     ("d", "td", "ambiguous_ungraded", "diagnostic", "plant"))]
        plans = [{"id": f"t{x:03}", "claim_set": "all", "evidence_layout": "root_measurements", "prose_budget": "ordinary"} for x in range(1, 61)]
        archetype = {"archetype_id": "g01", "claim_set": "one", "evidence_layout": "root_measurements", "prose_budget": "ordinary"}
        claim = {"product": "pipes", "process": "leak_tests", "basis": "observed_not_simulated",
                 "facts": facts, "available_formats": ["CSV", "JSON"]}
        one = dict(claim, facts=["pressure"])
        g = {"seeds": [1], "core_record_plans": plans, "canonical_claim_sets": {"all": claim, "one": one},
             "growth": {"archetypes": [archetype], "levels": [{"total_records": 60, "growth_replicas_per_archetype": 0},
                                                            {"total_records": 61, "growth_replicas_per_archetype": 1},
                                                            {"total_records": 62, "growth_replicas_per_archetype": 2}]},
             "planned_core_intent_doc_grades": {"s": {p["id"]: 3 for p in plans}, "tz": {p["id"]: 0 for p in plans}, "td": {p["id"]: "U" for p in plans}},
             "planned_growth_intent_archetype_grades": {"s": {"g01": 1}, "tz": {"g01": 0}, "td": {"g01": "U"}},
             "closed_ontology": {"facts": facts},
             "budgets": {"ordinary": {"min_words": 1, "max_words": 500}, "dataset_title_words_max": 12,
                         "nested_description_words": {"min": 1, "max": 100}}}
        for name in v.SPEC_FILES:
            (root / name).write_text("frozen toy test only\n")
        dump(root / "generation-spec.json", g)
        (root / "intents.jsonl").write_text("".join(line(x) for x in self.intents))
        (root / "query-spec.jsonl").write_text("".join(line(x) for x in queries))
        (root / "freeze.py").write_text("# immutable toy checker, never imported\n")
        hashes = {name: v.sha(root / name) for name in v.SPEC_FILES}
        dump(root / "pre-generation-review.json", {"status": "structural_pre_generation_passed", "actual_text_validation_passed": False, "spec_sha256": hashes})
        dump(root / "spec-freeze.json", {"phase": "before_new_generation_and_threshold_execution", "spec_sha256": hashes,
                                       "freeze_tool_sha256": v.sha(root / "freeze.py"), "independent_preflight_path": "pre-generation-review.json",
                                       "independent_preflight_sha256": v.sha(root / "pre-generation-review.json")})
        self.registration = v.verify_registration(root)
        self.core = [make_doc(p["id"], "Observed pipe collection " + str(index),
                              "Physical observations document pipes during observed leak tests. Entries include pressure flow locations.")
                     for index, p in enumerate(plans)]
        template = make_doc("{{record_id}}", "One variable collection",
                            "Physical observations document pipes during observed leak tests. Entries include pressure. Filed by {{station}}. Metadata release {{year}} month {{month}}.",
                            "Office {{station}}")
        self.bundle = {"seed": 1, "archetype_id": "g01", "claim_set": "one", "metadata": template,
                       "slot_bindings": [{"json_pointer": p, "slot": match.group(1)}
                                         for p, text in v.pointer_strings(template) for match in v.PLACEHOLDER.finditer(text)]}
        self.terminals = {"schema_version": 1, "slot_definitions": {"station": {"format": "Station {replica:03}"},
                                                                  "year": {}, "month": {}, "record_id": {}},
                          "bundles": [self.bundle]}
        self.representative = v.render_terminal(self.bundle, 1, self.registration, self.terminals)
        (root / "core.jsonl").write_text("".join(line(x) for x in self.core))
        (root / "representatives.jsonl").write_text(line(self.representative))
        dump(root / "terminals.json", self.terminals)
        refs = [{"seed": 1, "path": name, "sha256": v.sha(root / name)} for name in ("core.jsonl", "representatives.jsonl")]
        self.manifest = {"schema_version": 1, "spec_freeze_sha256": v.sha(root / "spec-freeze.json"), "corpora": refs[:1], "templates": refs[1:],
                         "terminal_templates": {"path": "terminals.json", "sha256": v.sha(root / "terminals.json")}}
        dump(root / "manifest.json", self.manifest)
        rows = [manual_row(1, doc, "core.jsonl", line(doc).encode(), facts) for doc in self.core]
        rows.append(manual_row(1, self.representative, "representatives.jsonl", line(self.representative).encode(), ["pressure"]))
        self.review = {"schema_version": 1, "reviewer": {"id": "fresh", "context_id": "test-context", "model": "unit-test-not-model",
                       "parameters": "unavailable", "role": "independent_semantic_auditor", "rankings_seen": False, "generator_context": False},
                       "sources": [{"path": x["path"], "sha256": x["sha256"]} for x in refs], "record_reviews": rows}
        dump(root / "reviews.json", self.review)

    def stage(self):
        return v.validate_stage_one(self.root, "manifest.json", ["reviews.json"], [])

    def expansion(self):
        stage = self.stage()
        dump(self.root / "stage.json", stage)
        refs = []
        for size, replicas in ((60, 0), (61, 1), (62, 2)):
            rows = self.core + [v.render_terminal(self.bundle, rep, self.registration, self.terminals) for rep in range(1, replicas + 1)]
            name = f"size-{size}.jsonl"
            (self.root / name).write_text("".join(line(x) for x in rows))
            refs.append({"seed": 1, "catalog_size": size, "path": name, "sha256": v.sha(self.root / name)})
        manifest = {"schema_version": 1, "spec_freeze_sha256": v.sha(self.root / "spec-freeze.json"),
                    "stage_validation_sha256": v.sha(self.root / "stage.json"), "corpora": refs}
        dump(self.root / "expansion.json", manifest)
        return manifest


class IndependentValidatorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.fixture = StudyFixture(self.root)

    def tearDown(self):
        self.tmp.cleanup()

    def test_stage_is_pure_complete_and_not_embedding_permission(self):
        before = {str(p): p.read_bytes() for p in self.root.iterdir()}
        result = self.fixture.stage()
        self.assertEqual(result["coverage"]["manual_core_records"], 60)
        self.assertEqual(result["coverage"]["manual_complete_growth_bundles"], 1)
        self.assertFalse(result["actual_text_validation_passed"])
        self.assertTrue(result["stage_one_actual_text_validation_passed"])
        self.assertFalse(result["embeddings_allowed"])
        self.assertEqual(before, {str(p): p.read_bytes() for p in self.root.iterdir()})

    def mutate_review_fails(self, mutate, message):
        review = deepcopy(self.fixture.review)
        mutate(review)
        dump(self.root / "reviews.json", review)
        with self.assertRaisesRegex(ValueError, message):
            self.fixture.stage()

    def test_review_hash_includes_raw_line_ending(self):
        self.mutate_review_fails(lambda x: x["record_reviews"][0].update(raw_record_sha256=v.digest(line(self.fixture.core[0]).rstrip().encode())), "raw row")

    def test_missing_manual_record_is_not_default_zero(self):
        self.mutate_review_fails(lambda x: x["record_reviews"].pop(), "coverage")

    def test_duplicate_manual_record_fails(self):
        self.mutate_review_fails(lambda x: x["record_reviews"].append(x["record_reviews"][0]), "duplicate")

    def test_false_original_manual_flag_preserved(self):
        self.mutate_review_fails(lambda x: x["record_reviews"][0].update(semantic_review_passed=False, issues=["uncertain scope"]), "Unresolved")

    def test_missing_negative_absence_coverage_fails(self):
        self.mutate_review_fails(lambda x: x["record_reviews"][0]["negative_absence"].update(checked_intents=[]), "absence")

    def test_administrative_cannot_rescue_physical_positive(self):
        self.mutate_review_fails(lambda x: x["record_reviews"][0]["contexts"][0]["basis"].update(value="observed_administrative_records"), "label mismatch")

    def test_simulation_cannot_rescue_positive(self):
        self.mutate_review_fails(lambda x: x["record_reviews"][0]["contexts"][0]["basis"].update(value="simulation_only"), "label mismatch")

    def test_source_hash_closure_rejects_stale_manual_artifact(self):
        self.mutate_review_fails(lambda x: x["sources"][0].update(sha256="0" * 64), "source artifact changed")

    def test_reviewer_context_exposure_fails_closed(self):
        self.mutate_review_fails(lambda x: x["reviewer"].update(rankings_seen=True), "fresh-context")

    def test_manual_identity_fields_do_not_establish_other_target(self):
        intent = {"kind": "exact", "authoritative_target_ids": ["unit"]}
        self.assertEqual(v.derive_grade(intent, "component", [{"identity": "unit", "facts": {}}]), 0)

    def test_root_branch_facts_not_inferred_from_keywords(self):
        context = {"product": "pipes", "process": "leak_tests", "basis": "observed_not_simulated",
                   "facts": {"pressure": [citation("pressure", "keywords.0")],
                             "flow": [citation("flow", "distributions.0.description")],
                             "locations": [citation("locations", "distributions.1.description")]}}
        support = v.branch_support(self.fixture.intents[0], [context])
        self.assertNotIn("root", support)
        self.assertFalse(support["nested.0"]["useful_measurement_complete"])
        self.assertFalse(support["nested.1"]["useful_measurement_complete"])

    def test_unmatched_literal_evidence_fails(self):
        self.mutate_review_fails(lambda x: x["record_reviews"][0]["contexts"][0]["facts"].update(pressure=[citation("invented pressure variable")]), "quotation")

    def test_format_content_association_required(self):
        self.mutate_review_fails(lambda x: x["record_reviews"][0]["contexts"][0].update(format_content_verified=False), "association")

    def test_negation_outside_minimal_positive_snippet_fails(self):
        with self.assertRaisesRegex(ValueError, "denial"):
            v.positive_quote_check([citation("pressure")], {"description": "No pressure was recorded."}, "toy")

    def test_structural_id_slot_cannot_leak_in_title(self):
        bundle = deepcopy(self.fixture.bundle)
        bundle["metadata"]["title"] = "{{record_id}}"
        bundle["slot_bindings"].append({"json_pointer": "/title", "slot": "record_id"})
        with self.assertRaisesRegex(ValueError, "leaks"):
            v.render_terminal(bundle, 2, self.fixture.registration, self.fixture.terminals)

    def test_undeclared_slot_fails(self):
        bundle = deepcopy(self.fixture.bundle)
        bundle["slot_bindings"].pop()
        with self.assertRaisesRegex(ValueError, "coverage"):
            v.render_terminal(bundle, 2, self.fixture.registration, self.fixture.terminals)

    def test_unknown_semantic_slot_fails(self):
        bundle = deepcopy(self.fixture.bundle)
        bundle["metadata"]["description"] += " {{extra_measurement}}"
        with self.assertRaisesRegex(ValueError, "Unregistered"):
            v.render_terminal(bundle, 2, self.fixture.registration, self.fixture.terminals)

    def test_month_cannot_be_observation_timestamp(self):
        bundle = deepcopy(self.fixture.bundle)
        bundle["metadata"]["description"] = bundle["metadata"]["description"].replace("Metadata release", "Observed sampling")
        with self.assertRaisesRegex(ValueError, "release context"):
            v.render_terminal(bundle, 2, self.fixture.registration, self.fixture.terminals)

    def test_typed_quote_lift_preserves_literal_and_rejects_partial_slot(self):
        source = "Released {{year}} by {{station}}."
        a = {"year": "2010", "station": "Station 001"}
        b = {"year": "2011", "station": "Station 002"}
        self.assertEqual(v._lift_quote(source, "2010 by Station 001", a, b), "2011 by Station 002")
        with self.assertRaisesRegex(ValueError, "cuts inside"):
            v._lift_quote(source, "010 by", a, b)

    def test_neutral_quality_not_missing_default(self):
        doc = deepcopy(self.fixture.core[0]); doc.pop("quality")
        with self.assertRaisesRegex(ValueError, "quality"):
            v.check_record(doc, self.fixture.registration["plans"]["t001"], self.fixture.registration)

    def test_unpublished_child_fails(self):
        doc = deepcopy(self.fixture.core[0]); doc["distributions"][0]["publishingState"] = "draft"
        with self.assertRaisesRegex(ValueError, "policy"):
            v.check_record(doc, self.fixture.registration["plans"]["t001"], self.fixture.registration)

    def test_distribution_quality_is_not_a_field(self):
        doc = deepcopy(self.fixture.core[0]); doc["distributions"][0]["quality"] = 1
        with self.assertRaisesRegex(ValueError, "distribution"):
            v.check_record(doc, self.fixture.registration["plans"]["t001"], self.fixture.registration)

    def test_inspection_retains_false_flags_and_never_accepts_templates(self):
        review = deepcopy(self.fixture.review)
        review["record_reviews"][0].update(semantic_review_passed=False, issues=["independent uncertainty"])
        dump(self.root / "reviews.json", review)
        result = v.inspect_stage_one(self.root, "manifest.json", ["reviews.json"], [])
        self.assertFalse(result["actual_text_validation_passed"])
        self.assertFalse(result["expansion_allowed"])
        self.assertEqual(result["failed_record_count"], 1)
        self.assertNotIn("accepted_terminal_bindings", result)
        row = result["record_inspections"][0]["observation_original_unchanged"]
        self.assertFalse(row["semantic_review_passed"])
        self.assertEqual(row["issues"], ["independent uncertainty"])
        with self.assertRaisesRegex(ValueError, "Unresolved"):
            self.fixture.stage()

    def test_unknown_basis_does_not_erase_decisive_product_mismatch(self):
        context = {"product": "software_tree", "process": "parser_measurement", "basis": "U", "facts": {}}
        self.assertEqual(v.derive_grade(self.fixture.intents[0], "g", [context]), 0)
        context["product"] = "pipes"; context["process"] = "leak_tests"
        self.assertEqual(v.derive_grade(self.fixture.intents[0], "g", [context]), "U")

    def test_exact_ids_are_objective(self):
        intent = {"kind": "exact", "authoritative_target_ids": ["a"]}
        self.assertEqual(v.derive_grade(intent, "a", []), 3)
        self.assertEqual(v.derive_grade(intent, "a-component", []), 0)

    def test_ambiguity_is_unknown_not_zero(self):
        self.assertEqual(v.derive_grade({"kind": "ambiguous_ungraded"}, "a", []), "U")

    def test_expansion_closes_every_row_and_shares_qrels_after_equality(self):
        self.fixture.expansion()
        result = v.validate_expansion(self.root, "expansion.json", "stage.json")
        self.assertEqual(result["coverage"]["unique_actual_rows_closed"], 62)
        self.assertEqual(len(result["qrels"]), 186)
        self.assertEqual({x["grade"] for x in result["qrels"] if x["dataset_id"] == "g01-r002"}, {0, 1, "U"})
        self.assertFalse(result["embeddings_allowed"])

    def test_expanded_unreviewed_free_prose_cannot_pass(self):
        manifest = self.fixture.expansion()
        p = self.root / "size-62.jsonl"
        docs = [json.loads(x) for x in p.read_text().splitlines()]
        docs[-1]["description"] += " Additional flow measurements."
        docs[-1]["queryContext"] = v.production_context(docs[-1])
        p.write_text("".join(line(x) for x in docs))
        manifest["corpora"][-1]["sha256"] = v.sha(p); dump(self.root / "expansion.json", manifest)
        with self.assertRaisesRegex(ValueError, "entire metadata"):
            v.validate_expansion(self.root, "expansion.json", "stage.json")

    def test_cross_size_reserialization_cannot_reuse_raw_source(self):
        manifest = self.fixture.expansion()
        p = self.root / "size-61.jsonl"
        docs = [json.loads(x) for x in p.read_text().splitlines()]
        p.write_text("".join(json.dumps(x, sort_keys=True) + "\n" for x in docs))
        manifest["corpora"][1]["sha256"] = v.sha(p); dump(self.root / "expansion.json", manifest)
        with self.assertRaisesRegex(ValueError, "byte-identical"):
            v.validate_expansion(self.root, "expansion.json", "stage.json")

    def test_forged_stage_pass_status_is_not_authority(self):
        manifest = self.fixture.expansion()
        stage = v.load(self.root / "stage.json"); stage["record_evidence"][0]["independent_derivation"]["intent_grades"]["s"] = 0
        dump(self.root / "stage.json", stage)
        manifest["stage_validation_sha256"] = v.sha(self.root / "stage.json"); dump(self.root / "expansion.json", manifest)
        with self.assertRaisesRegex(ValueError, "not reproducible"):
            v.validate_expansion(self.root, "expansion.json", "stage.json")

    def test_path_escape_fails(self):
        with self.assertRaisesRegex(ValueError, "escaping"):
            v.bound(self.root, "../outside.json")

    def test_approved_footer_delta_rejects_unrelated_field_change(self):
        old_footer = "Names in this unit fixture are fictional only."
        new_footer = "Items in this unit fixture are fictional only."
        # Install footer-bearing actual representations without changing frozen truth.
        terminal = deepcopy(self.fixture.terminals)
        bundle = terminal["bundles"][0]
        bundle["metadata"]["description"] += " " + old_footer
        bundle["metadata"]["queryContext"] = v.production_context(bundle["metadata"])
        old_rep = v.render_terminal(bundle, 1, self.fixture.registration, terminal)
        (self.root / "representatives.jsonl").write_text(line(old_rep))
        dump(self.root / "terminals.json", terminal)
        old_manifest = deepcopy(self.fixture.manifest)
        old_manifest["templates"][0]["sha256"] = v.sha(self.root / "representatives.jsonl")
        old_manifest["terminal_templates"]["sha256"] = v.sha(self.root / "terminals.json")
        dump(self.root / "manifest.json", old_manifest)
        finding = {"literal_evidence": [{"seed": 1, "footer_quote": old_footer}]}
        dump(self.root / "finding.json", finding)
        approval = {"schema_version": 1, "approved_by": "parent-agent", "pre_retrieval": True,
                    "preserve_originals": True, "frozen_queries_labels_claims_and_all_other_record_fields_must_not_change": True,
                    "spec_freeze_sha256": v.sha(self.root / "spec-freeze.json"),
                    "source_manifest_sha256": v.sha(self.root / "manifest.json"),
                    "source_terminals_sha256": v.sha(self.root / "terminals.json"),
                    "finding_path": "finding.json", "finding_sha256": v.sha(self.root / "finding.json"),
                    "new_footers": {"1": new_footer}}
        dump(self.root / "approval.json", approval)
        (self.root / "new-core.jsonl").write_bytes((self.root / "core.jsonl").read_bytes())
        (self.root / "new-representatives.jsonl").write_bytes((self.root / "representatives.jsonl").read_bytes().replace(old_footer.encode(), new_footer.encode()))
        (self.root / "new-terminals.json").write_bytes((self.root / "terminals.json").read_bytes().replace(old_footer.encode(), new_footer.encode()))
        new_manifest = deepcopy(old_manifest)
        new_manifest["corpora"][0].update(path="new-core.jsonl", sha256=v.sha(self.root / "new-core.jsonl"))
        new_manifest["templates"][0].update(path="new-representatives.jsonl", sha256=v.sha(self.root / "new-representatives.jsonl"))
        new_manifest["terminal_templates"].update(path="new-terminals.json", sha256=v.sha(self.root / "new-terminals.json"))
        dump(self.root / "new-manifest.json", new_manifest)
        result = v.verify_footer_repair(self.root, "manifest.json", "new-manifest.json", "approval.json")
        self.assertEqual(result["changed_actual_rows"], 1)
        self.assertEqual(result["unchanged_raw_rows"], 60)
        self.assertFalse(result["actual_text_validation_passed"])
        tampered = v.load(self.root / "new-terminals.json")
        tampered["bundles"][0]["metadata"]["title"] += " UNAPPROVED"
        dump(self.root / "new-terminals.json", tampered)
        new_manifest["terminal_templates"]["sha256"] = v.sha(self.root / "new-terminals.json")
        dump(self.root / "new-manifest.json", new_manifest)
        with self.assertRaisesRegex(ValueError, "altered terminal"):
            v.verify_footer_repair(self.root, "manifest.json", "new-manifest.json", "approval.json")

    def test_t051_style_unsatisfiable_identity_scope_is_not_exempted(self):
        doc = deepcopy(self.fixture.core[0]); doc["title"] = "BASE Microphone Module"
        doc["queryContext"] = v.production_context(doc)
        reg = deepcopy(self.fixture.registration)
        reg["generation"]["canonical_claim_sets"]["all"].update(identity="BASE-MIC", identity_scope="primary_identity",
                                                                    required_exact_title="BASE Microphone Module")
        with self.assertRaisesRegex(ValueError, "identity absent"):
            v.check_record(doc, reg["plans"]["t001"], reg)

    def test_admin_mismatch_negative_is_not_coerced_to_physical(self):
        intent = self.fixture.intents[0]
        contexts = [{"product": "pipes", "process": "invoice_register", "basis": "observed_administrative_records", "facts": {}}]
        self.assertEqual(v.derive_grade(intent, "not-target", contexts), 0)
        self.assertEqual(contexts[0]["basis"], "observed_administrative_records")

    def scope_fixture(self):
        inspection = self.root / "inspection.json"; dump(inspection, {"inspection_only": True})
        unknown = [{"seed": seed, "query_id": qid, "dataset_id": rid, "reason": "Explicit independently unresolved actual phrase",
                    "origin": "unit-test authored scope", "supported_grade_interval": [2, 3] if qid == "t03p3" else [1, 2],
                    "evidence": [citation("actual scope quote")]} for seed, qid, rid in sorted(v.DIAGNOSTIC_UNKNOWN_PAIRS)]
        zeros = {(s, rid) for s in (38871, 38872, 38873) for rid in ("t012", "g18-r001")} | {(38872, "t011"), (38872, "g02-r001")}
        data = {"schema_version": 1, "status": "independent_pair_scope_adjudication_NOT_validation_passed", "pre_retrieval": True,
                "independent_of_generator": True, "actual_text_validation_passed": False, "strict_fixture_conformance_passed": False,
                "forced_recommendation": "D", "spec_freeze_sha256": v.sha(self.root / "spec-freeze.json"),
                "stage_manifest": {"path": "manifest.json", "sha256": v.sha(self.root / "manifest.json")},
                "source_inspection": {"path": "inspection.json", "sha256": v.sha(inspection)}, "manual_review_sources": [],
                "unknown_pairs": unknown,
                "non_grade_metadata_discrepancies": [{"records": [{"seed": s, "dataset_id": rid} for s, rid in sorted(v.DIAGNOSTIC_METADATA_DISCREPANCIES)]}],
                "record_issue_dispositions": [{"pair_scope": "All48 numeric pairs have decisive mismatches.",
                                                "records": [{"seed": s, "dataset_id": rid} for s, rid in sorted(zeros)]}]}
        dump(self.root / "scope.json", data)
        reg = deepcopy(self.fixture.registration)
        reg["queries"].update({qid: {} for _, qid, _ in v.DIAGNOSTIC_UNKNOWN_PAIRS})
        documents = {(s, rid): {"description": "actual scope quote"} for s, _, rid in v.DIAGNOSTIC_UNKNOWN_PAIRS}
        observations = {key: {} for key in documents}
        return data, reg, observations, documents

    def test_diagnostic_mask_is_exact_and_never_wildcard(self):
        data, reg, observations, documents = self.scope_fixture()
        result = v.diagnostic_scope_adjudication(self.root, "scope.json", reg, self.root / "manifest.json", observations, documents)
        self.assertEqual(set(result[1]), v.DIAGNOSTIC_UNKNOWN_PAIRS)
        data["unknown_pairs"].append(dict(data["unknown_pairs"][0], dataset_id="arbitrary-target"))
        dump(self.root / "scope.json", data)
        with self.assertRaisesRegex(ValueError, "Unregistered"):
            v.diagnostic_scope_adjudication(self.root, "scope.json", reg, self.root / "manifest.json", observations, documents)

    def test_diagnostic_mask_cannot_coerce_unknown_gain_zero(self):
        data, reg, observations, documents = self.scope_fixture()
        data["unknown_pairs"][0]["supported_grade_interval"] = [0, 3]
        dump(self.root / "scope.json", data)
        with self.assertRaisesRegex(ValueError, "gain interval"):
            v.diagnostic_scope_adjudication(self.root, "scope.json", reg, self.root / "manifest.json", observations, documents)

    def test_diagnostic_missing_original_unknown_fails(self):
        data, reg, observations, documents = self.scope_fixture()
        data["unknown_pairs"].pop(); dump(self.root / "scope.json", data)
        with self.assertRaisesRegex(ValueError, "seven-pair"):
            v.diagnostic_scope_adjudication(self.root, "scope.json", reg, self.root / "manifest.json", observations, documents)

    def test_scoped_extra_citations_require_actual_record_and_literal(self):
        document = {"description": "actual scope quote"}
        self.assertEqual(v.scoped_manual_citations({"dataset_id": "x", "field": "description", "quote": "scope quote"}, {"x": document}), 1)
        with self.assertRaisesRegex(ValueError, "identity"):
            v.scoped_manual_citations(citation("scope quote"), {"x": document})
        with self.assertRaisesRegex(ValueError, "quotation"):
            v.scoped_manual_citations({"dataset_id": "x", "field": "description", "quote": "fabricated"}, {"x": document})

    def test_context_ast_closure_ignores_line_numbers_not_behavior(self):
        first = "def context(doc, distribution=False):\n    return doc['title']\n"
        same = "# logger added\n\n" + first
        changed = "def context(doc, distribution=False):\n    return doc['description']\n"
        self.assertEqual(v.context_ast_bytes(first), v.context_ast_bytes(same))
        self.assertNotEqual(v.context_ast_bytes(first), v.context_ast_bytes(changed))
        with self.assertRaisesRegex(ValueError, "Unique"):
            v.context_ast_bytes("def other(doc):\n    return doc\n")

    def test_duplicate_json_keys_fail(self):
        with self.assertRaisesRegex(ValueError, "Duplicate JSON key"):
            v.loads('{"grade":0,"grade":3}')


if __name__ == "__main__":
    unittest.main()
