#!/usr/bin/env python3
"""Independent forced-D expansion closure, separate from locked strict validation.

Pure API: validate_diagnostic_expansion(root, expanded_manifest_path,
                                      diagnostic_stage_validation_path).
It returns {manifest, qrels, evidence}; only the CLI writes exclusive sidecars.
No generator/expander, backend, model, or search code is imported or invoked.
"""
from __future__ import annotations

import argparse
from collections import Counter
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import types

ROOT = Path(__file__).resolve().parent
LOCKED_VALIDATOR_SHA256 = "abfc7d5a3264e5c02f4f30ee82a673bbe940a6d999aae5456983d82c68a225ae"


def require(ok, message):
    if not ok:
        raise ValueError(message)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def locked_validator(root):
    """Load only C's exact locked module, without creating bytecode or importing B."""
    path = Path(root).resolve() / "validate.py"
    source = path.read_bytes()
    require(hashlib.sha256(source).hexdigest() == LOCKED_VALIDATOR_SHA256, "Locked first-stage validator changed")
    module = types.ModuleType("_locked_threshold_c_validation")
    module.__file__ = str(path)
    exec(compile(source, str(path), "exec"), module.__dict__)
    return module


def reproduce_diagnostic_stage(root, stage_path):
    v = locked_validator(root)
    registration = v.verify_registration(root)
    root = registration["root"]
    path = v.input_path(root, stage_path)
    stage = v.load(path)
    require(stage.get("status") == "audited_nonconformant_diagnostic_only"
            and stage.get("complete_actual_label_evidence") is True
            and stage.get("diagnostic_only") is True and stage.get("promotion_allowed") is False
            and stage.get("forced_recommendation") == "D"
            and stage.get("original_strict_conformance_failed") is True
            and stage.get("actual_text_validation_passed") is False
            and stage.get("validator_sha256") == LOCKED_VALIDATOR_SHA256,
            "Require exact source-closed nonpromotional diagnostic stage, not a strict-pass waiver")
    args = stage.get("reproduction_inputs")
    require(isinstance(args, dict), "Missing original stage reproduction inputs")
    repeated = v.validate_diagnostic_stage_one(root, args["manifest_path"], args["core_review_paths"],
                                              args["template_review_paths"], args["adjudication_path"])
    require(repeated == stage, "Diagnostic stage does not reproduce exactly from all240 original observations")
    return v, registration, stage, path


def verify_parent_approval(root, manifest, stage, stage_path, v):
    path = v.bound(root, "parent-expansion-approval.json")
    approval = v.load(path)
    require(approval.get("schema_version") == 1 and approval.get("approved_by") == "parent-agent"
            and approval.get("expansion_allowed") is True and approval.get("diagnostic_only") is True
            and approval.get("forced_recommendation") == "D" and approval.get("promotion_allowed") is False
            and approval.get("embeddings_allowed") is False and approval.get("search_allowed") is False,
            "No explicit diagnostic-only expansion approval")
    require(manifest.get("parent_approval_sha256") == sha(path)
            and approval.get("independent_diagnostic_validation_sha256") == sha(stage_path)
            and v.bound(root, approval["independent_diagnostic_validation_path"]) == stage_path,
            "Parent approval binds another stage or changed bytes")
    for key, expected in (("spec_freeze_sha256", stage["spec_freeze_sha256"]),
                          ("stage_manifest_sha256", stage["stage_manifest_sha256"]),
                          ("terminal_templates_sha256", stage["terminal_templates_sha256"])):
        require(approval.get(key) == expected, "Parent approval source/terminal/freeze mismatch")
    require(approval.get("approved_code_sha256") == manifest.get("expansion_code_sha256")
            == sha(v.bound(root, "expand.py")), "Actual expansion code drift (code is not imported)")
    require(approval.get("diagnostic_protocol_sha256") == sha(v.bound(root, "diagnostic-protocol.md")),
            "Nonpromotional diagnostic protocol changed")
    closure = stage["historical_projection_source_closure"]["proof"]
    require(approval.get("generation_source_closure_sha256") == manifest.get("generation_source_closure_sha256")
            == closure["sha256"] == sha(v.bound(root, closure["path"])), "Historical source proof changed")
    for relative, expected in manifest.get("input_sha256", {}).items():
        require(sha(v.bound(root, relative)) == expected, "Expansion input receipt changed: " + relative)
    return {"path": "parent-expansion-approval.json", "sha256": sha(path)}


