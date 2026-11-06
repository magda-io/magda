#!/usr/bin/env python3
"""Offline synthetic-design-truth analysis; no retrieval, generation or judging.

Uses the existing evaluate.ndcg_at_k and operational helpers. Full independently
validated corpus qrels, not a retrieved pool, define IDCG. See analysis-plan.md.
"""
import argparse
from collections import defaultdict
import datetime
import hashlib
import importlib.util
import itertools
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Use unique module names: synthetic/analyze.py must not import itself as the
# existing operational analyze.py when called directly or under unittest.
def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


core = _load("synthetic_metric_core", ROOT / "evaluate.py")
operational = _load("synthetic_operational_core", ROOT / "analyze.py")
SEEDS = (39031, 39032, 39033)
SYSTEMS = ("baseline", "raw_boost1", "candidate_03_07", "candidate_05_05",
           "candidate_07_03", "candidate_keep50_03_07", "keyword", "vector")
CONTRASTS = (
    ("normalization_matched_boost50", "baseline", "candidate_keep50_03_07"),
    ("normalization_matched_boost1", "raw_boost1", "candidate_03_07"),
    ("remove_dataset_knn_boost_only", "baseline", "raw_boost1"),
    ("primary_combined_change", "baseline", "candidate_03_07"),
    ("fixed_weight_05_05_vs_baseline", "baseline", "candidate_05_05"),
    ("fixed_weight_07_03_vs_baseline", "baseline", "candidate_07_03"),
    ("fixed_weight_05_05_vs_03_07", "candidate_03_07", "candidate_05_05"),
    ("fixed_weight_07_03_vs_03_07", "candidate_03_07", "candidate_07_03"),
    ("keyword_control", "baseline", "keyword"),
    ("vector_control", "baseline", "vector"),
)
LIMITATIONS = [
    "Grades are independently validated synthetic design truth, not human/LLM A/B relevance judgments or production-representative relevance.",
    "Primary units are held-out intent families: average paraphrases within intent, then weight intents equally, separately in each seed.",
    "Three seeded phrasings share facts and intents; seeds and repeated latency samples are not independent relevance observations. No significance or population claim is made.",
    "U has assumed zero retrieved gain at original rank and is excluded from full-corpus IDCG; unresolved judgments make NDCG an assumption-dependent score, not a guaranteed bound.",
    "No-answer diagnostics have null NDCG, never ordinary zero or a ranking win. Ambiguous and functional queries are separate cohorts.",
    "Missing runs are null and invalidate completeness gates; an explicitly present empty ranking can score zero for an answerable query.",
    "Local warmed latency is descriptive and excludes embedding/public API unless the runner explicitly measures them. p95 requires at least 100 samples; correlated repeats do not increase independent task count.",
    "A/B/C recommendations concern this fixed controlled benchmark only. Thresholds are engineering heuristics, not proof of production relevance.",
    "Matched-boost normalization contrast keys denote normalized-architecture contrasts, not causal normalization-processor-only effects: root/child keyword and vector-family grouping differs from baseline per-entity nested hybrid under disMax. Neutral quality1/geography does not remove this restructuring confound.",
]


def _seed(value):
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError("seed must be an integer")
    return value


def _numeric(grade):
    return isinstance(grade, int) and not isinstance(grade, bool) and 0 <= grade <= 3


def _queries(records):
    result, family_splits = {}, {}
    for query in records:
        qid = core._identifier(query.get("id"), "query id")
        intent = core._identifier(query.get("intent_id"), "intent_id")
        if qid in result:
            raise ValueError("duplicate query id")
        for field in ("query", "success_criteria"):
            if field not in query:
                raise ValueError(f"{qid}: missing {field}")
        if not isinstance(query["query"], str) or not query["query"].strip():
            raise ValueError("query text must be nonempty")
        if query.get("suite") not in ("A", "B"):
            raise ValueError("suite must be A or B")
        if query.get("kind") not in ("semantic", "exact", "functional", "ambiguous", "no_answer"):
            raise ValueError("unknown query kind")
        if query.get("split") not in ("development", "heldout", "diagnostic"):
            raise ValueError("unknown split")
        previous = family_splits.setdefault(intent, query["split"])
        if previous != query["split"]:
            raise ValueError("whole intent family must remain in one split")
        if query["kind"] == "semantic" and query["suite"] != "A":
            raise ValueError("semantic primary queries belong to suite A")
        if query["kind"] in ("exact", "functional") and query["suite"] != "B":
            raise ValueError("exact/functional queries belong to suite B")
        if query["kind"] in ("ambiguous", "no_answer") and query["split"] != "diagnostic":
            raise ValueError("ambiguous/no_answer must be diagnostic")
        targets = query.get("authoritative_target_ids", [])
        if not isinstance(targets, list) or len(targets) != len(set(targets)):
            raise ValueError("authoritative_target_ids must be a unique list")
        for target in targets:
            core._identifier(target, "authoritative target id")
        if query["kind"] == "exact" and not targets:
            raise ValueError("exact query requires authoritative targets")
        result[qid] = query
    if not result:
        raise ValueError("queries are empty")
    return result


