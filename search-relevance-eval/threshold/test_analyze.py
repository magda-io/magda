"""Tiny invented metric/evidence cases only; no benchmark text or outcomes."""
import copy
import importlib.util
import math
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("threshold_analyzer_tested", Path(__file__).with_name("analyze.py"))
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)
H = "a" * 64


def query(qid="q", iid="f", kind="semantic", split="heldout", **extra):
    return dict(id=qid, intent_id=iid, kind=kind, split=split, **extra)


def run(qid="q", system="ms_050", ids=("a",), ranks=None, seed=1, size=60, **extra):
    ranks = ranks or range(1, len(ids) + 1)
    return dict(cohort="NEW", seed=seed, size=size, query_id=qid, system=system,
                hits=[dict(id=d, rank=r, score=1.0) for d, r in zip(ids, ranks)], **extra)


def native(qid="q", did="a", root=.47, child=.8, **extra):
    return dict(cohort="NEW", seed=1, size=60, query_id=qid, dataset_id=did, root_score=root,
                children=[] if child is None else [dict(distribution_id=did + "-child", offset=0, score=child, allowed=True, projection_sha256=H, dimension=3)],
                max_child_score=child, root_projection_sha256=H, query_vector_sha256=H, dimension=3,
                source="engine_exact_docvalues_l2", **extra)


def inventory(scores):
    return [dict(cohort=r.get("cohort", "NEW"), seed=r["seed"], size=r["size"], dataset_id=r["dataset_id"],
                 root=dict(projection_sha256=H, dimension=3),
                 children=[dict(distribution_id=c["distribution_id"], offset=c["offset"], allowed=True,
                                projection_sha256=H, dimension=3) for c in r["children"]]) for r in scores]


def gates():
    result = copy.deepcopy(m.default_gates())
    result["seeds"] = [1, 2, 3]
    return result


def contrast_fixture(recall_core=(1, 1), recall_growth=(1, 2), *, baseline_fp=(), candidate_fp=()):
    """Just metric IDs/grades, not corpus prose. Full size fields are grouping keys."""
    g = gates()
    queries = [query("s" + str(i), "f" + str(i)) for i in range(2)]
    queries += [query("u", "u", "negative_unrelated"), query("o", "o", "negative_or_lookalike")]
    qm = {q["id"]: q for q in queries}
    rows, indexed = [], {}
    for seed in g["seeds"]:
        for size in g["catalog_sizes"]:
            for q in queries:
                grades = {"a": 3, "b": 3, "c": 2, "z": 0, "y": 0, "t": 1} if q["kind"] == "semantic" else {d: 0 for d in ("a", "b", "c", "z", "y", "t")}
                counts = recall_core if size == 60 else recall_growth
                for system, n in zip(("ms_050", "ms_045"), counts):
                    positive = ("a", "b", "c")[:n] if q["kind"] == "semantic" else ()
                    false = baseline_fp if system == "ms_050" else candidate_fp
                    r = run(q["id"], system, positive + tuple(false), seed=seed, size=size)
                    indexed[("NEW", seed, size, q["id"], system)] = r
                    rows.append(dict(cohort="NEW", seed=seed, size=size, query_id=q["id"],
                                     intent_id=q["intent_id"], kind=q["kind"], split=q["split"], system=system,
                                     **m.score_query(q, grades, r)))
    out = m._contrasts(rows, m._families(rows), qm, indexed, g, "heldout", ["ms_045"])
    return g, out