def expected_ids(registration, replicas):
    require(type(replicas) is int and 0 <= replicas <= 97, "Invalid registered replica count")
    return set(registration["plans"]) | {aid + f"-r{index:03}" for aid in registration["archetypes"]
                                        for index in range(1, replicas + 1)}


def check_raw_subset(smaller, largest):
    require(set(smaller) <= set(largest), "Nested corpus contains an unexpected ID")
    for rid, row in smaller.items():
        require(row == largest[rid], "Cross-size shared row is not byte-identical: " + rid)


def canonical_row(doc):
    return (json.dumps(doc, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode("utf-8")


def uncertainty_case_key(seed, qid, rid):
    dimension = "internal_cell_temperature_location" if qid == "t03p3" else "measurement_distance_negation_scope"
    return f"NEW:{seed}:{rid}:{dimension}"


def query_rows(seed, size, rid, intent_grades, representative_queries, queries, masks):
    """Every query has an explicit label. Only original exactly scoped U is retained."""
    rows = []
    require(set(representative_queries) == set(queries), "Original representative query matrix incomplete")
    for qid, query in sorted(queries.items()):
        key = seed, qid, rid
        if key in masks:
            mask = masks[key]
            require(representative_queries[qid] == "U", "Original U was coerced to a numeric representative label")
            row = {"cohort": "NEW", "seed": seed, "size": size, "query_id": qid, "dataset_id": rid, "grade": "U",
                   "supported_grade_interval": mask["supported_grade_interval"],
                   "uncertainty_case_key": uncertainty_case_key(seed, qid, rid),
                   "uncertainty_reason": mask["reason"]}
        else:
            grade = intent_grades[query["intent_id"]]
            require(grade == representative_queries[qid], "Safe expansion changed original known or intentional-U label")
            require((query["kind"] == "ambiguous_ungraded" and grade == "U")
                    or (type(grade) is int and grade in (0, 1, 2, 3)), "Unregistered unresolved expanded pair")
            row = {"cohort": "NEW", "seed": seed, "size": size, "query_id": qid, "dataset_id": rid, "grade": grade}
        rows.append(row)
    return rows


def check_receipt(receipt, seed, size, documents, raw, v):
    require(receipt.get("seed") == seed and receipt.get("catalog_size") == size, "Row receipt seed/size mismatch")
    rows = v.unique(receipt.get("records", []), "identifier", "row receipt")
    require(set(rows) == set(documents), "Row receipt ID coverage differs from actual corpus")
    for rid, doc in documents.items():
        require(rows[rid].get("raw_record_sha256") == v.digest(raw[rid])
                and rows[rid].get("canonical_record_sha256") == v.canonical_sha(doc),
                "Actual row differs from claimed raw/canonical receipt: " + rid)


def derive_growth_row(doc, raw_row, bundle, replica, original, registration, terminal_data, v):
    expected = v.render_terminal(bundle, replica, registration, terminal_data)
    require(expected == doc, "Expanded entire metadata is not an accepted-terminal reconstruction: " + doc["identifier"])
    require(raw_row == canonical_row(expected), "Expanded raw row serialization changed outside exact terminal substitution")
    aid, rid = bundle["archetype_id"], doc["identifier"]
    plan = registration["archetypes"][aid]
    fields = v.check_record_common(doc, plan, registration)
    v.check_identity_scope(doc, registration["generation"]["canonical_claim_sets"][plan["claim_set"]])
    lifted = v.lift_observation(original["observation_original_unchanged"], bundle, replica, terminal_data)
    citations = v.all_citations_check(lifted, fields, rid)
    contexts = v.parse_context_observations(lifted, doc, registration)
    negatives = {iid for iid, intent in registration["intents"].items() if intent["kind"].startswith("negative_")}
    v.absence_check(lifted.get("negative_absence"), negatives, fields, rid)
    grades = {iid: v.derive_grade(intent, rid, contexts) for iid, intent in registration["intents"].items()}
    require(grades == original["independent_intent_derivation_before_query_masks"],
            "Typed neutral expansion changed the independently observed semantic grades")
    # Preserve, rather than coerce, an unknown computational/administrative basis.
    require(lifted.get("semantic_review_passed") == original["observation_original_unchanged"]["semantic_review_passed"]
            and lifted.get("issues") == original["observation_original_unchanged"]["issues"],
            "Original reviewer false/issue finding was altered during expansion")
    support = {iid: v.branch_support(intent, contexts) for iid, intent in registration["intents"].items()
               if intent["kind"] == "semantic"}
    return grades, lifted, support, citations


def validate_diagnostic_expansion(root, expanded_manifest_path, diagnostic_stage_validation_path):
    """Read-only complete closure. Returns material for exclusive CLI sidecars."""
    v, registration, stage, stage_path = reproduce_diagnostic_stage(root, diagnostic_stage_validation_path)
    root = registration["root"]
    manifest_path = v.input_path(root, expanded_manifest_path)
    manifest = v.load(manifest_path)
    require(manifest.get("schema_version") == 1 and manifest.get("stage") == "expanded"
            and manifest.get("diagnostic_only") is True and manifest.get("forced_recommendation") == "D"
            and manifest.get("promotion_allowed") is False and manifest.get("strict_fixture_conformance_passed") is False
            and manifest.get("U_coerced_to_zero") is False, "Expanded artifact falsely claims promotion/strict validation")
    require(manifest.get("stage_validation_sha256") == sha(stage_path)
            and manifest.get("source_stage_manifest_sha256") == stage["stage_manifest_sha256"]
            and manifest.get("spec_freeze_sha256") == stage["spec_freeze_sha256"]
            and manifest.get("terminal_templates_sha256") == stage["terminal_templates_sha256"],
            "Expanded stage/terminal/freeze bindings changed")
    approval = verify_parent_approval(root, manifest, stage, stage_path, v)
    original_manifest = v.load(v.bound(root, stage["source_stage_one"]["path"]))
    terminal_data, bundles, terminal_ref = v._terminal_bundles(root, original_manifest, registration)
    accepted = {(x["seed"], x["archetype_id"]): x for x in stage["accepted_terminal_bindings"]}
    require(set(accepted) == set(bundles), "Diagnostic accepted-terminal coverage changed")
    for pair, bundle in bundles.items():
        require(accepted[pair]["bundle_sha256"] == v.canonical_sha(bundle), "Reviewed terminal bytes changed")
    seeds = registration["generation"]["seeds"]
    levels = {row["total_records"]: row["growth_replicas_per_archetype"] for row in registration["generation"]["growth"]["levels"]}
    expected_keys = {(seed, size) for seed in seeds for size in levels}
    corpora, documents, raw_rows, receipts = {}, {}, {}, {}
    for reference in manifest.get("corpora", []):
        key = reference.get("seed"), reference.get("catalog_size")
        require(key in expected_keys and key not in corpora, "Unknown/duplicate expanded seed/size")
        source = v.bound(root, reference["path"])
        require(sha(source) == reference.get("sha256"), "Actual expanded corpus bytes changed")
        docs, raw = v.jsonl_rows(source)
        require(set(docs) == expected_ids(registration, levels[key[1]]) and len(docs) == key[1],
                "Actual expanded ID/count population differs from frozen level")
        require(reference.get("record_count") == len(docs), "Expanded reported record count differs")
        corpora[key], documents[key], raw_rows[key] = reference, docs, raw
    require(set(corpora) == expected_keys, "Missing mandatory expanded seed/size")
    for reference in manifest.get("record_receipts", []):
        key = reference.get("seed"), reference.get("catalog_size")
        require(key in expected_keys and key not in receipts, "Unknown/duplicate row receipt")
        source = v.bound(root, reference["path"])
        require(sha(source) == reference.get("sha256"), "Expanded row receipt bytes changed")
        check_receipt(v.load(source), *key, documents[key], raw_rows[key], v)
        receipts[key] = reference
    require(set(receipts) == expected_keys, "Every expanded corpus needs a source-bound row receipt")
    max_size = max(levels)
    for seed in seeds:
        for size in levels:
            check_raw_subset(raw_rows[(seed, size)], raw_rows[(seed, max_size)])
    originals = {(x["seed"], x["dataset_id"]): x for x in stage["record_evidence"]}
    masks = {(x["seed"], x["query_id"], x["dataset_id"]): x for x in stage["explicit_unknown_pairs"]}
    queries = registration["queries"]
    qrels, evidence, mask_rows, surfaces = [], [], [], []
    quote_count = 0
    original_false_copies, basis_u_copies, growth_row_count = 0, 0, 0
    for seed, size in sorted(expected_keys):
        level_counts = Counter()
        for rid, doc in sorted(documents[(seed, size)].items()):
            raw = raw_rows[(seed, size)][rid]
            if rid in registration["plans"]:
                original = originals[(seed, rid)]
                require(v.digest(raw) == original["raw_record_sha256"], "Original core raw row changed in expansion")
                lifted = original["observation_original_unchanged"]
                grades = original["independent_intent_derivation_before_query_masks"]
                v.check_record_common(doc, registration["plans"][rid], registration)
                # Exact t051 failure was independently bound/reproduced above; never rewrite its scope.
                support = original["branch_measurement_support"]
                citations = v.all_citations_check(lifted, v.searchable(doc), rid)
                source_binding = {"kind": "byte_identical_manually_reviewed_core", "original_source": original["source"],
                                  "original_raw_record_sha256": original["raw_record_sha256"]}
            else:
                match = v.GROWTH_ID.fullmatch(rid)
                require(match is not None, "Malformed growth identity")
                aid, replica = "g" + match.group(1), int(match.group(2))
                require(replica <= levels[size], "Growth row outside its frozen level prefix")
                original = originals[(seed, aid + "-r001")]
                grades, lifted, support, citations = derive_growth_row(doc, raw, bundles[(seed, aid)], replica,
                                                                       original, registration, terminal_data, v)
                growth_row_count += 1
                source_binding = {"kind": "typed_reconstruction_of_reviewed_complete_terminal",
                                  "manual_representative": aid + "-r001", "original_source": original["source"],
                                  "original_raw_record_sha256": original["raw_record_sha256"],
                                  "bundle_sha256": accepted[(seed, aid)]["bundle_sha256"],
                                  "typed_slot_values": v._slot_values(aid, replica, terminal_data)}
            quote_count += citations
            original_false_copies += lifted.get("semantic_review_passed") is not True
            basis_u_copies += any(c["basis"]["value"] == "U" for c in lifted["contexts"])
            rows = query_rows(seed, size, rid, grades, original["independent_query_grades"], queries, masks)
            for row in rows:
                if row["grade"] == "U":
                    role = "intentional_ambiguity" if queries[row["query_id"]]["kind"] == "ambiguous_ungraded" else "scored_uncertainty"
                    level_counts[role] += 1
                    if role == "scored_uncertainty":
                        mask_rows.append(deepcopy(row))
                else:
                    level_counts["known"] += 1
            qrels.extend(rows)
            evidence.append({"cohort": "NEW", "seed": seed, "size": size, "dataset_id": rid,
                             "actual_raw_record_sha256": v.digest(raw), "actual_canonical_record_sha256": v.canonical_sha(doc),
                             "source_binding": source_binding,
                             "original_manual_semantic_review_passed": lifted["semantic_review_passed"],
                             "original_manual_issues_preserved": lifted["issues"],
                             "actual_contexts_with_literal_quotes": lifted["contexts"],
                             "actual_negative_absence_evidence": lifted["negative_absence"],
                             "branch_measurement_support": support,
                             "manual_independent_vote_claim": False})
        surfaces.append({"seed": seed, "catalog_size": size, "path": corpora[(seed, size)]["path"],
                         "sha256": corpora[(seed, size)]["sha256"], "dataset_count": len(documents[(seed, size)]),
                         "record_ids_sha256": v.canonical_sha(sorted(documents[(seed, size)])),
                         "row_receipt": receipts[(seed, size)], **dict(level_counts)})
    total_actual_rows = sum(len(x) for x in documents.values())
    require(len(evidence) == total_actual_rows and len(qrels) == total_actual_rows * len(queries), "Full expanded evidence/qrel population incomplete")
    require(len({(x["seed"], x["size"], x["query_id"], x["dataset_id"]) for x in qrels}) == len(qrels), "Duplicate expanded qrel pair")
    require(len(mask_rows) == len(masks) * len(levels), "Original scoped U not preserved at every size")
    require({(x["seed"], x["query_id"], x["dataset_id"]) for x in mask_rows} == set(masks), "Expanded U scope changed")
    known_count = sum(type(x["grade"]) is int for x in qrels)
    ambiguous_count = sum(x["grade"] == "U" and queries[x["query_id"]]["kind"] == "ambiguous_ungraded" for x in qrels)
    require(known_count + ambiguous_count + len(mask_rows) == len(qrels), "Expanded known/U counts inconsistent")
    manifest_out = {
        "schema_version": 1, "status": "audited_expanded_nonconformant_diagnostic_only",
        "diagnostic_only": True, "forced_recommendation": "D", "promotion_allowed": False,
        "original_strict_conformance_failed": True, "actual_text_validation_passed": False,
        "complete_actual_label_evidence": True, "all_expanded_rows_independently_reconstructed": True,
        "all_known_pairs_inspected": True, "unresolved_pairs_explicitly_U": True,
        "pre_retrieval": True, "embeddings_allowed": False, "search_allowed": False,
        "separate_parent_execution_approval_required": True,
        "spec_freeze_sha256": stage["spec_freeze_sha256"],
        "expansion_validator_sha256": sha(__file__), "locked_stage_validator_sha256": LOCKED_VALIDATOR_SHA256,
        "source_expansion_manifest": {"path": str(manifest_path.relative_to(root)), "sha256": sha(manifest_path)},
        "source_diagnostic_stage_validation": {"path": str(stage_path.relative_to(root)), "sha256": sha(stage_path)},
        "parent_expansion_approval": approval, "original_stage_reproduced_exactly": True,
        "pair_scope_adjudication": stage["pair_scope_adjudication"],
        "historical_projection_source_closure": stage["historical_projection_source_closure"],
        "terminal_templates": terminal_ref, "corpora": surfaces,
        "manual_actual_record_count": stage["manual_actual_record_count"],
        "reviewed_terminal_bundle_count": stage["reviewed_terminal_bundle_count"],
        "actual_rows_programmatically_closed_all_sizes": total_actual_rows,
        "unique_seed_record_realizations": sum(len(documents[(seed, max_size)]) for seed in seeds),
        "growth_rows_programmatically_closed_all_sizes": growth_row_count,
        "literal_citation_occurrences_checked_all_sizes": quote_count,
        "original_manual_false_flags_repeated_in_row_evidence": original_false_copies,
        "unresolved_basis_rows_repeated_in_row_evidence": basis_u_copies,
        "total_query_record_seed_size_pairs": len(qrels), "known_pair_count": known_count,
        "scored_unknown_pair_count": len(mask_rows), "intentional_ambiguity_pair_count": ambiguous_count,
        "unknown_pair_count": ambiguous_count + len(mask_rows), "seedless_qrels_allowed": False,
        "qrel_key_fields": ["cohort", "seed", "size", "query_id", "dataset_id"],
        "scored_uncertainty_mask": mask_rows,
        "strict_conformance_failures_preserved": stage["strict_conformance_failures"],
        "non_scoring_metadata_discrepancies_preserved": stage["non_scoring_metadata_discrepancies"],
        "legacy_unknown_pairs_unchanged": 12,
        "limitations": "180 manual core reviews plus60 complete growth-class reviews, followed by exhaustive row reconstruction, not9180 manual judgments or independent topics. Correlated prose/default metadata and all prior strict failures remain disclosed. No vectors, search or default change is authorized."
    }
    return {"manifest": manifest_out, "qrels": qrels, "evidence": evidence}


def write_jsonl_exclusive(path, rows):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as stream:
        for row in rows:
            stream.write(json.dumps(row, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n")
    return {"path": path, "sha256": sha(path), "row_count": len(rows)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--stage-validation", type=Path, required=True)
    parser.add_argument("--qrels-output", type=Path, required=True)
    parser.add_argument("--evidence-output", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    root = args.root.resolve()
    targets = []
    for path in (args.qrels_output, args.evidence_output, args.output):
        target = path.resolve() if path.is_absolute() else (root / path).resolve()
        require(target.is_relative_to(root) and not target.exists(), "Output escapes root or already exists")
        targets.append(target)
    require(len(set(targets)) == 3, "Exclusive sidecar paths must differ")
    result = validate_diagnostic_expansion(root, args.manifest, args.stage_validation)
    refs = [write_jsonl_exclusive(path, result[name]) for path, name in zip(targets[:2], ("qrels", "evidence"))]
    manifest = result["manifest"]
    for name, reference in zip(("qrels", "expanded_evidence"), refs):
        manifest[name] = {**reference, "path": str(reference["path"].relative_to(root))}
    targets[2].parent.mkdir(parents=True, exist_ok=True)
    with targets[2].open("x", encoding="utf-8") as stream:
        json.dump(manifest, stream, indent=2, sort_keys=True, ensure_ascii=False)
        stream.write("\n")
    print(json.dumps({"status": manifest["status"], "path": str(targets[2].relative_to(root)),
                      "sha256": sha(targets[2]), "known_pairs": manifest["known_pair_count"],
                      "scored_U": manifest["scored_unknown_pair_count"],
                      "intentional_U": manifest["intentional_ambiguity_pair_count"]}))


if __name__ == "__main__":
    main()
