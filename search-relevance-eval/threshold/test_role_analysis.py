"""Tiny role-metric mocks only; no actual retrieval or scores."""
import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("tested_threshold_roles", Path(__file__).with_name("role_analysis.py"))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
H = "a" * 64


def payload():
    gates = r.a.default_gates()
    gates["seeds"], gates["catalog_sizes"] = [1], [60]
    gates["shared_safe_useful_gate"]["utility_gain_catalog_sizes"] = []
    qs = [dict(id=iid + "p" + str(p), intent_id=iid, kind="semantic", split="heldout")
          for iid in ("t03", "t04", "t05", "t06", "t07", "t08") for p in (1, 2, 3)]
    ids = ["positive", "negative"] + ["z" + str(i) for i in range(58)]
    qrels = [dict(seed=1, size=60, query_id=q["id"], dataset_id=did,
                   grade="U" if q["id"] == "t03p3" and did == "positive" else 3 if did == "positive" else 0)
             for q in qs for did in ids]
    runs, receipts = [], []
    systems = ("ms_050", "ms_045", "diag_dataset045_nested050", "diag_dataset050_nested045")
    for q in qs:
        for system in systems:
            did = "positive" if system in ("ms_045", "diag_dataset045_nested050") else "negative"
            hits = [dict(id=did, rank=1, score=1)]
            runs.append(dict(seed=1, size=60, system=system, query_id=q["id"], hits=hits,
                             warmup=False, latency_scope="local_warmed", latency_samples_ms=[1] * 10))
            for rep in range(11):
                receipts.append(dict(seed=1, size=60, system=system, query_id=q["id"], hits=hits,
                    warmup=rep == 0, phase="warmup" if rep == 0 else "measured", repetition=rep,
                    elapsed_ms=1, request_sha256=H, parsed_json_sha256=H,
                    aggregations={}, total_hits={"value": 1, "relation": "eq"},
                    all_hit_signatures=[dict(path=["hits", "hits"], hits=hits)]))
    return dict(queries=qs, qrels=qrels, runs=runs, receipts=receipts,
                corpora=[dict(seed=1, size=60, ids=ids)], gates=gates,
                diagnostic_policy=dict(status="original_failed", promotion_allowed=False, forced_recommendation="D",
                    uncertainty_pairs=[dict(seed=1, query_id="t03p3", dataset_id="positive", allowed_grades=[2, 3])]))