class MetricReuseTests(unittest.TestCase):
    def test_existing_core_and_original_sparse_ranks(self):
        q, grades = query(), {"a": 3, "b": 2, "u": 0}
        row = m.score_query(q, grades, run(ids=("u", "a"), ranks=(1, 3)))
        self.assertEqual(m.core.ndcg_at_k(["u", "a"], grades, ranks=[1, 3]), row["ndcg_at_10"])
        self.assertEqual(.5, row["recall_at_10_ge_2"])
        self.assertEqual(["a", "b"], row["useful_positive_ids"])

    def test_full_idcg_nonretrieved_positive(self):
        a = m.score_query(query(), {"a": 3}, run())
        b = m.score_query(query(), {"a": 3, "b": 3}, run())
        self.assertEqual(1, a["ndcg_at_10"])
        self.assertLess(b["ndcg_at_10"], 1)
        self.assertEqual(.5, b["recall_at_10_ge_2"])

    def test_unreturned_U_nulls_all_graded_points(self):
        row = m.score_query(query(), {"a": 3, "u": "U"}, run())
        for metric in m.METRICS:
            self.assertIsNone(row[metric])
        self.assertEqual(1, row["descriptive_known_positive_recall"])
        self.assertIsNone(row["grade0_count_top10"])
        self.assertEqual("U", {"u": "U"}["u"])
        empty_known = m.score_query(query(), {"a": 0, "u": "U"}, run())
        self.assertIsNone(empty_known["descriptive_known_positive_recall"])

    def test_missing_and_present_empty_differ(self):
        grades = {"a": 3}
        self.assertIsNone(m.score_query(query(), grades, None)["recall_at_10_ge_2"])
        self.assertEqual(0, m.score_query(query(), grades, run(ids=()))["recall_at_10_ge_2"])

    def test_zero_negative_not_ranking_win_grade1_not_false_positive(self):
        negative = m.score_query(query(kind="negative_unrelated"), {"a": 0}, run())
        for metric in m.METRICS:
            self.assertIsNone(negative[metric])
        self.assertEqual(1, negative["grade0_count_top10"])
        tangential = m.score_query(query(), {"a": 1, "b": 3}, run())
        self.assertEqual(0, tangential["grade0_count_top10"])
        self.assertEqual(["a"], tangential["grade1_ids_top10"])

    def test_duplicate_unknown_nonfinite_rejected(self):
        for r in (run(ids=("a", "a")), run(ids=("a", "b"), ranks=(1, 1)), run(ids=("unknown",))):
            with self.assertRaises(ValueError):
                m.score_query(query(), {"a": 3, "b": 0}, r)
        r = run()
        r["hits"][0]["score"] = float("nan")
        with self.assertRaises(ValueError):
            m.score_query(query(), {"a": 3}, r)

    def test_every_target_not_best_target(self):
        q = query(kind="exact", authoritative_target_ids=["a", "b"], near_identifier_ids=["z"])
        events = m.exact_events(q, run(ids=("z", "a", "b")), run(ids=("a", "z", "b"), ranks=(1, 2, 4)))
        self.assertEqual(["b"], [e["target_id"] for e in events if e["type"] == "target_displacement"])
        self.assertFalse(any(e["type"] == "new_wrong_ID_ahead" for e in events))

    def test_exact_top10_loss_and_new_wrong_when_target_missing(self):
        q = query(kind="exact", authoritative_target_ids=["a"], near_identifier_ids=["z"])
        events = m.exact_events(q, run(), run(ids=("z",)))
        self.assertEqual({"target_displacement", "new_wrong_ID_ahead"}, {e["type"] for e in events})
        self.assertIsNone(events[0]["candidate_rank"])
        self.assertEqual([], m.exact_events(q, run(ids=()), run(ids=())))
        self.assertIsNone(m.exact_events(q, None, run()))