def _diagnostic_contract(policy, mask, queries, seeds, corpus, input_hashes=None):
    if (not isinstance(policy, dict) or policy.get("schema_version") != 1
            or policy.get("mode") != "supplementary_nonpromotional"
            or policy.get("pre_retrieval") is not True or policy.get("recommendation") != "C"
            or policy.get("promotion_allowed") is not False or policy.get("no_outcomes_seen") is not True
            or not isinstance(policy.get("reason"), str) or not policy["reason"].strip()):
        raise ValueError("explicit pre-retrieval supplementary nonpromotional forced-C policy required")
    try:
        created = datetime.datetime.fromisoformat(policy["created_utc"].replace("Z", "+00:00"))
        if created.utcoffset() != datetime.timedelta(0):
            raise ValueError("created_utc must use UTC")
    except (KeyError, AttributeError, TypeError, ValueError) as exc:
        raise ValueError("diagnostic policy requires a valid timezone-aware created_utc timestamp") from exc
    if input_hashes is not None:
        for key in ("spec_freeze_sha256", "validation_manifest_sha256", "uncertainty_mask_sha256"):
            if policy.get(key) != input_hashes.get(key):
                raise ValueError(f"diagnostic policy hash mismatch: {key}")
    intents = {q["intent_id"] for q in queries.values()}
    result = {}
    for row in mask:
        key = (_seed(row.get("seed")), row.get("intent_id"), row.get("dataset_id"))
        if key[0] not in seeds or key[1] not in intents or key[2] not in corpus or key in result:
            raise ValueError("uncertainty mask must have unique known seed/intent/dataset units")
        if not isinstance(row.get("reason"), str) or not row["reason"].strip():
            raise ValueError("uncertainty mask requires independent evidence reason")
        result[key] = dict(row)
    if not result:
        raise ValueError("supplementary diagnostic policy requires nonempty explicit uncertainty mask")
    return result


def _validated_qrels(records, queries, validation, seeds, corpus_ids, input_hashes=None,
                     diagnostic_policy=None):
    """Enforce explicit exhaustive qrels and an external pre-run validation gate.

    Input hashes bind on-disk artifacts when called by the CLI. A declaration of
    independence is a protocol attestation, not proof of reviewer independence.
    Optional qrel.seed overrides global seedless qrels only by using a wholly
    seed-specific file; mixed global/seed-specific pairs are rejected.
    """
    diagnostic = diagnostic_policy is not None
    allowed_status = ("incomplete_diagnostic_only",) if diagnostic else ("passed",)
    if not isinstance(validation, dict) or validation.get("schema_version") != 1 or any(validation.get(k) is not True
            for k in ("independent_validation", "pre_retrieval")) or validation.get("status") not in allowed_status:
        raise ValueError("require passed independent pre-run validation manifest" if not diagnostic else "diagnostic requires explicit independently audited partial/failed manifest")
    if diagnostic and (validation.get("full_validation_passed") is not False or validation.get("promotion_allowed") is not False
                       or validation.get("forced_recommendation") != "C" or validation.get("known_qrels_match_frozen") is not True):
        raise ValueError("diagnostic manifest must explicitly fail full validation, attest independently validated known qrels, and force C")
    if diagnostic and seeds == SEEDS and (validation.get("manual_record_reviews") != 540 or validation.get("query_equivalence_reviews") != 75):
        raise ValueError("diagnostic manifest requires all540 record and75 query-equivalence reviews")
    if not diagnostic and (validation.get("unsupported_grade3_count") != 0 or validation.get("missing_positive_queries") != []
            or validation.get("exact_targets_missing") != []):
        raise ValueError("unresolved independent validation failures")
    corpora = validation.get("corpora", [])
    if sorted(c.get("seed") for c in corpora) != sorted(seeds) or (not diagnostic and not all(c.get("answerability_passed") is True for c in corpora)):
        raise ValueError("validation seed coverage/answerability mismatch")
    corpus = corpus_ids
    if not isinstance(corpus, list) or not corpus or len(corpus) != len(set(corpus)):
        raise ValueError("must enumerate unique full corpus_ids from validated corpora")
    corpus = set(core._identifier(item, "corpus id") for item in corpus)
    if any(c.get("dataset_count") != len(corpus) for c in corpora):
        raise ValueError("validation corpus count mismatch")
    if seeds == SEEDS and len(corpus) != 180:
        raise ValueError("frozen experiment requires joint 180-document corpus")
    if input_hashes is not None:
        keys = ("query_spec_sha256", "validated_qrels_sha256", "qrels_sha256", "spec_freeze_sha256", "uncertainty_mask_sha256") if diagnostic else ("query_spec_sha256", "qrels_sha256", "spec_freeze_sha256")
        for key in keys:
            if validation.get(key) != input_hashes.get(key):
                raise ValueError(f"validation hash mismatch: {key}")
    grades = {seed: {qid: {} for qid in queries} for seed in seeds}
    for row in records:
        if diagnostic and "seed" not in row:
            raise ValueError("diagnostic validated qrels require explicit seed on every row")
        qid, did, grade = row.get("query_id"), row.get("dataset_id"), row.get("grade")
        if qid not in queries or did not in corpus:
            raise ValueError("qrel has unknown query or corpus dataset")
        if not _numeric(grade) and grade != "U":
            raise ValueError("qrel grade must be integer 0..3 or U")
        covered_seeds = seeds if "seed" not in row else (_seed(row["seed"]),)
        for seed in covered_seeds:
            if seed not in grades:
                raise ValueError("unknown qrel seed")
            if did in grades[seed][qid]:
                raise ValueError("duplicate or overlapping global/seed qrel")
            grades[seed][qid][did] = grade
    for seed in seeds:
        for qid, query in queries.items():
            values = grades[seed][qid]
            if set(values) != corpus:
                raise ValueError(f"full corpus qrels required: {seed}/{qid}")
            affected = diagnostic and "U" in values.values()
            if query["kind"] in ("semantic", "functional") and not affected and not any(g == 3 for g in values.values()):
                raise ValueError("positive-intent answerability gate failed: requires grade3 anchor")
            if query["kind"] == "exact":
                targets = set(query["authoritative_target_ids"])
                if not targets <= corpus or (not affected and targets != {did for did, g in values.items() if g == 3}):
                    raise ValueError("authoritative targets and grade3 exact qrels disagree")
                near = query.get("near_identifier_ids", [])
                if not isinstance(near, list) or len(near) != len(set(near)) or not set(near) <= corpus or set(near) & targets:
                    raise ValueError("invalid near_identifier_ids")
            if query["kind"] == "no_answer" and any(_numeric(g) and g >= 2 for g in values.values()):
                raise ValueError("no-answer query has useful positive qrel")
    return grades, corpus