class RoleReportTests(unittest.TestCase):
    def test_sensitivity_retains_exact_identity_fields_from_intent_merge(self):
        data = payload()
        data['queries'].append(dict(id='exact', intent_id='exact_intent', kind='exact', split='development'))
        data['intents'] = [dict(intent_id='exact_intent', authoritative_target_ids=['positive'], near_identifier_ids=['negative'])]
        for qrel in [q for q in data['qrels'] if q['query_id']=='t04p1']:
            data['qrels'].append(dict(qrel, query_id='exact'))
        for row in [v for v in data['runs'] if v['query_id']=='t04p1']:
            data['runs'].append(dict(row, query_id='exact'))
        for row in [v for v in data['receipts'] if v['query_id']=='t04p1']:
            data['receipts'].append(dict(row, query_id='exact'))
        report = r.build_role_report(data)
        exact = [q for q in report['per_query'] if q['query_id']=='exact']
        self.assertEqual(4, len(exact))
        self.assertTrue(all('positive' in q['authoritative_target_ranks'] for q in exact))
        self.assertEqual(2, report['uncertainty_sensitivity'][0]['scenario_count'])

    def test_four_fixed_pairs_reuse_and_measured_role_difference(self):
        out = r.build_role_report(payload())
        self.assertEqual(4, len(out["registered_role_pairs"]))
        self.assertEqual(["ms_050", "ms_045"], out["matched_reuse"])
        q = [row for row in out["per_query"] if row["query_id"] == "t04p1"]
        by_system = {row["system"]: row for row in q}
        self.assertEqual(1, by_system["diag_dataset045_nested050"]["recall_at_10_ge_2"])
        self.assertEqual(0, by_system["diag_dataset050_nested045"]["recall_at_10_ge_2"])
        self.assertEqual(180, next(row for row in out["latency"] if row["group"] == "heldout_semantic")["n"])
        self.assertIn("not measured", out["mixed_full_engine_eligibility"])
        self.assertFalse(out["promotion_allowed"])
        self.assertEqual("D", out["forced_recommendation"])
        self.assertNotIn("best_pair", out)
        self.assertNotIn("recommendation", out)

    def test_U_full_population_null_common_four_and_sensitivity_preserved(self):
        data = payload()
        before = copy.deepcopy(data["qrels"])
        out = r.build_role_report(data)
        affected = [row for row in out["per_query"] if row["query_id"] == "t03p3"]
        self.assertTrue(all(row["recall_at_10_ge_2"] is None for row in affected))
        self.assertTrue(all(f["ndcg_at_10"] is None for f in out["per_family"] if f["intent_id"] == "t03"))
        self.assertTrue(all(row["complete"] for row in out["common_four_descriptive"]))
        self.assertEqual(2, out["uncertainty_sensitivity"][0]["scenario_count"])
        self.assertEqual(before, data["qrels"])

    def test_exact_evidence_child_not_unrelated_max_and_missing_no_fallback(self):
        data = payload()
        data["fixed_pairs"] = [dict(query_id="t04p1", record_id="positive", evidence_bearing_scope="nested")]
        data["branch_evidence"] = [dict(seed=1, query_id="t04p1", dataset_id="positive", branch="nested",
            source_scope="nested.0", supports_dataset_grade=True, evidence_refs=["C:literalquote"])]
        children = [dict(distribution_id="measured", offset=0, score=.47, allowed=True),
                    dict(distribution_id="generic", offset=1, score=.8, allowed=True)]
        data["native_scores"] = [dict(seed=1, size=60, query_id="t04p1", dataset_id="positive", root_score=.7,
            children=children, max_child_score=.8, root_projection_sha256=H, query_vector_sha256=H, source="engine_exact_docvalues_l2")]
        qm = {q["id"]: q for q in data["queries"]}
        grades = {("NEW", row["seed"], row["size"], row["query_id"]): {} for row in data["qrels"]}
        for row in data["qrels"]:
            grades["NEW", row["seed"], row["size"], row["query_id"]][row["dataset_id"]] = row["grade"]
        out = r.evidence_scope_opportunity(data, qm, grades)
        row = out["per_pair"][0]
        self.assertEqual(.47, row["certified_scope_score"])
        self.assertEqual(.8, row["native_max_child_score"])
        self.assertTrue(row["scope_in_narrow"])
        self.assertFalse(row["max_scope_proxy_in_narrow"])
        self.assertEqual(1, out["per_seed"][0]["proxy_vs_scoped_narrow_disagreements"])
        data["branch_evidence"][0]["source_scope"] = "nested.2"
        out = r.evidence_scope_opportunity(data, qm, grades)
        self.assertIsNone(out["per_pair"][0]["certified_scope_score"])
        self.assertIn("no alternative", out["per_pair"][0]["unavailable_reason"])
        data["branch_evidence"][0]["source_scope"] = "nested.0"
        grades["NEW", 1, 60, "t04p1"]["positive"] = "U"
        out = r.evidence_scope_opportunity(data, qm, grades)
        self.assertEqual(1, len(out["per_pair"]))
        self.assertEqual("U", out["per_pair"][0]["dataset_grade"])
        self.assertIsNone(out["per_pair"][0]["scope_in_narrow"])

    def test_missing_role_and_receipt_visible_unregistered_pair_rejected(self):
        data = payload()
        data["runs"] = [row for row in data["runs"] if row["system"] != "diag_dataset050_nested045"]
        out = r.build_role_report(data)
        self.assertIn("Incomplete four-role run grid", out["completeness_problems"])
        data["runs"].append(dict(data["runs"][0], system="posthoc_pair"))
        with self.assertRaises(ValueError):
            r.build_role_report(data)


if __name__ == "__main__":
    unittest.main()