class GrowthGateTests(unittest.TestCase):
    def test_core_ceiling_no_gain_not_failure(self):
        g, (checks, summaries, exposures, blockers) = contrast_fixture()
        core_gain = [c for c in checks if c["size"] == 60 and c["name"] in ("aggregate_recall", "recovered_families")]
        self.assertTrue(all(c["passed"] for c in core_gain))
        self.assertTrue(all(c["passed"] for c in checks))
        self.assertEqual(2, len(summaries[1]["recovered_families"]))

    def test_growth_delta_of_treatment_not_candidate_absolute_drop(self):
        g, (checks, _, _, _) = contrast_fixture(recall_core=(3, 3), recall_growth=(1, 2))
        # Candidate falls from recall1 to2/3, but treatment improves0 to1/3.
        growth = [c for c in checks if c["name"].startswith("paired_growth_")]
        self.assertTrue(all(c["passed"] for c in growth))

    def test_mixed_seed_failure_not_decisive_B(self):
        g, (checks, _, _, _) = contrast_fixture()
        subset = [dict(c) for c in checks if c["name"] == "aggregate_recall"]
        next(c for c in subset if c["seed"] == 1 and c["size"] == 1000)["passed"] = False
        self.assertFalse(m._decisive(subset, "ms_045", g))
        for c in subset:
            if c["size"] == 1000:
                c["passed"] = False
        self.assertTrue(m._decisive(subset, "ms_045", g))

    def test_additions_not_net_fp_counts_and_keyword_no_exemption(self):
        _, (_, _, exposure, _) = contrast_fixture(baseline_fp=("z",), candidate_fp=("y",))
        self.assertTrue(all(e["new_grade0_top10"] == 1 for e in exposure))
        self.assertTrue(all(e["baseline_grade0_top10"] == e["candidate_grade0_top10"] for e in exposure))

    def test_unchanged_keyword_noise_not_incremental_cost(self):
        _, (checks, _, exposure, _) = contrast_fixture(baseline_fp=("z", "y"), candidate_fp=("z", "y"))
        self.assertTrue(all(e["new_grade0_top10"] == 0 for e in exposure))
        self.assertTrue(all(c["passed"] for c in checks))

    def test_A_C_B_D_precedence_not_best_held_grid(self):
        g = gates()
        checks = [dict(system=s["id"], name="aggregate_recall", category="performance", seed=seed, size=1000,
                       passed=s["id"] in ("ms_048", "ms_040")) for s in g["registered_systems"] for seed in g["seeds"]]
        self.assertEqual("C", m.decide(checks, [], "ms_048", g)[0])
        self.assertEqual("B", m.decide(checks, [], "ms_046", g)[0])
        self.assertEqual("D", m.decide(checks, ["insufficient opportunity"], "ms_048", g)[0])
        for c in checks:
            if c["system"] == "ms_045":
                c["passed"] = True
        self.assertEqual("A", m.decide(checks, [], "ms_048", g)[0])