def _cohort(query):
    if query["kind"] == "semantic":
        return "suite_a_semantic_" + query["split"]
    if query["kind"] == "functional":
        return "suite_b_functional_" + query["split"]
    if query["kind"] == "exact":
        return "suite_b_exact_" + query["split"]
    return query["kind"] + "_diagnostic"


def _score(query, grades, run, suppress_unknown=False):
    hits = core._ranked_hits(run) if run is not None else []
    ids, ranks = [h["id"] for h in hits], [h["rank"] for h in hits]
    graded = query["kind"] not in ("no_answer", "exact")
    numeric = {key: g for key, g in grades.items() if _numeric(g)}
    defined = graded and core.ndcg_at_k([], grades) is not None
    measure = {
        "run_present": run is not None,
        "ndcg_at_10": core.ndcg_at_k(ids, grades, ranks=ranks) if graded and run is not None else None,
        "ndcg_defined_by_qrels": defined,
        "numeric_qrels": len(numeric), "u_qrels": len(grades) - len(numeric),
        "retrieved_at_10": sum(r <= 10 for r in ranks),
        "u_at_10": sum(h["rank"] <= 10 and grades[h["id"]] == "U" for h in hits),
        "success_at_5_ge_2": int(any(h["rank"] <= 5 and numeric.get(h["id"], 0) >= 2 for h in hits)) if graded and run is not None and defined else None,
        "success_at_5_ge_3": int(any(h["rank"] <= 5 and numeric.get(h["id"], 0) >= 3 for h in hits)) if graded and run is not None and defined else None,
        "top10": [{"id": h["id"], "rank": h["rank"], "score": h.get("score"), "grade": grades[h["id"]]} for h in hits if h["rank"] <= 10],
    }
    if query["kind"] == "no_answer":
        measure["diagnostic_returned_hits"] = len(hits) if run is not None else None
        measure["ndcg_exclusion"] = "no-answer diagnostic, not ordinary zero NDCG"
    if query["kind"] == "exact":
        targets = set(query["authoritative_target_ids"])
        target_ranks = {target: next((h["rank"] for h in hits if h["id"] == target), None) for target in sorted(targets)}
        present = [r for r in target_ranks.values() if r is not None]
        best = min(present) if present else None
        wrong_ahead = [h["id"] for h in hits if h["id"] not in targets and (best is None or h["rank"] < best)]
        collision_ids = query.get("near_identifier_ids")
        measure.update({"authoritative_target_ranks": target_ranks, "best_target_rank": best,
            "top1": int(best == 1) if run is not None else None,
            "mrr_at_10": (1 / best if best is not None and best <= 10 else 0) if run is not None else None,
            "exact_success_at_5": int(best is not None and best <= 5) if run is not None else None,
            "wrong_ids_ahead_of_target": wrong_ahead if run is not None else None,
            "near_identifier_collision_ids": [did for did in wrong_ahead if did in collision_ids] if collision_ids is not None and run is not None else None,
            "collision_classification": "frozen near_identifier_ids" if collision_ids is not None else "wrong-ID displacement recorded; near-identifier classification not supplied"})
    if suppress_unknown and any(g == "U" for g in grades.values()):
        measure.update({"uncertain_query": True, "ndcg_exclusion": "unknown full-corpus qrels: no point NDCG; U is not grade0",
                        "known_relevant_at_10_ge_2": sum(h["rank"] <= 10 and numeric.get(h["id"], 0) >= 2 for h in hits),
                        "known_relevant_at_10_ge_3": sum(h["rank"] <= 10 and numeric.get(h["id"], 0) == 3 for h in hits)})
        measure["ndcg_defined_by_qrels"] = False
        for metric in ("ndcg_at_10", "success_at_5_ge_2", "success_at_5_ge_3"):
            measure[metric] = None
        if query["kind"] == "exact":
            for metric in ("top1", "mrr_at_10", "exact_success_at_5", "best_target_rank", "authoritative_target_ranks",
                           "wrong_ids_ahead_of_target", "near_identifier_collision_ids"):
                measure[metric] = None
            measure["precision_exclusion"] = "uncertain exact-query qrels; no exact precision inference"
    else:
        measure["uncertain_query"] = False
    return measure


