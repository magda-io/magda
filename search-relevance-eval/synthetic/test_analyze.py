"""Hand-calculated offline metric fixtures, NOT synthetic benchmark outcomes."""
import copy
import importlib.util
import math
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("synthetic_analysis_under_test", Path(__file__).with_name("analyze.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def query(qid="q", intent="intent", kind="semantic", split="heldout"):
    row = {"id": qid, "intent_id": intent, "query": "test fixture only", "success_criteria": "known artificial target",
           "suite": "B" if kind in ("exact", "functional") else "A", "kind": kind, "split": split}
    if kind == "exact":
        row.update(authoritative_target_ids=["target"], near_identifier_ids=["wrong"])
    return row


def fixture(queries=None, seeds=(39031,), corpus=None):
    queries = queries or [query()]
    corpus = corpus or ["target", "wrong", "useful", "u"]
    qrels = [{"query_id": q["id"], "dataset_id": did,
              "grade": 0 if q["kind"] == "no_answer" else 3 if did == "target" else 0}
             for q in queries for did in corpus]
    validation = {"schema_version": 1, "status": "passed", "independent_validation": True, "pre_retrieval": True,
                  "unsupported_grade3_count": 0, "missing_positive_queries": [], "exact_targets_missing": [],
                  "corpora": [{"seed": seed, "dataset_count": len(corpus), "answerability_passed": True} for seed in seeds]}
    return queries, qrels, validation, corpus


def run(qid="q", system="baseline", seed=39031, rank=1, target="target", **extra):
    return {"query_id": qid, "system": system, "seed": seed,
            "hits": [{"id": target, "rank": rank, "score": 1}], **extra}


def report(fix, runs, seeds=(39031,), **extra):
    qs, qrels, validation, corpus = fix
    return m.build_report(qs, qrels, runs, validation, corpus_ids=corpus, seeds=seeds, **extra)


def scored(out, qid="q", system="baseline", seed=39031):
    return next(r for r in out["per_query"] if (r["query_id"], r["system"], r["seed"]) == (qid, system, seed))


def full_fixture():
    # 180 arbitrary stable IDs to exercise the frozen corpus-count gate only.
    # No dataset text, generation, retrieval, or benchmark scores are involved.
    corpus = ["target", "wrong", "useful", "u"] + [f"zero-{i}" for i in range(176)]
    fix = fixture([query(), query("e", "exact-intent", "exact")], m.SEEDS, corpus)
    runs = [run(q["id"], system, seed, rank=2 if q["id"] == "q" and system == "baseline" else 1,
                latency_samples_ms=[10] * 100, warmup=False, latency_scope="local_warmed")
            for seed in m.SEEDS for system in m.SYSTEMS for q in fix[0]]
    correctness = {str(seed): {"all_green": True} for seed in m.SEEDS}
    return fix, runs, correctness


class SyntheticAnalysisTests(unittest.TestCase):
    def test_reuses_existing_metric_at_original_rank(self):
        fix = fixture()
        out = report(fix, [run(rank=2)])
        self.assertAlmostEqual(scored(out)["ndcg_at_10"], 1 / math.log2(3))
        self.assertEqual(scored(out)["success_at_5_ge_2"], 1)
        self.assertEqual(scored(out)["success_at_5_ge_3"], 1)
        self.assertEqual(m.core.ndcg_at_k(["target"], {"target": 3}, ranks=[2]), scored(out)["ndcg_at_10"])

    def test_family_mean_not_query_mean_hand_calculated(self):
        qs = [query("a1", "a"), query("a2", "a"), query("a3", "a"), query("b1", "b")]
        fix = fixture(qs)
        runs = [run(q["id"], target="wrong" if q["id"] == "b1" else "target") for q in qs]
        out = report(fix, runs)
        row = next(x for x in out["per_seed_system_cohort"] if x["system"] == "baseline")
        self.assertEqual(row["family_mean_ndcg_at_10"], .5)
        self.assertEqual(row["query_mean_ndcg_at_10"], .75)
        self.assertEqual(row["n_intents"], 2)

    def test_missing_run_is_null_present_empty_is_zero(self):
        out = report(fixture(), [run(system="baseline", hits=[])])
        self.assertEqual(scored(out)["ndcg_at_10"], 0)
        missing = scored(out, system="candidate_03_07")
        self.assertIsNone(missing["ndcg_at_10"])
        self.assertIsNone(missing["success_at_5_ge_2"])
        self.assertFalse(missing["run_present"])
        self.assertEqual(out["decision"]["recommendation"], "C")

    def test_missing_paraphrase_invalidates_family_not_reweights(self):
        fix = fixture([query("a1", "a"), query("a2", "a")])
        out = report(fix, [run("a1")])
        family = next(x for x in out["per_intent"] if x["system"] == "baseline")
        self.assertIsNone(family["ndcg_at_10"])
        self.assertFalse(family["complete"])
        self.assertEqual(family["n_runs"], 1)

    def test_no_answer_never_ordinary_zero_or_win(self):
        fix = fixture([query("n", "negative", "no_answer", "diagnostic")])
        out = report(fix, [run("n", hits=[]), run("n", "candidate_03_07")])
        row = scored(out, "n")
        self.assertIsNone(row["ndcg_at_10"])
        self.assertIsNone(row["success_at_5_ge_2"])
        self.assertEqual(row["diagnostic_returned_hits"], 0)
        self.assertTrue(all(not c["per_query_cases"] for c in out["contrasts"]))

    def test_ambiguous_and_functional_stay_separate_from_primary(self):
        qs = [query(), query("a", "ambiguous", "ambiguous", "diagnostic"), query("f", "functional", "functional")]
        out = report(fixture(qs), [run(q["id"]) for q in qs])
        self.assertEqual(scored(out, "a")["ndcg_at_10"], 1)
        self.assertEqual(scored(out, "a")["cohort"], "ambiguous_diagnostic")
        self.assertEqual(scored(out, "f")["cohort"], "suite_b_functional_heldout")
        primary = next(r for r in out["per_seed_system_cohort"] if r["system"] == "baseline" and r["cohort"] == "suite_a_semantic_heldout")
        self.assertEqual(primary["n_queries"], 1)

    def test_u_preserves_rank_and_omits_ideal_gain(self):
        fix = fixture()
        next(r for r in fix[1] if r["dataset_id"] == "u")["grade"] = "U"
        hits = [{"id": "u", "rank": 1}, {"id": "target", "rank": 2}]
        row = scored(report(fix, [run(hits=hits)]))
        self.assertAlmostEqual(row["ndcg_at_10"], 1 / math.log2(3))
        self.assertEqual(row["u_at_10"], 1)
        self.assertEqual(row["u_qrels"], 1)

    def test_all_u_or_zero_idcg_diagnostic_is_null(self):
        for grade in ("U", 0):
            fix = fixture([query("a", "ambiguous", "ambiguous", "diagnostic")])
            for row in fix[1]:
                row["grade"] = grade
            result = scored(report(fix, [run("a")]), "a")
            self.assertIsNone(result["ndcg_at_10"])
            self.assertFalse(result["ndcg_defined_by_qrels"])

    def test_full_qrels_not_retrieved_pool_defines_idcg(self):
        fix = fixture()
        next(r for r in fix[1] if r["dataset_id"] == "useful")["grade"] = 2
        value = scored(report(fix, [run(target="useful")]))["ndcg_at_10"]
        self.assertAlmostEqual(value, 3 / (7 + 3 / math.log2(3)))
        self.assertLess(value, 1)  # would incorrectly be 1 using retrieved pool
        with self.assertRaisesRegex(ValueError, "full corpus qrels"):
            report((fix[0], [r for r in fix[1] if r["dataset_id"] == "useful"], fix[2], fix[3]), [run(target="useful")])

    def test_unknown_retrieved_id_is_not_a_judged_zero(self):
        with self.assertRaisesRegex(ValueError, "unknown corpus ID"):
            report(fixture(), [run(target="not-in-corpus")])

    def test_false_grade_and_duplicate_qrel_rejected(self):
        for grade in (True, 4, -1, None, "3"):
            fix = fixture()
            fix[1][0]["grade"] = grade
            with self.assertRaises(ValueError):
                report(fix, [])
        fix = fixture()
        fix[1].append(copy.deepcopy(fix[1][0]))
        with self.assertRaisesRegex(ValueError, "duplicate"):
            report(fix, [])

    def test_pre_run_independent_validation_and_hash_binding_required(self):
        for key in ("independent_validation", "pre_retrieval"):
            fix = fixture()
            fix[2][key] = False
            with self.assertRaisesRegex(ValueError, "independent pre-run"):
                report(fix, [])
        with self.assertRaisesRegex(ValueError, "hash mismatch"):
            report(fixture(), [], input_hashes={"qrels_sha256": "not-validator-bound"})

    def test_answerability_gate_and_exact_mapping(self):
        fix = fixture()
        for row in fix[1]:
            row["grade"] = 0
        with self.assertRaisesRegex(ValueError, "answerability"):
            report(fix, [])
        fix = fixture([query("e", "exact", "exact")])
        next(r for r in fix[1] if r["dataset_id"] == "wrong")["grade"] = 3
        with self.assertRaisesRegex(ValueError, "authoritative targets"):
            report(fix, [])

    def test_whole_family_split_required(self):
        with self.assertRaisesRegex(ValueError, "whole intent family"):
            report(fixture([query("a", "same"), query("b", "same", split="development")]), [])

    def test_exact_target_rank_top1_mrr_success_and_collision(self):
        fix = fixture([query("e", "exact", "exact")])
        row = scored(report(fix, [run("e", hits=[{"id": "wrong", "rank": 1}, {"id": "target", "rank": 2}])]), "e")
        self.assertEqual(row["authoritative_target_ranks"], {"target": 2})
        self.assertEqual(row["top1"], 0)
        self.assertEqual(row["mrr_at_10"], .5)
        self.assertEqual(row["exact_success_at_5"], 1)
        self.assertEqual(row["near_identifier_collision_ids"], ["wrong"])
        self.assertIsNone(row["ndcg_at_10"])
        row = scored(report(fix, [run("e", rank=11)]), "e")
        self.assertEqual(row["mrr_at_10"], 0)
        self.assertEqual(row["exact_success_at_5"], 0)

    def test_absent_exact_target_does_not_get_a_rank(self):
        fix = fixture([query("e", "exact", "exact")])
        row = scored(report(fix, [run("e", target="wrong")]), "e")
        self.assertIsNone(row["best_target_rank"])
        self.assertEqual(row["top1"], 0)
        self.assertEqual(row["mrr_at_10"], 0)
        self.assertEqual(row["near_identifier_collision_ids"], ["wrong"])

    def test_boost_matched_contrast_labels_not_combined_as_normalization(self):
        out = report(fixture(), [])
        labels = {c["label"]: (c["baseline"], c["candidate"]) for c in out["contrasts"]}
        self.assertEqual(labels["normalization_matched_boost50"], ("baseline", "candidate_keep50_03_07"))
        self.assertEqual(labels["normalization_matched_boost1"], ("raw_boost1", "candidate_03_07"))
        self.assertEqual(labels["remove_dataset_knn_boost_only"], ("baseline", "raw_boost1"))
        self.assertEqual(labels["primary_combined_change"], ("baseline", "candidate_03_07"))

    def test_promotion_requires_all_frozen_seeds_and_green_controls(self):
        fix, runs, green = full_fixture()
        out = report(fix, runs, m.SEEDS, correctness=green)
        self.assertEqual(out["decision"]["recommendation"], "A")
        self.assertTrue(all(x["promotion_passed"] for x in out["decision"]["per_seed"]))
        out = report(fix, runs, m.SEEDS)
        self.assertEqual(out["decision"]["recommendation"], "C")

    def test_per_seed_regression_cannot_be_masked_by_mean_gain(self):
        fix, runs, green = full_fixture()
        for row in runs:
            if row["seed"] == 39033 and row["query_id"] == "q":
                if row["system"] == "baseline":
                    row["hits"][0]["rank"] = 1
                if row["system"] == "candidate_03_07":
                    row["hits"][0]["rank"] = 2
        out = report(fix, runs, m.SEEDS, correctness=green)
        self.assertEqual(out["decision"]["recommendation"], "C")
        checks = out["decision"]["per_seed"]
        self.assertGreater(sum(x["heldout_family_ndcg_delta"] for x in checks), 0)
        self.assertLess(checks[2]["heldout_family_ndcg_delta"], 0)

    def test_critical_target_displacement_even_without_top1_change(self):
        fix, runs, green = full_fixture()
        for row in runs:
            if row["query_id"] == "e" and row["system"] in ("baseline", "candidate_03_07"):
                row["hits"][0]["rank"] = 2 if row["system"] == "baseline" else 3
        out = report(fix, runs, m.SEEDS, correctness=green)
        self.assertEqual(out["decision"]["recommendation"], "C")
        for check in out["decision"]["per_seed"]:
            self.assertEqual(check["exact_top1_loss_queries"], [])
            self.assertEqual(len(check["critical_target_displacements"]), 1)

    def test_top1_regression_is_preserved_per_query(self):
        fix, runs, green = full_fixture()
        next(r for r in runs if (r["seed"], r["system"], r["query_id"]) == (39031, "candidate_03_07", "e"))["hits"] = [{"id": "wrong", "rank": 1}, {"id": "target", "rank": 2}]
        out = report(fix, runs, m.SEEDS, correctness=green)
        self.assertEqual(out["decision"]["recommendation"], "C")
        self.assertEqual(out["decision"]["per_seed"][0]["exact_top1_loss_queries"], ["e"])

    def test_small_mixed_or_incomplete_results_are_c(self):
        fix, runs, green = full_fixture()
        for row in runs:
            if row["query_id"] == "q" and row["system"] == "baseline":
                row["hits"][0]["rank"] = 1
        self.assertEqual(report(fix, runs, m.SEEDS, correctness=green)["decision"]["recommendation"], "C")
        fix, runs, green = full_fixture()
        runs.pop()
        self.assertEqual(report(fix, runs, m.SEEDS, correctness=green)["decision"]["recommendation"], "C")

    def test_robust_raw_advantage_is_b_controlled_only(self):
        fix, runs, green = full_fixture()
        for row in runs:
            if row["query_id"] == "q" and row["system"] in ("baseline", "candidate_03_07"):
                row["hits"][0]["rank"] = 1 if row["system"] == "baseline" else 2
        out = report(fix, runs, m.SEEDS, correctness=green)
        self.assertEqual(out["decision"]["recommendation"], "B")
        self.assertIn("controlled", out["decision"]["scope"])

    def test_latency_p95_minimum_scope_and_diagnostics_excluded(self):
        qs = [query(), query("d", "diag", "ambiguous", "diagnostic"), query("dev", "dev", split="development")]
        out = report(fixture(qs), [run(latency_samples_ms=[10] * 99, warmup=False, latency_scope="local_warmed"),
                                   run("d", latency_samples_ms=[1000] * 100, warmup=False),
                                   run("dev", latency_samples_ms=[1000] * 100, warmup=False)])
        latency = next(l for l in out["latency"] if l["system"] == "baseline" and l["scope"] == "combined_heldout_positive")
        self.assertEqual(latency["n"], 99)
        self.assertEqual(latency["median_ms"], 10)
        self.assertIsNone(latency["p95_ms"])
        self.assertIn("fewer than 100", latency["p95_omission"])

    def test_latency_without_explicit_local_warmed_attestation_blocks_a(self):
        fix, runs, green = full_fixture()
        for row in runs:
            row.pop("latency_scope")
        out = report(fix, runs, m.SEEDS, correctness=green)
        self.assertEqual(out["decision"]["recommendation"], "C")
        self.assertTrue(all(c["latency_passed"] is None for c in out["decision"]["per_seed"]))

    def test_existing_latency_budget_threshold(self):
        fix, runs, green = full_fixture()
        for row in runs:
            if row["system"] == "candidate_03_07":
                row["latency_samples_ms"] = [36] * 100
        out = report(fix, runs, m.SEEDS, correctness=green)
        self.assertEqual(out["decision"]["per_seed"][0]["latency_budget_ms"], 35)
        self.assertFalse(out["decision"]["per_seed"][0]["latency_passed"])
        self.assertEqual(out["decision"]["recommendation"], "C")

    def test_duplicate_hits_runs_nonfinite_and_invalid_timings_rejected(self):
        cases = [[run(), run()], [run(hits=[{"id": "target"}, {"id": "target"}])],
                 [run(latency_samples_ms=[-1])], [run(hits=[{"id": "target", "score": float("nan")}])]]
        for runs in cases:
            with self.assertRaises(ValueError):
                report(fixture(), runs)

    def test_explicit_seed_fallback_does_not_override_existing_seed(self):
        row = run()
        row.pop("seed")
        with self.assertRaisesRegex(ValueError, "requires seed"):
            report(fixture(), [row])
        out = report(fixture(), [row], default_seed=39031)
        self.assertEqual(scored(out)["ndcg_at_10"], 1)
        with self.assertRaisesRegex(ValueError, "unknown seed"):
            report(fixture(), [run(seed=7)], default_seed=39031)

    def test_reverse_exact_guard_blocks_b_despite_raw_semantic_gain(self):
        fix, runs, green = full_fixture()
        for row in runs:
            if row["query_id"] == "q" and row["system"] in ("baseline", "candidate_03_07"):
                row["hits"][0]["rank"] = 1 if row["system"] == "baseline" else 2
            if row["query_id"] == "e" and row["system"] == "baseline":
                row["hits"][0]["rank"] = 2
        out = report(fix, runs, m.SEEDS, correctness=green)
        self.assertEqual(out["decision"]["recommendation"], "C")
        self.assertTrue(all(c["raw_exact_top1_loss_queries"] == ["e"] for c in out["decision"]["per_seed"]))

    def test_unresolved_qrels_prevent_promotion_without_fabricating_grade(self):
        fix, runs, green = full_fixture()
        next(r for r in fix[1] if r["query_id"] == "q" and r["dataset_id"] == "u")["grade"] = "U"
        out = report(fix, runs, m.SEEDS, correctness=green)
        self.assertEqual(out["decision"]["recommendation"], "C")
        self.assertTrue(all(c["unresolved_qrels"] == 1 for c in out["decision"]["per_seed"]))
        self.assertEqual(scored(out, system="candidate_03_07")["ndcg_at_10"], 1)

    def test_best_of_multiple_authoritative_targets_drives_critical_gate(self):
        fix, runs, green = full_fixture()
        fix[0][1]["authoritative_target_ids"].append("useful")
        next(r for r in fix[1] if r["query_id"] == "e" and r["dataset_id"] == "useful")["grade"] = 3
        for row in runs:
            if row["query_id"] == "e" and row["system"] == "baseline":
                row["hits"].append({"id": "useful", "rank": 2})
            if row["query_id"] == "e" and row["system"] == "candidate_03_07":
                row["hits"] = [{"id": "useful", "rank": 1}]
        out = report(fix, runs, m.SEEDS, correctness=green)
        self.assertEqual(out["decision"]["recommendation"], "A")
        self.assertTrue(all(not c["critical_target_displacements"] for c in out["decision"]["per_seed"]))

    def test_strict_frozen_intent_matrix_and_seeded_qrels(self):
        fix = fixture()
        generation = {"seeds": [39031], "record_plans": [{"id": did} for did in fix[3]],
                      "intent_doc_grades": {"intent": {r["dataset_id"]: r["grade"] for r in fix[1]}}}
        out = report(fix, [run()], generation_spec=generation)
        self.assertEqual(scored(out)["ndcg_at_10"], 1)
        generation["intent_doc_grades"]["intent"]["wrong"] = 1
        with self.assertRaisesRegex(ValueError, "frozen intent matrix"):
            report(fix, [], generation_spec=generation)
        fix = fixture()
        for row in fix[1]:
            row["seed"] = 39031
        self.assertEqual(scored(report(fix, [run()]))["ndcg_at_10"], 1)
        fix[1].append({"query_id": "q", "dataset_id": "wrong", "grade": 0})
        with self.assertRaisesRegex(ValueError, "overlapping"):
            report(fix, [])


def diagnostic_fixture(queries=None, seeds=(39031,), corpus=None):
    fix = fixture(queries, seeds, corpus)
    qs, original, validation, ids = fix
    generation = {"seeds": list(seeds), "record_plans": [{"id": did} for did in ids],
                  "intent_doc_grades": {q["intent_id"]: {r["dataset_id"]: r["grade"] for r in original if r["query_id"] == q["id"]} for q in qs}}
    mask = [{"seed": seed, "intent_id": qs[0]["intent_id"], "dataset_id": "wrong", "reason": "hand-calculated fixture uncertainty, not benchmark evidence"} for seed in seeds]
    qrels = [{**row, "seed": seed, "grade": "U" if row["dataset_id"] == "wrong" and next(q for q in qs if q["id"] == row["query_id"])["intent_id"] == qs[0]["intent_id"] else row["grade"]}
             for seed in seeds for row in original]
    validation.update(status="incomplete_diagnostic_only", full_validation_passed=False, promotion_allowed=False,
                      forced_recommendation="C", known_qrels_match_frozen=True,
                      manual_record_reviews=540, query_equivalence_reviews=75)
    policy = {"schema_version": 1, "mode": "supplementary_nonpromotional", "pre_retrieval": True,
              "recommendation": "C", "promotion_allowed": False, "no_outcomes_seen": True,
              "created_utc": "2026-11-06T00:00:00Z",
              "reason": "unresolved pre-run uncertainty; frozen confirmatory validation failed"}
    return (qs, qrels, validation, ids), generation, policy, mask


class DiagnosticAnalysisTests(unittest.TestCase):
    def test_default_strict_rejects_diagnostic_manifest_and_explicit_policy_required(self):
        fix, generation, policy, mask = diagnostic_fixture()
        with self.assertRaisesRegex(ValueError, "passed independent"):
            report(fix, [], generation_spec=generation)
        with self.assertRaisesRegex(ValueError, "requires explicit"):
            report(fix, [], generation_spec=generation, uncertainty_mask=mask)
        policy["recommendation"] = "A"
        with self.assertRaisesRegex(ValueError, "forced-C policy"):
            report(fix, [], generation_spec=generation, diagnostic_policy=policy, uncertainty_mask=mask)

    def test_unknown_never_becomes_zero_or_point_ndcg_even_when_unretrieved(self):
        fix, generation, policy, mask = diagnostic_fixture()
        out = report(fix, [run()], generation_spec=generation, diagnostic_policy=policy, uncertainty_mask=mask)
        row = scored(out)
        self.assertEqual(row["u_qrels"], 1)
        self.assertIsNone(row["ndcg_at_10"])
        self.assertIsNone(row["success_at_5_ge_2"])
        self.assertEqual(row["known_relevant_at_10_ge_2"], 1)
        self.assertIn("unknown full-corpus", row["ndcg_exclusion"])
        self.assertEqual(next(r for r in fix[1] if r["dataset_id"] == "wrong")["grade"], "U")

    def test_mask_pairs_must_be_u_and_known_pairs_must_match_frozen(self):
        for dataset, grade in (("wrong", 0), ("useful", 2), ("useful", "U")):
            fix, generation, policy, mask = diagnostic_fixture()
            next(r for r in fix[1] if r["dataset_id"] == dataset)["grade"] = grade
            with self.assertRaisesRegex(ValueError, "frozen intent matrix or exact uncertainty mask"):
                report(fix, [], generation_spec=generation, diagnostic_policy=policy, uncertainty_mask=mask)

    def test_sensitivity_recomputes_full_idcg_for_every_grade(self):
        fix, generation, policy, mask = diagnostic_fixture()
        out = report(fix, [run(), run(system="candidate_03_07", rank=2)], generation_spec=generation,
                     diagnostic_policy=policy, uncertainty_mask=mask)
        sensitivity = out["uncertainty_sensitivity"][0]
        self.assertEqual(sensitivity["scenario_count"], 4)
        self.assertEqual(sensitivity["status"], "exhaustively_enumerated")
        for assumed, scenario in enumerate(sensitivity["scenarios"]):
            self.assertEqual(scenario["assignments"][0]["assumed_grade"], assumed)
            denominator = 7 + (2 ** assumed - 1) / math.log2(3)
            base = next(r for r in scenario["per_query"] if r["system"] == "baseline")
            cand = next(r for r in scenario["per_query"] if r["system"] == "candidate_03_07")
            self.assertAlmostEqual(base["ndcg_at_10"], 7 / denominator)
            self.assertAlmostEqual(cand["ndcg_at_10"], (7 / math.log2(3)) / denominator)
            delta = next(c for c in scenario["paired_contrasts"] if c["label"] == "primary_combined_change")["family_mean_delta"]
            self.assertAlmostEqual(delta, cand["ndcg_at_10"] - base["ndcg_at_10"])
        self.assertIsNone(scored(out)["ndcg_at_10"])

    def test_paraphrases_share_one_uncertainty_assignment_not_independent_draws(self):
        qs = [query("p1", "same"), query("p2", "same"), query("p3", "same")]
        fix, generation, policy, mask = diagnostic_fixture(qs)
        out = report(fix, [run(q["id"]) for q in qs], generation_spec=generation,
                     diagnostic_policy=policy, uncertainty_mask=mask)
        sensitivity = out["uncertainty_sensitivity"][0]
        self.assertEqual(sensitivity["scenario_count"], 4)  # NOT 4**3
        for scenario in sensitivity["scenarios"]:
            scores = [r["ndcg_at_10"] for r in scenario["per_query"] if r["system"] == "baseline"]
            self.assertEqual(scores, [scores[0]] * 3)

    def test_known_family_mean_is_descriptive_with_actual_count_not_primary(self):
        qs = [query("uncertain", "uncertain"), query("known", "known")]
        fix, generation, policy, mask = diagnostic_fixture(qs)
        out = report(fix, [run(q["id"]) for q in qs], generation_spec=generation,
                     diagnostic_policy=policy, uncertainty_mask=mask)
        summary = next(r for r in out["per_seed_system_cohort"] if r["system"] == "baseline")
        self.assertEqual(summary["n_intents"], 2)
        self.assertEqual(summary["descriptive_known_family_count"], 1)
        self.assertEqual(summary["descriptive_known_family_mean_ndcg_at_10"], 1)
        self.assertIsNone(summary["family_mean_ndcg_at_10"])
        self.assertFalse(summary["frozen_primary_available"])
        contrast = next(c for c in out["contrasts"] if c["label"] == "primary_combined_change")
        self.assertIsNone(contrast["mean_paired_family_delta"])

    def test_forced_c_even_if_every_known_case_looks_promotable(self):
        strict, runs, green = full_fixture()
        qs, _, _, corpus = strict
        fix, generation, policy, mask = diagnostic_fixture(qs, m.SEEDS, corpus)
        out = report(fix, runs, m.SEEDS, correctness=green, generation_spec=generation,
                     diagnostic_policy=policy, uncertainty_mask=mask)
        self.assertEqual(out["decision"]["recommendation"], "C")
        self.assertTrue(out["decision"]["forced"])
        self.assertFalse(out["decision"]["promotion_allowed"])
        self.assertTrue(all(not c["promotion_passed"] for c in out["decision"]["per_seed"]))
        self.assertEqual(scored(out, "e")["top1"], 1)  # fully validated exact remains ordinary

    def test_masked_exact_has_no_precision_point_score(self):
        fix, generation, policy, mask = diagnostic_fixture([query("e", "exact", "exact")])
        out = report(fix, [run("e")], generation_spec=generation, diagnostic_policy=policy, uncertainty_mask=mask)
        row = scored(out, "e")
        for metric in ("top1", "mrr_at_10", "exact_success_at_5", "best_target_rank", "authoritative_target_ranks"):
            self.assertIsNone(row[metric])
        self.assertFalse(out["decision"]["per_seed"][0]["exact_complete"])
        self.assertEqual(out["uncertainty_sensitivity"], [])

    def test_ambiguous_unknown_displayed_without_fake_graded_point(self):
        fix, generation, policy, mask = diagnostic_fixture([query("a", "ambiguous", "ambiguous", "diagnostic")])
        out = report(fix, [run("a", hits=[{"id": "wrong", "rank": 1}, {"id": "target", "rank": 2}])],
                     generation_spec=generation, diagnostic_policy=policy, uncertainty_mask=mask)
        row = scored(out, "a")
        self.assertIsNone(row["ndcg_at_10"])
        self.assertEqual(row["top10"][0]["grade"], "U")
        self.assertEqual(row["known_relevant_at_10_ge_3"], 1)

    def test_unmasked_exact_regression_remains_visible_in_forced_c_report(self):
        qs = [query(), query("e", "exact", "exact")]
        fix, generation, policy, mask = diagnostic_fixture(qs)
        out = report(fix, [run(), run(system="candidate_03_07"), run("e"), run("e", "candidate_03_07", rank=2)],
                     generation_spec=generation, diagnostic_policy=policy, uncertainty_mask=mask)
        self.assertEqual(out["decision"]["recommendation"], "C")
        check = out["decision"]["per_seed"][0]
        self.assertEqual(check["exact_top1_loss_queries"], ["e"])
        self.assertEqual(len(check["critical_target_displacements"]), 1)
        self.assertEqual(scored(out, "e", "candidate_03_07")["mrr_at_10"], .5)

    def test_seedless_diagnostic_qrels_and_missing_created_timestamp_rejected(self):
        fix, generation, policy, mask = diagnostic_fixture()
        fix[1][0].pop("seed")
        with self.assertRaisesRegex(ValueError, "explicit seed"):
            report(fix, [], generation_spec=generation, diagnostic_policy=policy, uncertainty_mask=mask)
        fix, generation, policy, mask = diagnostic_fixture()
        policy.pop("created_utc")
        with self.assertRaisesRegex(ValueError, "created_utc"):
            report(fix, [], generation_spec=generation, diagnostic_policy=policy, uncertainty_mask=mask)

    def test_policy_hashes_and_no_outcomes_attestation_required(self):
        fix, generation, policy, mask = diagnostic_fixture()
        with self.assertRaisesRegex(ValueError, "policy hash mismatch"):
            report(fix, [], generation_spec=generation, diagnostic_policy=policy, uncertainty_mask=mask,
                   input_hashes={"spec_freeze_sha256": "different"})
        policy["no_outcomes_seen"] = False
        with self.assertRaisesRegex(ValueError, "forced-C policy"):
            report(fix, [], generation_spec=generation, diagnostic_policy=policy, uncertainty_mask=mask)


if __name__ == "__main__":
    unittest.main()