class NativeEligibilityTests(unittest.TestCase):
    def fixture(self, root=.47, child=.8):
        g = gates()
        g["seeds"] = [1]
        spec = g["coverage_opportunity"]
        for key in ("minimum_heldout_pairs_in_band_per_seed", "minimum_heldout_pairs_in_opportunity_per_seed",
                    "minimum_heldout_families_with_opportunity_per_seed", "minimum_opportunity_pairs_root_measurement_evidence_per_seed"):
            spec[key] = 1
        spec["minimum_opportunity_pairs_nested_measurement_evidence_per_seed"] = 0
        qm = {"q": query()}
        grades = {("NEW", 1, 60, "q"): {"a": 3}}
        pairs = [dict(query_id="q", record_id="a", split="heldout", evidence_bearing_scope="root")]
        evidence = [dict(seed=1, query_id="q", dataset_id="a", branch="root", supports_dataset_grade=True, evidence_refs=["field:quote"])]
        return g, qm, grades, pairs, evidence, [native(root=root, child=child)]

    def test_evidence_quota_requires_same_branch(self):
        g, qm, grades, pairs, ev, scores = self.fixture(root=.8, child=.47)
        out = m.opportunity(scores, pairs, qm, {}, grades, g, ev)
        self.assertEqual(1, out["per_seed"][0]["narrow"])
        self.assertEqual(0, out["per_seed"][0]["root"])
        self.assertFalse(out["adequate"])
        scores[0] = native(root=.47, child=.8)
        self.assertTrue(m.opportunity(scores, pairs, qm, {}, grades, g, ev)["adequate"])

    def test_missing_branch_evidence_not_inferred_from_grade3(self):
        g, qm, grades, pairs, ev, scores = self.fixture()
        self.assertFalse(m.opportunity(scores, pairs, qm, {}, grades, g)["adequate"])

    def test_opportunity_not_retrieved_or_score_selected(self):
        g, qm, grades, pairs, ev, scores = self.fixture()
        grades["NEW", 1, 60, "q"]["b"] = 2
        # Omitting a fixed known-positive pair must not reduce denominator.
        out = m.opportunity(scores, pairs, qm, {}, grades, g, ev)
        self.assertFalse(out["adequate"])
        self.assertEqual(2, out["per_seed"][0]["expected_pairs"])

    def test_fixed_histogram_density_and_dataset_labels(self):
        rows = [native(root=.4, child=.5), native(did="b", root=.6, child=None)]
        grades = {("NEW", 1, 60, "q"): {"a": 3, "b": 3}}
        out = m.score_distributions(rows, grades, {"q": query()})
        root = next(r for r in out if r["score_path"] == "root")
        self.assertEqual(2, root["n"])
        self.assertEqual(2, sum(root["bin_counts"]))
        self.assertAlmostEqual(1, sum(root["conditional_density"]) / 50)
        self.assertEqual("3", root["dataset_grade"])
        self.assertEqual(1, root["cdf"][-1]["fraction"])
        child = next(r for r in out if r["score_path"] == "max_authorized_child")
        self.assertEqual(1, child["missing"])

    def test_geometry_formula_is_not_cosine_threshold(self):
        self.assertAlmostEqual(.38888888888888884, (3 - 1 / .45) / 2)

    def test_child_max_and_offsets_validated(self):
        row = native()
        row["max_child_score"] = .2
        with self.assertRaises(ValueError):
            m._native_index([row])
        row = native()
        row["children"].append(dict(row["children"][0], distribution_id="other"))
        with self.assertRaises(ValueError):
            m._native_index([row])

    def test_full_eligibility_not_top10_composition(self):
        g = gates()
        g["registered_systems"] = [s for s in g["registered_systems"] if s["id"] in ("ms_050", "ms_045")]
        qm = {"q": query()}
        catalog = {("NEW", 1, 60): dict(ids={"a", "z"})}
        grades = {("NEW", 1, 60, "q"): {"a": 3, "z": 0}}
        indexed = {("NEW", 1, 60, "q", s): run(system=s) for s in ("ms_050", "ms_045")}
        elig = [dict(cohort="NEW", seed=1, size=60, query_id="q", system=s, keyword_ids=["a"], hybrid_ids=ids,
                     complete=True, source_primary_top10_subset=True, request_sha256=H, root_vector_ids=[], nested_vector_ids=["a"]) for s, ids in (("ms_050", ["a"]), ("ms_045", ["a", "z"]))]
        scores = [native(), native(did="z", root=.47, child=.2)]
        out = m.eligibility_attribution(elig, scores, qm, catalog, grades, indexed, g, inventory(scores))
        self.assertTrue(out["available"])
        event = next(r for r in out["events"] if r["system"] == "ms_045")
        self.assertTrue(event["newly_admitted_hybrid"])
        self.assertFalse(event["new_top10_exposure"])
        self.assertFalse(event["keyword_eligible"])
        self.assertFalse(event["actual_root_vector_member"])

    def test_existing_keyword_id_promoted_not_new_admission(self):
        g = gates()
        g["registered_systems"] = [s for s in g["registered_systems"] if s["id"] in ("ms_050", "ms_045")]
        qm, catalog = {"q": query()}, {("NEW", 1, 60): dict(ids={"a", "z"})}
        grades = {("NEW", 1, 60, "q"): {"a": 3, "z": 0}}
        indexed = {("NEW", 1, 60, "q", "ms_050"): run(), ("NEW", 1, 60, "q", "ms_045"): run(system="ms_045", ids=("a", "z"))}
        elig = [dict(seed=1, size=60, query_id="q", system=s, keyword_ids=["a", "z"], hybrid_ids=["a", "z"],
                     complete=True, source_primary_top10_subset=True, request_sha256=H, root_vector_ids=[], nested_vector_ids=["a"]) for s in ("ms_050", "ms_045")]
        scores = [native(), native(did="z", root=.47, child=.2)]
        out = m.eligibility_attribution(elig, scores, qm, catalog, grades, indexed, g, inventory(scores))
        event = next(r for r in out["events"] if r["system"] == "ms_045")
        self.assertTrue(event["keyword_eligible"])
        self.assertTrue(event["new_top10_exposure"])
        self.assertFalse(event["newly_admitted_hybrid"])
        del elig[1]["keyword_ids"]
        out = m.eligibility_attribution(elig, [native(), native(did="z")], qm, catalog, grades, indexed, g)
        self.assertFalse(out["available"])