def _families(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[(row["seed"], row["system"], row["cohort"], row["intent_id"])].append(row)
    result = []
    for (seed, system, cohort, intent), members in sorted(groups.items()):
        # Do not silently change a family's effective paraphrase mix when a run
        # is absent or one query has undefined IDCG.
        complete = all(r["run_present"] for r in members)
        result.append({"seed": seed, "system": system, "cohort": cohort, "intent_id": intent,
            "query_ids": [r["query_id"] for r in members], "n_queries": len(members),
            "n_runs": sum(r["run_present"] for r in members), "complete": complete,
            **{metric: core._mean(r[metric] for r in members) if complete and all(r[metric] is not None for r in members) else None
               for metric in ("ndcg_at_10", "success_at_5_ge_2", "success_at_5_ge_3")}})
    return result


def _aggregate(rows, families):
    result = []
    groups = sorted({(r["seed"], r["system"], r["cohort"]) for r in rows})
    for seed, system, cohort in groups:
        members = [r for r in rows if (r["seed"], r["system"], r["cohort"]) == (seed, system, cohort)]
        fs = [f for f in families if (f["seed"], f["system"], f["cohort"]) == (seed, system, cohort)]
        complete = all(r["run_present"] for r in members)
        result.append({"seed": seed, "system": system, "cohort": cohort,
            "n_queries": len(members), "n_runs": sum(r["run_present"] for r in members),
            "n_intents": len(fs), "n_defined_intents": sum(f["ndcg_at_10"] is not None for f in fs),
            "complete": complete,
            "family_mean_ndcg_at_10": core._mean(f["ndcg_at_10"] for f in fs),
            "family_mean_success_at_5_ge_2": core._mean(f["success_at_5_ge_2"] for f in fs),
            "family_mean_success_at_5_ge_3": core._mean(f["success_at_5_ge_3"] for f in fs),
            "query_mean_ndcg_at_10": core._mean(r["ndcg_at_10"] for r in members),
            **{metric: core._mean(r.get(metric) for r in members) if complete else None
               for metric in ("top1", "mrr_at_10", "exact_success_at_5")},
            "wrong_id_displacement_queries": sum(bool(r.get("wrong_ids_ahead_of_target")) for r in members),
            "near_identifier_collision_queries": sum(bool(r.get("near_identifier_collision_ids")) for r in members),
            "unresolved_qrels": sum(r["u_qrels"] for r in members)})
    return result


def _outcome(delta):
    return "win" if delta > 1e-12 else "loss" if delta < -1e-12 else "tie"


def _comparisons(rows, families, seeds):
    find = {(r["seed"], r["system"], r["query_id"]): r for r in rows}
    ff = {(f["seed"], f["system"], f["cohort"], f["intent_id"]): f for f in families}
    result = []
    for label, baseline, candidate in CONTRASTS:
        for seed in seeds:
            for cohort in sorted({r["cohort"] for r in rows}):
                deltas, cases = [], []
                for key, left in sorted(ff.items()):
                    s, system, group, intent = key
                    if (s, system, group) != (seed, baseline, cohort):
                        continue
                    right = ff[(seed, candidate, cohort, intent)]
                    b, c = left["ndcg_at_10"], right["ndcg_at_10"]
                    if b is not None and c is not None:
                        d = c - b
                        deltas.append({"intent_id": intent, "delta": d, "outcome": _outcome(d)})
                for key, left in sorted(find.items()):
                    s, system, qid = key
                    if (s, system, left["cohort"]) != (seed, baseline, cohort):
                        continue
                    right = find[(seed, candidate, qid)]
                    metric = "top1" if left["kind"] == "exact" else "ndcg_at_10"
                    b, c = left.get(metric), right.get(metric)
                    if b is not None and c is not None:
                        d = c - b
                        cases.append({"query_id": qid, "intent_id": left["intent_id"], "metric": metric,
                            "baseline": b, "candidate": c, "delta": d, "outcome": _outcome(d),
                            "baseline_top10": left["top10"], "candidate_top10": right["top10"],
                            "baseline_target_rank": left.get("best_target_rank"), "candidate_target_rank": right.get("best_target_rank"),
                            "baseline_mrr_at_10": left.get("mrr_at_10"), "candidate_mrr_at_10": right.get("mrr_at_10"),
                            "baseline_collision_ids": left.get("near_identifier_collision_ids"), "candidate_collision_ids": right.get("near_identifier_collision_ids")})
                result.append({"label": label, "baseline": baseline, "candidate": candidate,
                    "seed": seed, "cohort": cohort, "n_paired_families": len(deltas),
                    "mean_paired_family_delta": core._mean(d["delta"] for d in deltas),
                    "wins": sum(d["outcome"] == "win" for d in deltas),
                    "ties": sum(d["outcome"] == "tie" for d in deltas),
                    "losses": sum(d["outcome"] == "loss" for d in deltas),
                    "per_intent_deltas": deltas, "per_query_cases": cases,
                    "uncertainty": "not estimated; families and seeds are not independent repeated trials"})
    return result


def _latencies(runs, seeds, queries):
    result = []
    # Validate every supplied timing, even timings excluded from the guard.
    core._latencies(runs)
    for seed in seeds:
        cohort_runs = [r for r in runs if r["seed"] == seed and queries[r["query_id"]]["split"] == "heldout"
                       and queries[r["query_id"]]["kind"] in ("semantic", "exact", "functional")]
        for scope in ("combined_heldout_positive", "suite_a_heldout", "suite_b_heldout"):
            subset = [r for r in cohort_runs if scope == "combined_heldout_positive" or
                      queries[r["query_id"]]["suite"] == ("A" if scope == "suite_a_heldout" else "B")]
            groups = core._latencies(subset)
            for system in SYSTEMS:
                group = groups.get(system, {}).get("non_warmup", core._timing_summary([]))
                # warmup=False alone means non-warmup, not necessarily warmed/local.
                timing_runs = [r for r in subset if r["system"] == system and r.get("warmup") is False]
                attested = bool(timing_runs) and all(r.get("latency_scope") == "local_warmed" for r in timing_runs)
                expected = {qid for qid, q in queries.items() if q["split"] == "heldout" and q["kind"] in ("semantic", "exact", "functional")
                            and (scope == "combined_heldout_positive" or q["suite"] == ("A" if scope == "suite_a_heldout" else "B"))}
                observed = {r["query_id"] for r in timing_runs if r.get("latency_samples_ms") or r.get("latency_ms") is not None}
                result.append({"seed": seed, "system": system, "scope": scope, "n": group["n"],
                    "n_queries": len(timing_runs), "n_expected_queries": len(expected),
                    "complete_query_coverage": expected == observed,
                    "median_ms": group["median_ms"],
                    "p95_ms": group["p95_ms"] if group["n"] >= 100 else None,
                    "p95_omission": None if group["n"] >= 100 else "fewer than 100 explicitly non-warmup samples",
                    "local_warmed_attested": attested,
                    "all_labels": groups.get(system, {}),
                    "repeat_dependence": "correlated repeated requests, not independent queries"})
    return result


def _gate(rows, aggregate, comparisons, latency, seeds, correctness):
    checks = []
    by_row = {(r["seed"], r["system"], r["query_id"]): r for r in rows}
    for seed in seeds:
        delta = next((c["mean_paired_family_delta"] for c in comparisons if c["seed"] == seed
                      and c["label"] == "primary_combined_change" and c["cohort"] == "suite_a_semantic_heldout"), None)
        semantic = [a for a in aggregate if a["seed"] == seed and a["system"] in ("baseline", "candidate_03_07")
                    and a["cohort"] == "suite_a_semantic_heldout"]
        semantic_complete = len(semantic) == 2 and all(a["complete"] and a["n_defined_intents"] == a["n_intents"] for a in semantic)
        exact = [r for r in rows if r["seed"] == seed and r["system"] == "baseline" and r["kind"] == "exact"]
        top1_losses, displaced, raw_top1_losses, raw_displaced, exact_complete = [], [], [], [], bool(exact)
        for base in exact:
            cand = by_row[(seed, "candidate_03_07", base["query_id"])]
            if not base["run_present"] or not cand["run_present"] or base.get("uncertain_query") or cand.get("uncertain_query"):
                exact_complete = False
                continue
            if base["top1"] > cand["top1"]:
                top1_losses.append(base["query_id"])
            if cand["top1"] > base["top1"]:
                raw_top1_losses.append(base["query_id"])
            # Frozen gate uses the best accepted target in the returned top ten.
            rank = base["best_target_rank"]
            current = cand["best_target_rank"]
            rank = rank if rank is not None and rank <= 10 else None
            current = current if current is not None and current <= 10 else None
            event = {"query_id": base["query_id"], "baseline_rank": rank, "candidate_rank": current}
            if rank is not None and (current is None or current > rank):
                displaced.append(event)
            if current is not None and (rank is None or rank > current):
                raw_displaced.append(event)
        b = next(x for x in latency if x["seed"] == seed and x["system"] == "baseline" and x["scope"] == "combined_heldout_positive")
        c = next(x for x in latency if x["seed"] == seed and x["system"] == "candidate_03_07" and x["scope"] == "combined_heldout_positive")
        budget = max(1.5 * b["p95_ms"], b["p95_ms"] + 25) if b["p95_ms"] is not None else None
        latency_ok = c["p95_ms"] <= budget if budget is not None and c["p95_ms"] is not None and b["local_warmed_attested"] and c["local_warmed_attested"] and b["complete_query_coverage"] and c["complete_query_coverage"] else None
        complete = all(r["run_present"] for r in rows if r["seed"] == seed)
        unresolved = sum(r["u_qrels"] for r in rows if r["seed"] == seed and r["system"] == "baseline")
        green = correctness.get(str(seed), {}).get("all_green") is True
        passed = (complete and semantic_complete and delta is not None and delta >= .05 - 1e-12
                  and exact_complete and not top1_losses and not displaced and not unresolved and green and latency_ok is True)
        checks.append({"seed": seed, "complete_all_eight_systems": complete,
            "semantic_complete": semantic_complete, "heldout_family_ndcg_delta": delta,
            "semantic_improvement_ge_005": delta is not None and delta >= .05 - 1e-12,
            "exact_complete": exact_complete, "exact_top1_loss_queries": top1_losses,
            "critical_target_displacements": displaced, "raw_exact_top1_loss_queries": raw_top1_losses,
            "raw_critical_target_displacements": raw_displaced, "unresolved_qrels": unresolved,
            "correctness_all_green": green,
            "baseline_p95_ms": b["p95_ms"], "candidate_p95_ms": c["p95_ms"],
            "latency_budget_ms": budget, "latency_passed": latency_ok, "promotion_passed": passed})
    recommendation = "C"
    if all(c["promotion_passed"] for c in checks):
        recommendation = "A"
    elif all(c["complete_all_eight_systems"] and c["semantic_complete"] and c["exact_complete"]
             and c["correctness_all_green"] and not c["raw_exact_top1_loss_queries"]
             and not c["raw_critical_target_displacements"] and not c["unresolved_qrels"]
             and c["heldout_family_ndcg_delta"] is not None
             and c["heldout_family_ndcg_delta"] <= -.05 + 1e-12 for c in checks):
        recommendation = "B"
    return {"recommendation": recommendation, "scope": "controlled synthetic benchmark only; no production relevance claim",
            "correctness_attestation": correctness,
            "per_seed": checks, "rule": "A requires >= +0.05 heldout family NDCG in ALL three fixed seeds, no per-case exact top1 loss or best-target displacement, no U, all correctness green, warmed local p95 <= max(1.5*baseline, baseline+25ms). Robust raw advantage >=0.05 in every complete/correct seed with no reverse exact top1/best-target loss and no U supports B; otherwise C. No best-weight selection."}


def _diagnostic_sensitivity(queries, grades, indexed, mask, seeds):
    """Exhaustive allowed-grade scenarios; one grade per correlated intent/doc.

    Never mutate validated U qrels or use assumption-dependent extrema to pick
    systems. The explicit cap fails closed on enumeration, not on uncertainty:
    no guessed/pool-denominator bounds are emitted for oversized products.
    """
    result = []
    for seed in seeds:
        for cohort in sorted({_cohort(q) for q in queries.values()}):
            group = {qid: q for qid, q in queries.items() if _cohort(q) == cohort}
            if not any(q["kind"] not in ("exact", "no_answer") for q in group.values()):
                continue
            units = sorted(key for key in mask if key[0] == seed and any(q["intent_id"] == key[1] for q in group.values()))
            if not units:
                continue
            count = 4 ** len(units)
            item = {"seed": seed, "cohort": cohort, "uncertainty_units": [mask[key] for key in units],
                    "allowed_grades": [0, 1, 2, 3], "scenario_count": count,
                    "interpretation": "supplementary assumption-dependent sensitivity, not validated point relevance or promotion evidence; full numeric corpus IDCG recomputed for every assignment"}
            if count > 4096:
                item.update(status="not_enumerated", reason="Cartesian product exceeds fixed4096-scenario safety cap; no approximate bounds invented", scenarios=[], bounds=[])
                result.append(item)
                continue
            scenarios = []
            for values in itertools.product(range(4), repeat=len(units)):
                assignment = dict(zip(units, values))
                scenario_rows = []
                for qid, query in sorted(group.items()):
                    resolved = {did: assignment[(seed, query["intent_id"], did)] if grade == "U" else grade
                                for did, grade in grades[seed][qid].items()}
                    for system in SYSTEMS:
                        scenario_rows.append({"seed": seed, "system": system, "query_id": qid,
                            "intent_id": query["intent_id"], "cohort": cohort,
                            **_score(query, resolved, indexed.get((seed, system, qid)))})
                families = _families(scenario_rows)
                summaries = _aggregate(scenario_rows, families)
                by_system = {a["system"]: a for a in summaries}
                paired = []
                for label, baseline, candidate in CONTRASTS:
                    left, right = by_system[baseline], by_system[candidate]
                    b, c = left["family_mean_ndcg_at_10"], right["family_mean_ndcg_at_10"]
                    defined = all(a["complete"] and a["n_defined_intents"] == a["n_intents"] for a in (left, right))
                    paired.append({"label": label, "baseline": baseline, "candidate": candidate,
                                   "family_mean_delta": c - b if defined and b is not None and c is not None else None})
                scenarios.append({"assignments": [{"seed": key[0], "intent_id": key[1], "dataset_id": key[2], "assumed_grade": value}
                                                    for key, value in assignment.items()],
                                  "per_query": [{"system": r["system"], "query_id": r["query_id"], "ndcg_at_10": r["ndcg_at_10"]} for r in scenario_rows],
                                  "per_intent": families, "per_system": summaries, "paired_contrasts": paired})
            bounds = []
            for label, baseline, candidate in CONTRASTS:
                values = [next(c["family_mean_delta"] for c in s["paired_contrasts"] if c["label"] == label) for s in scenarios]
                defined = [v for v in values if v is not None]
                bounds.append({"label": label, "n_defined_scenarios": len(defined),
                               "delta_min": min(defined) if defined else None, "delta_max": max(defined) if defined else None,
                               "all_scenarios_defined": len(defined) == count})
            system_bounds = []
            for system in SYSTEMS:
                summaries = [next(a for a in s["per_system"] if a["system"] == system) for s in scenarios]
                values = [a["family_mean_ndcg_at_10"] for a in summaries if a["complete"] and a["n_defined_intents"] == a["n_intents"] and a["family_mean_ndcg_at_10"] is not None]
                system_bounds.append({"system": system, "n_defined_scenarios": len(values),
                                      "family_mean_ndcg_min": min(values) if values else None,
                                      "family_mean_ndcg_max": max(values) if values else None,
                                      "all_scenarios_defined": len(values) == count})
            item.update(status="exhaustively_enumerated", scenarios=scenarios, bounds=bounds, system_bounds=system_bounds)
            result.append(item)
    return result


def _mark_supplementary(aggregate, contrasts, rows):
    for summary in aggregate:
        members = [r for r in rows if (r["seed"], r["system"], r["cohort"]) == (summary["seed"], summary["system"], summary["cohort"])]
        summary["n_uncertain_queries"] = sum(r["uncertain_query"] for r in members)
        summary["interpretation"] = "supplementary nonpromotional; exact metrics only for fully validated cases"
        summary["descriptive_known_family_mean_ndcg_at_10"] = summary["family_mean_ndcg_at_10"]
        summary["descriptive_known_family_count"] = summary["n_defined_intents"]
        if summary["n_uncertain_queries"]:
            for metric in ("family_mean_ndcg_at_10", "family_mean_success_at_5_ge_2", "family_mean_success_at_5_ge_3", "query_mean_ndcg_at_10"):
                summary[metric] = None
        if summary["cohort"] == "suite_a_semantic_heldout":
            summary["frozen_primary_available"] = False
    for contrast in contrasts:
        contrast["interpretation"] = "supplementary paired comparison over fully validated known families only, never frozen primary or promotion evidence"
        contrast["descriptive_known_family_delta"] = contrast["mean_paired_family_delta"]
        contrast["mean_paired_family_delta"] = None


def build_report(queries, qrels, runs, validation_manifest, *, corpus_ids,
                 seeds=SEEDS, correctness=None, input_hashes=None, default_seed=None,
                 generation_spec=None, diagnostic_policy=None, uncertainty_mask=None):
    """Pure offline aggregation API. No outcome-dependent labels or tuning."""
    seeds = tuple(_seed(seed) for seed in seeds)
    if len(seeds) != len(set(seeds)) or not seeds:
        raise ValueError("seeds must be nonempty and unique")
    query_map = _queries(queries)
    if diagnostic_policy is None and uncertainty_mask is not None:
        raise ValueError("uncertainty mask requires explicit diagnostic policy")
    mask = _diagnostic_contract(diagnostic_policy, uncertainty_mask or [], query_map, seeds,
                                set(corpus_ids), input_hashes) if diagnostic_policy is not None else {}
    if diagnostic_policy is not None and generation_spec is None:
        raise ValueError("diagnostic mode requires original frozen intent matrix")
    grades, corpus = _validated_qrels(qrels, query_map, validation_manifest, seeds, corpus_ids, input_hashes,
                                      diagnostic_policy=diagnostic_policy)
    if generation_spec is not None:
        matrix = generation_spec["intent_doc_grades"]
        planned_ids = [r["id"] for r in generation_spec["record_plans"]]
        if set(planned_ids) != corpus or len(planned_ids) != len(corpus) or tuple(generation_spec["seeds"]) != seeds:
            raise ValueError("generation plan corpus/seeds disagree")
        for query in query_map.values():
            planned = matrix[query["intent_id"]]
            if set(planned) != corpus:
                raise ValueError("frozen intent matrix is not full corpus")
            for seed in seeds:
                expected = {did: "U" if (seed, query["intent_id"], did) in mask else grade
                            for did, grade in planned.items()}
                if grades[seed][query["id"]] != expected:
                    raise ValueError("validated qrels differ from frozen intent matrix or exact uncertainty mask; no silent label amendments")
    indexed, normalized = {}, []
    for source in runs:
        run = dict(source)
        if "seed" not in run:
            if default_seed is None:
                raise ValueError("run requires seed or explicit CLI seed grouping")
            run["seed"] = default_seed
        seed = _seed(run["seed"])
        system, qid = run.get("system"), run.get("query_id")
        if seed not in seeds or system not in SYSTEMS or qid not in query_map:
            raise ValueError("run has unknown seed/system/query")
        key = (seed, system, qid)
        if key in indexed:
            raise ValueError("duplicate seed/system/query run")
        hits = core._ranked_hits(run)
        if any(h["id"] not in corpus for h in hits):
            raise ValueError("run contains unknown corpus ID; not an unjudged zero")
        for hit in hits:
            score = hit.get("score")
            if score is not None and (isinstance(score, bool) or not isinstance(score, (int, float)) or not math.isfinite(score)):
                raise ValueError("hit scores must be finite or null")
        indexed[key] = run
        normalized.append(run)
    rows = []
    fidelity = []
    for seed in seeds:
        for system in SYSTEMS:
            for qid, query in sorted(query_map.items()):
                run = indexed.get((seed, system, qid))
                rows.append({"seed": seed, "system": system, "query_id": qid,
                    "intent_id": query["intent_id"], "suite": query["suite"],
                    "kind": query["kind"], "split": query["split"], "cohort": _cohort(query),
                    **_score(query, grades[seed][qid], run, suppress_unknown=diagnostic_policy is not None)})
                baseline = indexed.get((seed, "baseline", qid))
                if system != "baseline" and baseline is not None and run is not None:
                    has_facets = "aggregations" in baseline and "aggregations" in run
                    fidelity.append({"seed": seed, "system": system, "query_id": qid,
                        "same_total_hits": baseline["total_hits"] == run["total_hits"] if "total_hits" in baseline and "total_hits" in run else None,
                        "facet_count_differences": operational.differences(operational.counts(baseline["aggregations"]), operational.counts(run["aggregations"])) if has_facets else None,
                        "note": "baseline count agreement is diagnostic, not independent correctness proof"})
    families = _families(rows)
    aggregate = _aggregate(rows, families)
    contrasts = _comparisons(rows, families, seeds)
    latency = _latencies(normalized, seeds, query_map)
    gate = _gate(rows, aggregate, contrasts, latency, seeds, correctness or {})
    sensitivity = []
    if diagnostic_policy is not None:
        sensitivity = _diagnostic_sensitivity(query_map, grades, indexed, mask, seeds)
        gate.update(recommendation="C", promotion_allowed=False, forced=True,
                    reason=diagnostic_policy["reason"], original_confirmatory_validation="failed",
                    frozen_primary_available=False, diagnostic_policy=diagnostic_policy)
        for check in gate["per_seed"]:
            check["descriptive_known_family_delta"] = check["heldout_family_ndcg_delta"]
            check["heldout_family_ndcg_delta"] = None
            check["semantic_improvement_ge_005"] = None
            check["promotion_passed"] = False
        _mark_supplementary(aggregate, contrasts, rows)
    # A custom seed set is useful for unit checks but cannot satisfy the frozen
    # three-seed experiment's decision gate.
    if seeds != SEEDS:
        gate["recommendation"] = "C"
        gate["non_preregistered_seed_set"] = True
    return {"schema_version": 1, "seeds": list(seeds), "systems": list(SYSTEMS),
        "truth_source": "partially independently validated frozen synthetic design truth; original confirmatory validation failed" if diagnostic_policy is not None else "pre-run independently validated synthetic design truth",
        "idcg_source": "full corpus qrels; never retrieved pool",
        "validation_attestation": validation_manifest,
        "analysis_mode": "supplementary_nonpromotional" if diagnostic_policy is not None else "strict_confirmatory",
        "uncertainty_mask": list(mask.values()), "uncertainty_sensitivity": sensitivity,
        "per_query": rows, "per_intent": families, "per_seed_system_cohort": aggregate,
        "contrasts": contrasts, "latency": latency, "operational_fidelity": fidelity,
        "decision": gate, "limitations": ([text for text in LIMITATIONS if not text.startswith("U has assumed")]
            + ["Supplementary nonpromotional replay only: original confirmatory validation failed, all outcomes force C, point graded metrics are null for every U-affected query. Known-only family means and full-IDCG grade-assignment sensitivities are descriptive, not the frozen primary or promotion evidence."]
            if diagnostic_policy is not None else LIMITATIONS)}


def _sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ("queries", "qrels", "generation-spec", "validation-manifest", "output"):
        parser.add_argument("--" + key, required=True)
    parser.add_argument("--runs", action="append", required=True)
    parser.add_argument("--seed", type=int, help="assign this seed ONLY to rows without seed; not a seed subset")
    parser.add_argument("--correctness", help="JSON object keyed by seed, with all_green attestations")
    parser.add_argument("--spec-freeze", help="default: spec-freeze.json beside query spec")
    parser.add_argument("--diagnostic-policy", help="explicit hash-bound pre-retrieval forced-C supplementary policy; default strict gate unchanged")
    parser.add_argument("--uncertainty-mask", help="independently audited seed/intent/dataset uncertainty JSONL; requires --diagnostic-policy")
    args = parser.parse_args()
    if bool(args.diagnostic_policy) != bool(args.uncertainty_mask):
        parser.error("--diagnostic-policy and --uncertainty-mask must be supplied together")
    freeze_path = Path(args.spec_freeze) if args.spec_freeze else Path(args.queries).parent / "spec-freeze.json"
    freeze_tool = _load("synthetic_analysis_freeze", Path(__file__).with_name("freeze.py"))
    frozen = freeze_tool.verify(freeze_path.parent, freeze_path)
    if frozen["spec_sha256"].get("query-spec.jsonl") != _sha(args.queries) or frozen["spec_sha256"].get("generation-spec.json") != _sha(args.generation_spec):
        raise ValueError("analysis query/generation artifacts differ from verified freeze")
    hashes = {"query_spec_sha256": _sha(args.queries), "qrels_sha256": _sha(args.qrels),
              "spec_freeze_sha256": _sha(freeze_path)}
    validation_path = Path(args.validation_manifest)
    validation = json.loads(validation_path.read_text())
    generation = json.loads(Path(args.generation_spec).read_text())
    corpus_ids, corpus_paths = None, []
    for entry in validation.get("corpora", []):
        path = validation_path.parent / entry["path"]
        if _sha(path) != entry["sha256"]:
            raise ValueError("validated corpus file hash mismatch")
        records = core.read_jsonl(path)
        ids = [record["identifier"] for record in records]
        id_hash = hashlib.sha256(json.dumps(sorted(ids), separators=(",", ":")).encode()).hexdigest()
        if entry.get("record_ids_sha256") != id_hash:
            raise ValueError("validated corpus record ID hash mismatch")
        if len(ids) != 180 or len(set(ids)) != 180 or (corpus_ids is not None and set(ids) != set(corpus_ids)):
            raise ValueError("validated corpora require identical stable 180 IDs")
        corpus_ids = ids
        corpus_paths.append(str(path))
    diagnostic_policy, uncertainty_mask, diagnostic_paths = None, None, []
    if args.diagnostic_policy:
        diagnostic_policy = json.loads(Path(args.diagnostic_policy).read_text())
        uncertainty_mask = core.read_jsonl(args.uncertainty_mask)
        original_qrels = validation_path.parent / validation["qrels_path"]
        hashes.update(qrels_sha256=_sha(original_qrels), validated_qrels_sha256=_sha(args.qrels),
                      validation_manifest_sha256=_sha(validation_path), uncertainty_mask_sha256=_sha(args.uncertainty_mask))
        bound_mask = validation_path.parent / validation["uncertainty_mask_path"]
        if _sha(bound_mask) != hashes["uncertainty_mask_sha256"]:
            raise ValueError("analysis uncertainty mask differs from validator-bound file")
        qrels_path = validation_path.parent / validation["validated_qrels_path"]
        if _sha(qrels_path) != hashes["validated_qrels_sha256"]:
            raise ValueError("analysis validated qrels differ from validator-bound file")
        evidence_path = validation_path.parent / validation["validation_evidence_path"]
        if _sha(evidence_path) != validation.get("validation_evidence_sha256"):
            raise ValueError("independent validation evidence hash mismatch")
        diagnostic_paths = [args.diagnostic_policy, args.uncertainty_mask, str(original_qrels), str(evidence_path)]
    else:
        qrels_path = validation_path.parent / validation["qrels_path"]
        if _sha(qrels_path) != hashes["qrels_sha256"]:
            raise ValueError("analysis qrels differ from validator-bound qrels file")
    correctness = json.loads(Path(args.correctness).read_text()) if args.correctness else {}
    result = build_report(core.read_jsonl(args.queries), core.read_jsonl(args.qrels),
                          [r for path in args.runs for r in core.read_jsonl(path)], validation,
                          corpus_ids=corpus_ids, generation_spec=generation,
                          input_hashes=hashes, correctness=correctness, default_seed=args.seed,
                          diagnostic_policy=diagnostic_policy, uncertainty_mask=uncertainty_mask)
    paths = [args.queries, args.qrels, args.generation_spec, args.validation_manifest, str(freeze_path)] + args.runs + corpus_paths + diagnostic_paths
    if args.correctness:
        paths.append(args.correctness)
    result["input_sha256"] = {str(path): _sha(path) for path in paths}
    Path(args.output).write_text(json.dumps(result, indent=2, sort_keys=True, allow_nan=False) + "\n")


if __name__ == "__main__":
    main()