class TimingAndProvenanceTests(unittest.TestCase):
    def test_n90_descriptive_n180_guard(self):
        samples = [run(str(i), latency_samples_ms=list(range(10)), warmup=False, latency_scope="local_warmed") for i in range(9)]
        small = m.latency_summary(samples, expected_queries=[str(i) for i in range(9)])
        self.assertEqual(90, small["n"])
        self.assertEqual(9, small["p95_ms"])
        self.assertFalse(small["guard_eligible"])
        big = m.latency_summary(samples + [dict(r, query_id="b" + r["query_id"]) for r in samples],
                                expected_queries=[str(i) for i in range(9)] + ["b" + str(i) for i in range(9)])
        self.assertTrue(big["guard_eligible"])
        self.assertEqual(180, big["n"])

    def test_no_warmup_pooled_missing_query_or_invalid_sample_pass(self):
        r = run(latency_samples_ms=[1] * 10, warmup=True, latency_scope="local_warmed")
        self.assertFalse(m.latency_summary([r], expected_queries=["q"])["complete"])
        r["warmup"] = False
        self.assertFalse(m.latency_summary([r], expected_queries=["q", "missing"])["complete"])
        r["latency_samples_ms"][0] = float("inf")
        with self.assertRaises(ValueError):
            m.latency_summary([r], expected_queries=["q"])

    def test_hash_binding_and_payload_are_both_required(self):
        bindings = {"x": dict(expected_sha256=H, observed_sha256=H)}
        self.assertTrue(m.validate_bindings(bindings, ("x",)))  # Declared hashes without actual paths are not proof.
        bindings["x"]["observed_sha256"] = "b" * 64
        self.assertTrue(m.validate_bindings(bindings, ("x",)))
        ev = {"input_sha256": {"qrels": m.digest([1])}}
        self.assertTrue(m.payload_problems(ev, qrels=[1]))  # No actual typed source file.
        self.assertTrue(m.payload_problems(ev, qrels=[2]))

    def test_explicit_source_hash_reads_only_named_path(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            source = Path(directory) / "source.txt"
            source.write_text("tiny metric artifact\n")
            out = m.verify_bindings({"x": dict(path="source.txt", expected_sha256=H)}, directory)
            self.assertEqual(m.hashlib.sha256(source.read_bytes()).hexdigest(), out["x"]["observed_sha256"])

    def test_choice_digest_chronology_and_allowed_candidate(self):
        g = gates()
        record = dict(selection_valid=True, gates_sha256=m.digest(g), chosen_system_or_none="ms_048",
                      parent_acknowledgment="main", timestamp_before_first_heldout_request="2026-11-07T01:30:00Z",
                      all_DEV_gate_values=[dict(system=s, passed=True) for s in ("ms_048", "ms_046")])
        record["record_sha256"] = m.digest(record)
        evidence = dict(first_heldout_event_utc="2026-11-07T02:00:00Z", dev_record_sha256_before_heldout=record["record_sha256"])
        problems = m._selection_problems(record, evidence, g)
        self.assertIn("strict selection requires full frozen DEV source bundle replay", problems)
        evidence["first_heldout_event_utc"] = "2026-11-07T01:00:00Z"
        self.assertTrue(m._selection_problems(record, evidence, g))
        evidence["first_heldout_event_utc"] = "2026-11-07T02:00:00Z"
        record["chosen_system_or_none"] = "ms_040"
        self.assertTrue(m._selection_problems(record, evidence, g))

    def test_DEV_strict_preference_then_none_no_held_selection(self):
        g = gates()
        checks = [dict(system=s, passed=True) for s in ("ms_048", "ms_046")]
        self.assertEqual("ms_048", m.choose_development_candidate(checks, [], g))
        checks[0]["passed"] = False
        self.assertEqual("ms_046", m.choose_development_candidate(checks, [], g))
        self.assertIsNone(m.choose_development_candidate(checks, ["unverified source"], g))
        checks[1]["passed"] = None
        self.assertIsNone(m.choose_development_candidate(checks, [], g))

    def test_DEV_selector_rejects_held_input_not_just_hides_summary(self):
        with self.assertRaisesRegex(ValueError, "ONLY development"):
            m.select_development([query()], [], [], corpora=[])

    def test_receipts_all_repetitions_and_earlier_violation(self):
        key = ("NEW", 1, 60, "q", "ms_050")
        r = run(latency_samples_ms=[2] * 10)
        rows = [dict(seed=1, size=60, query_id="q", system="ms_050", phase="warmup" if i == 0 else "measured",
                     warmup=i == 0, repetition=i, elapsed_ms=2, request_sha256=H, parsed_json_sha256=H,
                     hits=r["hits"], took=1, aggregations={}, total_hits={"value": 1, "relation": "eq"},
                     all_hit_signatures=[dict(path=["hits", "hits"], hits=r["hits"])]) for i in range(11)]
        self.assertEqual([], m.receipt_problems(rows, {key: r}, {key}, gates()))
        rows[2]["authorization_violations"] = ["private child at offset1"]
        self.assertTrue(m.receipt_problems(rows, {key: r}, {key}, gates()))
        rows[2].pop("authorization_violations")
        rows[3]["hits"] = []
        self.assertEqual(2, m.repeat_diagnostics(rows)[0]["ranking_score_variants"])
        rows.pop(4)
        self.assertTrue(m.receipt_problems(rows, {key: r}, {key}, gates()))


class FullInputAndSensitivityTests(unittest.TestCase):
    def tiny(self, u=False):
        qs = [query("p1"), query("p2"), query("p3")]
        corpora = [dict(cohort="OLD", seed=1, size=2, ids=["a", "b"])]
        qrels = [dict(cohort="OLD", seed=1, size=2, query_id=q["id"], dataset_id=d, grade=("U" if u else 3) if d == "b" else 3) for q in qs for d in ("a", "b")]
        runs = [dict(run(q["id"], s), cohort="OLD", size=2) for q in qs for s in ("ms_050", "ms_045")]
        return qs, qrels, runs, corpora

    def test_full_qrels_required_and_boolean_grade_rejected(self):
        qs, qrels, runs, corpora = self.tiny()
        with self.assertRaisesRegex(ValueError, "full explicit"):
            m._prepare(qs, qrels[:-1], runs, corpora)
        qrels[0]["grade"] = False
        with self.assertRaises(ValueError):
            m._prepare(qs, qrels, runs, corpora)

    def test_U_sensitivity_shared_paraphrases_full_IDCG_recall(self):
        qs, qrels, runs, corpora = self.tiny(u=True)
        before = copy.deepcopy(qrels)
        out = m.legacy_sensitivity(qs, qrels, runs, corpora, systems=["ms_050", "ms_045"])[0]
        self.assertEqual(4, out["scenario_count"])
        self.assertEqual(before, qrels)
        for scenario in out["scenarios"]:
            assumed = scenario["assignments"][0]["grade"]
            row = scenario["per_query"][0]
            self.assertEqual(m.core.ndcg_at_k(["a"], {"a": 3, "b": assumed}), row["ndcg_at_10"])
            self.assertEqual(.5 if assumed >= 2 else 1, row["recall_at_10_ge_2"])
            self.assertEqual(1, len({r["recall_at_10_ge_2"] for r in scenario["per_query"]}))

    def test_sensitivity_cap_no_guessed_bounds(self):
        qs, qrels, runs, corpora = self.tiny(u=True)
        out = m.legacy_sensitivity(qs, qrels, runs, corpora, systems=["ms_050", "ms_045"], max_scenarios=3)[0]
        self.assertEqual("not_enumerated", out["status"])
        self.assertEqual([], out["scenarios"])

    def test_build_report_missing_evidence_D_no_outcome_claim(self):
        g = gates()
        g["seeds"], g["catalog_sizes"] = [1], [60]
        g["shared_safe_useful_gate"]["utility_gain_catalog_sizes"] = []
        qs = [query(), query("u", "u", "negative_unrelated"), query("o", "o", "negative_or_lookalike")]
        ids = ["a"] + ["zero" + str(i) for i in range(59)]
        corpora = [dict(seed=1, size=60, ids=ids)]
        qr = [dict(seed=1, size=60, query_id=q["id"], dataset_id=d,
                   grade=3 if d == "a" and q["kind"] == "semantic" else 0) for q in qs for d in ids]
        report = m.build_report(qs, qr, [], corpora=corpora, gates=g)
        self.assertEqual("D", report["decision"]["recommendation"])
        self.assertIn("incomplete primary/topk run grid", report["decision"]["problems"])
        self.assertTrue(report["per_query"])
        self.assertIsNone(report["per_query"][0]["ndcg_at_10"])

    def test_new_ambiguity_U_deliberate_not_primary_failure(self):
        qs = [query(kind="ambiguous_ungraded", split="diagnostic")]
        corpora = [dict(seed=1, size=1, ids=["a"])]
        qr = [dict(seed=1, size=1, query_id="q", dataset_id="a", grade="U")]
        qm, _, grades, _ = m._prepare(qs, qr, [], corpora)
        self.assertEqual("U", grades["NEW", 1, 1, "q"]["a"])
        qr[0]["grade"] = 0
        with self.assertRaisesRegex(ValueError, "ambiguity"):
            m._prepare(qs, qr, [], corpora)


class IndependentReviewRegressions(unittest.TestCase):
    def test_topk_conversion_explicit_audited_and_collision_rejected(self):
        raw = [run(system="topk10diag")]
        with self.assertRaises(ValueError):
            m.normalize_run_labels(raw)
        converted, audit = m.normalize_run_labels(raw, {"topk10diag": "topk10"})
        self.assertEqual("topk10", converted[0]["system"])
        self.assertEqual("topk10diag", raw[0]["system"])
        self.assertEqual(m.digest(raw), audit["raw_payload_sha256"])
        self.assertNotEqual(audit["raw_payload_sha256"], audit["canonical_payload_sha256"])
        with self.assertRaises(ValueError):
            m.normalize_run_labels(raw + [run(system="topk10")], {"topk10diag": "topk10"})
        with self.assertRaises(ValueError):
            m.normalize_run_labels(raw, {"ms_040": "ms_045"})

    def test_DEV_exact_omission_and_forged_query_bytes_rejected(self):
        frozen = m.core.read_jsonl(m.HERE / "query-spec.jsonl")
        dev = {q["id"]: dict(q) for q in frozen if q["split"] == "development"}
        missing_exact = {qid: q for qid, q in dev.items() if q["kind"] != "exact"}
        problems = m._inventory(missing_exact, {}, m.default_gates(), development=True)
        self.assertIn("DEV inventory must be13 queries including3 critical exact", problems)
        dev["t01p1"]["query"] = "forged semantic need"
        self.assertIn("query differs from frozen specification:t01p1", m._inventory(dev, {}, m.default_gates(), development=True))

    def test_missing_known_child_cannot_be_full_native_geometry(self):
        score = native(child=None)
        expected = inventory([native()])
        grades = {("NEW", 1, 60, "q"): {"a": 3}}
        self.assertTrue(m.native_inventory_problems(m._native_index([score]), expected, grades))
        self.assertEqual([], m.native_inventory_problems(m._native_index([native()]), expected, grades))
        bad = native()
        bad["children"][0].pop("dimension")
        self.assertTrue(m.native_inventory_problems(m._native_index([bad]), expected, grades))

    def test_caller_passed_hashes_not_actual_source_proof(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            source = Path(directory) / "tiny.json"
            source.write_text("[1]")
            sha = m.hashlib.sha256(source.read_bytes()).hexdigest()
            spec = dict(path=str(source.resolve()), sha256=sha, format="json")
            self.assertEqual([1], m.load_argument_source(spec))
            ev = dict(input_sha256={"qrels": m.digest([2])}, argument_files={"qrels": spec})
            self.assertIn("argument differs from actual source payload:qrels", m.payload_problems(ev, qrels=[2]))
            with self.assertRaises(ValueError):
                m.load_analysis_payload(dict(qrels=[2], evidence=ev), directory)
            source.write_text("[2]")
            with self.assertRaises(ValueError):
                m.load_argument_source(spec)

    def test_forged_rehashed_selection_needs_actual_DEV_source_replay(self):
        record = dict(selection_valid=True, gates_sha256=m.digest(gates()), chosen_system_or_none="ms_048",
                      parent_acknowledgment="main", timestamp_before_first_heldout_request="2026-11-07T01:00:00Z",
                      all_DEV_gate_values=[dict(system=s, passed=True) for s in ("ms_048", "ms_046")])
        record["record_sha256"] = m.digest(record)
        ev = dict(first_heldout_event_utc="2026-11-07T02:00:00Z", dev_record_sha256_before_heldout=record["record_sha256"])
        problems = m._selection_problems(record, ev, gates())
        self.assertIn("strict selection requires full frozen DEV source bundle replay", problems)
        bundle = dict(queries=[query()], qrels=[], runs=[], corpora=[])
        problems = m._selection_problems(record, ev, gates(), bundle)
        self.assertTrue(any("DEV source replay rejected" in p for p in problems))

    def test_scoped_plausible_domains_and_known_paraphrases_unchanged(self):
        qs = [query("p1"), query("p2"), query("p3")]
        corpora = [dict(cohort="OLD", seed=1, size=2, ids=["a", "b"])]
        qr = [dict(cohort="OLD", seed=1, size=2, query_id=q["id"], dataset_id=d,
                   grade="U" if q["id"] == "p3" and d == "b" else 3) for q in qs for d in ("a", "b")]
        runs = [dict(run(q["id"], s), cohort="OLD", size=2) for q in qs for s in ("ms_050", "ms_045")]
        out = m.legacy_sensitivity(qs, qr, runs, corpora, systems=["ms_050", "ms_045"],
            uncertainty_domains=[dict(seed=1, query_id="p3", dataset_id="b", allowed_grades=[2, 3])])[0]
        self.assertEqual(2, out["scenario_count"])
        self.assertEqual([[2, 3]], out["allowed_grades"])
        for scenario in out["scenarios"]:
            row = next(r for r in scenario["per_query"] if r["query_id"] == "p1")
            self.assertEqual(.5, row["recall_at_10_ge_2"])
            self.assertEqual(m.core.ndcg_at_k(["a"], {"a": 3, "b": 3}), row["ndcg_at_10"])

    def test_truthful_failed_policy_and_nonpromotional_NONE_record(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            directory = Path(directory).resolve()
            def source(name, value):
                path = directory / (name + ".json")
                path.write_text(m.json.dumps(value, sort_keys=True))
                sha = m.hashlib.sha256(path.read_bytes()).hexdigest()
                return dict(path=str(path), expected_sha256=sha, observed_sha256=sha), dict(path=str(path), sha256=sha, format="json")
            validation, _ = source("validation", {"status": "original_failed", "actual_reviews": 1})
            mask = [dict(seed=1, query_id="q", dataset_id="a", allowed_grades=[2, 3])]
            mask_binding, mask_source = source("mask", mask)
            arch, _ = source("architecture", {"tiny": "registered test only"})
            policy = dict(schema_version=1, status="original_failed", original_conformance_passed=False,
                          promotion_allowed=False, forced_recommendation="D", created_utc="2026-11-07T01:00:00Z",
                          uncertainty_pairs=mask, uncertainty_mask_sha256=m.digest(mask),
                          validation_manifest_sha256=validation["expected_sha256"], architecture_sha256=arch["expected_sha256"])
            pb, ps = source("policy", policy)
            ev = dict(bindings=dict(diagnostic_policy=pb, uncertainty_mask=mask_binding, validation=validation, architecture=arch),
                      input_sha256=dict(diagnostic_policy=m.digest(policy), uncertainty_pairs=m.digest(mask)),
                      argument_files=dict(diagnostic_policy=ps, uncertainty_pairs=mask_source),
                      supplementary_validation_passed=False, first_target_embedding_utc="2026-11-07T02:00:00Z",
                      diagnostic_policy_sha256_before_embedding=m.digest(policy))
            grades = {("NEW", 1, 60, "q"): {"a": "U"}}
            self.assertEqual([], m.diagnostic_policy_problems(policy, ev, grades, {"q": query()}))
            ev["supplementary_validation_passed"] = True
            self.assertTrue(m.diagnostic_policy_problems(policy, ev, grades, {"q": query()}))
            ev["supplementary_validation_passed"] = False
            selection = m.nonpromotional_no_selection(policy, timestamp_utc="2026-11-07T02:30:00Z", parent_acknowledgment="main")
            sb, ss = source("selection", selection)
            ev["bindings"]["selection"] = sb
            ev["argument_files"]["selection"] = ss
            ev["input_sha256"]["selection"] = m.digest(selection)
            ev["first_heldout_event_utc"] = "2026-11-07T03:00:00Z"
            ev["dev_record_sha256_before_heldout"] = selection["record_sha256"]
            self.assertEqual([], m._selection_problems(selection, ev, m.default_gates(), diagnostic_policy=policy))
            self.assertFalse(selection["promotion_allowed"])
            self.assertEqual("D", selection["forced_recommendation"])


if __name__ == "__main__":
    unittest.main()
