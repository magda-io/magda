"""Synthetic-only tests: no catalog, production ranking or network access.

Run: python3 -m unittest discover -s search-relevance-eval -p 'test_evaluate.py' -v
"""

import copy
import csv
import importlib.util
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


MODULE_PATH = Path(__file__).with_name("evaluate.py")
SPEC = importlib.util.spec_from_file_location("search_relevance_evaluate", MODULE_PATH)
evaluate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(evaluate)


def query(query_id="q1", category="discovery"):
    return {"id": query_id, "category": category, "split": "test",
            "query": "Find synthetic water measurements", "intent": "Compare measurements",
            "success_criteria": "A documented measurement table"}


def hit(dataset_id, rank, title=None):
    return {"id": dataset_id, "rank": rank, "score": 1 / rank,
            "metadata": {"title": title or "Synthetic " + dataset_id,
                         "description": "Invented measurement observations",
                         "publisher": {"name": "Synthetic Institute", "id": "publisher-secret"},
                         "distributions": [{"title": "Table", "format": "CSV",
                                            "downloadURL": "https://invalid.test/" + dataset_id + "/data.csv",
                                            "id": "distribution-secret"}]}}


def run(system, ids, query_id="q1", **extra):
    return {"system": system, "query_id": query_id,
            "hits": [hit(dataset_id, rank) for rank, dataset_id in enumerate(ids, 1)], **extra}


def judgments(mapping, grades, judge="assessor-A"):
    return [{"pair_id": item["pair_id"], "grade": grades[item["dataset_id"]],
             "evidence": "Synthetic evidence for " + item["dataset_id"],
             "judge": {"id": judge, "recorded_at": "2026-01-01T00:00:00Z"}}
            for item in mapping if item["dataset_id"] in grades]


class PoolTests(unittest.TestCase):
    def setUp(self):
        self.queries = [query()]
        self.runs = [run("baseline", ["dataset-a", "dataset-b"]),
                     run("candidate", ["dataset-b", "dataset-c"])]

    def test_pool_deduplicates_pairs_and_retains_private_provenance(self):
        packets, mapping = evaluate.build_pool(self.queries, self.runs)
        self.assertEqual(len(packets), 3)
        self.assertEqual({item["dataset_id"] for item in mapping}, {"dataset-a", "dataset-b", "dataset-c"})
        overlap = next(item for item in mapping if item["dataset_id"] == "dataset-b")
        self.assertEqual({source["system"] for source in overlap["source_provenance"]}, {"baseline", "candidate"})
        self.assertEqual([item["pair_id"] for item in packets], [item["pair_id"] for item in mapping])
        self.assertEqual([item["pool_order"] for item in mapping], [1, 2, 3])

    def test_public_packets_have_no_identifiers_or_origins(self):
        self.queries[0]["expected_answers"] = ["not-retrieved-secret"]
        self.queries[0]["success_criteria"] += " including dataset-a and not-retrieved-secret"
        self.runs[0]["hits"][0]["metadata"].update({
            "system": "baseline", "rank": 1, "score": 9, "id": "private-id",
            "expected_answers": ["private-answer"], "origin": "private-origin"})
        packets, _ = evaluate.build_pool(self.queries, self.runs)
        serialized = json.dumps(packets)
        for secret in ("dataset-a", "dataset-b", "dataset-c", "baseline", "candidate",
                       "publisher-secret", "distribution-secret", "private-id", "private-answer",
                       "private-origin", "not-retrieved-secret", '"query_id"', '"rank"', '"score"', '"system"'):
            self.assertNotIn(secret, serialized)
        for packet in packets:
            self.assertEqual(set(packet), {"pair_id", "task", "document"})
            self.assertEqual(set(packet["task"]), set(evaluate.TASK_FIELDS))
            self.assertIn("title", packet["document"])
            self.assertIn("publisher", packet["document"])
            self.assertIn("distributions", packet["document"])
            self.assertTrue(packet["pair_id"].startswith("p_"))
            self.assertEqual(len(packet["pair_id"]), 34)

    def test_structured_task_criteria_preserve_all_semantic_requirements(self):
        criteria = {
            "hard_requirements": ["Observed measurements", {"minimum_rows": 12}],
            "geography": {"area": "Invented Basin", "resolution": "catchment"},
            "time": {"from": "2018-01-01", "to": "2022-12-31", "frequency": "monthly"},
            "variables": [{"variable": "water level", "units": "m"}],
            "granularity": {"spatial_level": "station", "temporal_level": "day"},
            "format_access": {"required": ["CSV"], "availability": {"open": True}},
            "preferences": ["Documented units", "Downloadable table"],
            "reject": {"conditions": ["A press release without observations"]},
            "U_criteria": {"when": "Time coverage or variables absent from packet"},
            "U": "Explain which evidence is missing",
        }
        self.queries[0]["success_criteria"] = criteria
        self.queries[0]["intent"] = {"action": "Compare", "details": {"purpose": "Trend analysis"}}
        packets, _ = evaluate.build_pool(self.queries, self.runs)
        for packet in packets:
            self.assertEqual(packet["task"]["success_criteria"], criteria)
            self.assertEqual(packet["task"]["intent"], self.queries[0]["intent"])
        self.assertEqual(self.queries[0]["success_criteria"], criteria)

    def test_spatial_and_temporal_structured_evidence_is_preserved(self):
        spatial = {
            "text": "Invented Basin, synthetic coordinates",
            "boundingBox": {"westBoundLongitude": 140.0, "eastBoundLongitude": 141.0,
                            "southBoundLatitude": -36.0, "northBoundLatitude": -35.0},
            "geoJson": {"type": "Polygon", "coordinates": [[[140, -36], [141, -36], [140, -36]]]},
            "bbox": [140.0, -36.0, 141.0, -35.0],
        }
        temporal = {"start": {"date": "2018-01-01", "text": "January 2018"},
                    "end": {"date": "2022-12-31", "text": "December 2022"},
                    "text": "Monthly observations"}
        runs = [run("synthetic-system", ["dataset-a"])]
        runs[0]["hits"][0]["metadata"].update(spatial=spatial, temporal=temporal)
        packets, _ = evaluate.build_pool(self.queries, runs)
        self.assertEqual(packets[0]["document"]["spatial"], spatial)
        self.assertEqual(packets[0]["document"]["temporal"], temporal)

    def test_nested_private_keys_removed_from_task_and_document_at_every_depth(self):
        private = {"system": "secret-origin", "rank": 7, "score": 123.5,
                   "expected_answers": ["secret-answer"], "expectedDatasetIds": ["secret-target"],
                   "dataset_id": "secret-dataset", "queryId": "secret-query",
                   "sourceProvenance": "secret-provenance"}
        self.queries[0]["success_criteria"] = {
            "hard_requirements": [{"description": "Measurements", **private}],
            "geography": {"region": {"text": "Invented Basin", **private}},
            **private,
        }
        runs = [run("synthetic-system", ["dataset-a"])]
        runs[0]["hits"][0]["metadata"].update({
            "spatial": {"text": "Invented Basin", "boundingBox": {"west": 140, **private}, **private},
            "temporal": {"start": {"date": "2018-01-01", **private}, **private},
            "distributions": [{"title": "Observations", "description": {"text": "CSV", **private}, **private}],
            **private,
        })
        packets, _ = evaluate.build_pool(self.queries, runs)
        task = packets[0]["task"]["success_criteria"]
        self.assertEqual(task, {"hard_requirements": [{"description": "Measurements"}],
                                "geography": {"region": {"text": "Invented Basin"}}})
        document = packets[0]["document"]
        self.assertEqual(document["spatial"], {"text": "Invented Basin", "boundingBox": {"west": 140}})
        self.assertEqual(document["temporal"], {"start": {"date": "2018-01-01"}})
        self.assertEqual(document["distributions"], [{"title": "Observations", "description": {"text": "CSV"}}])
        serialized = json.dumps(packets)
        for value in ("secret-origin", "secret-answer", "secret-target", "secret-dataset", "secret-query", "secret-provenance"):
            self.assertNotIn(value, serialized)

    def test_unretrieved_unmarked_magda_ids_and_uuid_components_are_redacted(self):
        dataset_uuid = "12345678-1234-4321-9876-123456789abc"
        distribution_uuid = "abcdef12-3456-4321-9876-abcdef123456"
        unknown_dataset_id = "ds-" + dataset_uuid
        unknown_distribution_id = "dist-" + distribution_uuid
        self.queries[0]["id"] = "q-private-42"
        self.queries[0]["query"] = "Find " + unknown_dataset_id + " using " + dataset_uuid + " for q-private-42"
        self.queries[0]["intent"] = "Inspect https://invalid.test/" + unknown_distribution_id + "/table.csv"
        self.queries[0]["success_criteria"] = {
            "hard_requirements": ["Coverage near " + distribution_uuid.upper()],
            "geography": {"text": "Invented Basin"},
        }
        runs = [run("synthetic-system", ["dataset-a"], query_id="q-private-42")]
        runs[0]["hits"][0]["metadata"]["description"] = "A record linked to " + unknown_distribution_id
        packets, mapping = evaluate.build_pool(self.queries, runs)
        serialized = json.dumps(packets)
        for value in (unknown_dataset_id, unknown_distribution_id, dataset_uuid, distribution_uuid.upper(), "q-private-42"):
            self.assertNotIn(value, serialized)
        self.assertIn("[identifier redacted]", serialized)
        self.assertEqual(packets[0]["task"]["success_criteria"]["geography"], {"text": "Invented Basin"})
        self.assertEqual(mapping[0]["query_id"], "q-private-42")
        self.assertIn(unknown_dataset_id, self.queries[0]["query"])
        self.assertIn(unknown_distribution_id, mapping[0]["source_provenance"][0]["hit"]["metadata"]["description"])

    def test_full_structured_criteria_and_description_are_not_truncated(self):
        full_text = "Synthetic observation evidence αβγ " * 1000
        self.queries[0]["success_criteria"] = {"hard_requirements": [{"details": full_text}]}
        runs = [run("synthetic-system", ["dataset-a"])]
        runs[0]["hits"][0]["metadata"]["description"] = full_text
        packets, _ = evaluate.build_pool(self.queries, runs)
        self.assertEqual(packets[0]["task"]["success_criteria"]["hard_requirements"][0]["details"], full_text)
        self.assertEqual(packets[0]["document"]["description"], full_text)

    def test_seed_and_input_order_are_reproducible(self):
        original = copy.deepcopy((self.queries, self.runs))
        first = evaluate.build_pool(self.queries, self.runs, seed=7)
        reversed_runs = copy.deepcopy(list(reversed(self.runs)))
        for record in reversed_runs:
            record["hits"].reverse()
        second = evaluate.build_pool(list(reversed(self.queries)), reversed_runs, seed=7)
        self.assertEqual(first, second)
        self.assertNotEqual(first[0], evaluate.build_pool(self.queries, self.runs, seed=8)[0])
        self.assertEqual((self.queries, self.runs), original)

    def test_metadata_conflicts_resolve_independent_of_origin(self):
        self.runs[0]["hits"][1]["metadata"]["title"] = "Z alternative"
        self.runs[1]["hits"][0]["metadata"]["title"] = "A alternative"
        packets, mapping = evaluate.build_pool(self.queries, self.runs)
        pair = next(item for item in mapping if item["dataset_id"] == "dataset-b")
        packet = next(item for item in packets if item["pair_id"] == pair["pair_id"])
        self.assertIn(packet["document"]["title"], {"A alternative", "Z alternative"})
        self.assertEqual(len(pair["source_provenance"]), 2)
        self.assertEqual((packets, mapping), evaluate.build_pool(self.queries, list(reversed(self.runs))))

    def test_same_document_has_different_pair_but_stable_document_id(self):
        queries = [query("q1"), query("q2")]
        packets, mapping = evaluate.build_pool(queries, [run("s", ["dataset-a"], q["id"]) for q in queries])
        self.assertNotEqual(packets[0]["pair_id"], packets[1]["pair_id"])
        self.assertEqual(packets[0]["document"]["document_id"], packets[1]["document"]["document_id"])
        self.assertEqual(len(mapping), 2)

    def test_depth_uses_explicit_rank_and_redacts_out_of_pool_ids(self):
        self.queries[0]["intent"] += " dataset-c"
        self.runs[1]["hits"][1]["rank"] = 20
        packets, mapping = evaluate.build_pool(self.queries, self.runs, depth=1)
        self.assertEqual({item["dataset_id"] for item in mapping}, {"dataset-a", "dataset-b"})
        self.assertNotIn("dataset-c", json.dumps(packets))

    def test_omitted_ranks_follow_input_order(self):
        runs = [run("s", ["dataset-a", "dataset-b"])]
        for item in runs[0]["hits"]:
            del item["rank"]
        _, mapping = evaluate.build_pool(self.queries, runs, depth=1)
        self.assertEqual(mapping[0]["dataset_id"], "dataset-a")
        self.assertEqual(mapping[0]["source_provenance"][0]["rank"], 1)

    def test_rejects_invalid_queries_runs_ranks_and_depth(self):
        cases = [([query(), query()], self.runs, 10),
                 (self.queries, [run("s", ["dataset-a"], "unknown")], 10),
                 (self.queries, [run("s", ["dataset-a"]), run("s", ["dataset-b"])], 10),
                 (self.queries, [run("s", ["dataset-a", "dataset-a"])], 10),
                 (self.queries, self.runs, 0)]
        for queries, runs, depth in cases:
            with self.subTest(queries=queries, runs=runs, depth=depth), self.assertRaises(ValueError):
                evaluate.build_pool(queries, runs, depth=depth)
        for bad_rank in (-1, 0, 1.2, True):
            runs = copy.deepcopy(self.runs)
            runs[0]["hits"][0]["rank"] = bad_rank
            with self.subTest(rank=bad_rank), self.assertRaises(ValueError):
                evaluate.build_pool(self.queries, runs)
        self.runs[0]["hits"][1]["rank"] = 1
        with self.assertRaises(ValueError):
            evaluate.build_pool(self.queries, self.runs)


class MetricTests(unittest.TestCase):
    def setUp(self):
        self.queries = [query()]
        self.runs = [run("baseline", ["dataset-b", "dataset-a", "dataset-c", "dataset-d"], latency_ms=20, warmup=False),
                     run("candidate", ["dataset-a", "dataset-b", "dataset-d", "dataset-c"], latency_ms=10)]
        _, self.mapping = evaluate.build_pool(self.queries, self.runs)
        self.a = judgments(self.mapping, {"dataset-a": 3, "dataset-b": 1, "dataset-c": "U"})
        self.b = judgments(self.mapping, {"dataset-a": 3, "dataset-b": 2, "dataset-c": "U"}, "assessor-B")

    def report(self, **kwargs):
        return evaluate.evaluate(self.queries, self.runs, self.mapping, self.a, self.b, **kwargs)

    def row(self, report, system="baseline", view="judge_a", query_id="q1"):
        return next(row for row in report["per_query"] if row["system"] == system and row["view"] == view and row["query_id"] == query_id)

    def test_ndcg_matches_hand_calculation(self):
        denominator = 7 + 1 / math.log2(3)
        expected = (1 + 7 / math.log2(3)) / denominator
        report = self.report()
        self.assertAlmostEqual(self.row(report)["ndcg_at_10"], expected)
        self.assertEqual(self.row(report, "candidate")["ndcg_at_10"], 1.0)
        self.assertIsNone(evaluate.ndcg_at_k(["a"], {"a": 0}))
        self.assertIsNone(evaluate.ndcg_at_k(["a"], {"a": 0}, condensed=True))
        self.assertIsNone(evaluate.ndcg_at_k(["a"], {}))

    def test_idcg_includes_relevant_pool_documents_missing_from_run(self):
        self.assertLess(evaluate.ndcg_at_k(["a"], {"a": 1, "b": 3}), 1)
        self.assertEqual(evaluate.ndcg_at_k([], {"a": 3}), 0)

    def test_condensed_ndcg_drops_unjudged_documents(self):
        self.assertEqual(evaluate.ndcg_at_k(["unknown", "u", "a"], {"a": 3, "u": "U"}, condensed=True), 1)
        self.assertEqual(evaluate.ndcg_at_k(["unknown", "u", "a"], {"a": 3, "u": "U"}), .5)
        self.assertAlmostEqual(evaluate.ndcg_at_k(["a"], {"a": 3}, ranks=[10]), 1 / math.log2(11))
        self.assertEqual(evaluate.ndcg_at_k(["a"], {"a": 3}, ranks=[11]), 0)
        grades = {str(i): 3 if i == 10 else 0 for i in range(11)}
        self.assertEqual(evaluate.ndcg_at_k([str(i) for i in range(11)], grades), 0)

    def test_coverage_distinguishes_missing_from_u(self):
        report = self.report()
        row = self.row(report)
        self.assertEqual((row["retrieved_at_10"], row["judged_at_10"], row["u_at_10"], row["unjudged_at_10"]), (4, 2, 1, 1))
        self.assertEqual(row["judged_fraction_at_10"], .5)
        pool = next(item for item in report["pool_coverage"] if item["view"] == "judge_a")
        self.assertEqual((pool["pooled"], pool["judged"], pool["u"], pool["unjudged"]), (4, 2, 1, 1))

    def test_consensus_never_fabricates_disagreement_resolution(self):
        report = self.report()
        row = self.row(report, view="consensus")
        self.assertEqual(row["judged_at_10"], 1)
        self.assertEqual(row["u_at_10"], 3)
        self.assertEqual(row["ndcg_at_10"], 1 / math.log2(3))
        self.assertEqual(row["condensed_ndcg_at_10"], 1)
        reasons = {item["reason"] for item in report["unresolved_pairs"]}
        self.assertEqual(reasons, {"missing_judgment", "unassessable", "disagreement"})
        self.assertTrue(all(item["consensus"] == "U" for item in report["unresolved_pairs"]))
        self.assertNotEqual(self.row(report)["ndcg_at_10"], self.row(report, view="judge_b")["ndcg_at_10"])

    def test_known_answers_are_separate_from_judgments(self):
        report = self.report(anchors=[{"query_id": "q1", "dataset_ids": ["dataset-c"]}])
        row = self.row(report)
        self.assertAlmostEqual(row["mrr_at_10"], 1 / 3)
        self.assertEqual(row["success_at_5"], 1)
        self.assertIsNone(self.row(self.report())["mrr_at_10"])
        self.assertEqual(report["known_answers"]["overall"][0]["n_anchor_queries"], 1)
        self.assertEqual(self.row(report, view="consensus")["mrr_at_10"], row["mrr_at_10"])
        unrelated = self.report(anchors=[{"query_id": "q1", "dataset_ids": ["absent-anchor"]}])
        self.assertEqual(self.row(unrelated)["mrr_at_10"], 0)
        self.assertEqual(self.row(unrelated)["success_at_5"], 0)

    def test_objective_metrics_and_coverage_honor_sparse_original_ranks(self):
        self.runs[0]["hits"][1]["rank"] = 10
        self.runs[0]["hits"][2]["rank"] = 11
        self.runs[0]["hits"][3]["rank"] = 12
        report = self.report(anchors=[{"query_id": "q1", "dataset_ids": ["dataset-a"]}])
        row = self.row(report)
        self.assertEqual(row["mrr_at_10"], .1)
        self.assertEqual(row["success_at_5"], 0)
        self.assertEqual(row["retrieved_at_10"], 2)

    def test_no_judgments_is_not_a_zero_score(self):
        report = evaluate.evaluate(self.queries, self.runs, self.mapping, [], [])
        self.assertTrue(all(row["ndcg_at_10"] is None for row in report["per_query"]))
        self.assertTrue(all(row["n_ndcg_queries"] == 0 for row in report["overall"]))
        self.assertTrue(all(row["judged_at_10"] == 0 for row in report["per_query"]))

    def test_zero_pooled_idcg_is_undefined_for_all_systems_and_excluded(self):
        self.queries.append(query("q2", "positive-category"))
        self.runs += [run("baseline", ["dataset-a"], "q2"), run("candidate", ["dataset-a"], "q2")]
        _, self.mapping = evaluate.build_pool(self.queries, self.runs)
        self.a = judgments(self.mapping, {"dataset-a": 0, "dataset-b": 0, "dataset-c": "U"})
        self.b = judgments(self.mapping, {"dataset-a": 0, "dataset-b": 0, "dataset-c": "U"}, "assessor-B")
        positive_pairs = {item["pair_id"] for item in self.mapping if item["query_id"] == "q2"}
        for record in self.a + self.b:
            if record["pair_id"] in positive_pairs:
                record["grade"] = 3
        report = self.report(baseline="baseline", candidate="candidate")
        for row in report["per_query"]:
            if row["query_id"] == "q1":
                self.assertTrue(row["zero_idcg"])
                self.assertIsNone(row["ndcg_at_10"])
                self.assertIsNone(row["condensed_ndcg_at_10"])
            else:
                self.assertFalse(row["zero_idcg"])
                self.assertEqual(row["ndcg_at_10"], 1)
        for row in report["overall"]:
            self.assertEqual(row["n_zero_idcg_queries"], 1)
            self.assertEqual(row["n_ndcg_queries"], 1)
            self.assertEqual(row["ndcg_at_10"], 1)
            self.assertEqual(row["condensed_ndcg_at_10"], 1)
        for row in report["by_category"]:
            if row["category"] == "discovery":
                self.assertEqual(row["n_zero_idcg_queries"], 1)
                self.assertEqual(row["n_ndcg_queries"], 0)
                self.assertIsNone(row["ndcg_at_10"])
                self.assertIsNone(row["condensed_ndcg_at_10"])
        for comparison in report["comparison"].values():
            self.assertEqual(comparison["n"], 1)
            self.assertEqual(comparison["per_query_deltas"], [{"query_id": "q2", "delta": 0.0}])
        for coverage in report["pool_coverage"]:
            self.assertEqual(coverage["zero_idcg"], coverage["query_id"] == "q1")

    def test_no_numeric_judgments_is_distinct_from_zero_pooled_idcg(self):
        report = evaluate.evaluate(self.queries, self.runs, self.mapping, [], [])
        self.assertTrue(all(not row["zero_idcg"] for row in report["per_query"]))
        self.assertTrue(all(row["n_zero_idcg_queries"] == 0 for row in report["overall"]))
        self.assertTrue(all(row["n_zero_idcg_queries"] == 0 for row in report["by_category"]))

    def test_empty_run_is_zero_when_query_has_judged_pool(self):
        self.runs[0]["hits"] = []
        row = self.row(self.report())
        self.assertEqual(row["ndcg_at_10"], 0)
        self.assertEqual(row["retrieved_at_10"], 0)
        self.assertIsNone(row["judged_fraction_at_10"])

    def test_missing_run_is_explicit_and_excluded_not_imputed(self):
        self.queries.append(query("q2", "known-answer"))
        self.runs.append(run("candidate", ["dataset-a"], "q2"))
        _, self.mapping = evaluate.build_pool(self.queries, self.runs)
        self.a = judgments(self.mapping, {"dataset-a": 3})
        self.b = judgments(self.mapping, {"dataset-a": 3}, "assessor-B")
        report = self.report()
        missing = self.row(report, query_id="q2")
        self.assertFalse(missing["run_present"])
        self.assertIsNone(missing["ndcg_at_10"])
        summary = next(item for item in report["overall"] if item["system"] == "baseline" and item["view"] == "judge_a")
        self.assertEqual((summary["n_queries"], summary["n_runs"], summary["n_ndcg_queries"]), (2, 1, 1))
        self.assertEqual({item["category"] for item in report["by_category"]}, {"discovery", "known-answer"})

    def test_win_tie_loss_and_small_sample_bootstrap(self):
        comparison = self.report(baseline="baseline", candidate="candidate", bootstrap_samples=100)["comparison"]
        self.assertEqual(comparison["judge_a"]["candidate_wins"], 1)
        self.assertEqual(comparison["consensus"]["candidate_wins"], 1)
        self.assertEqual(comparison["judge_a"]["candidate_losses"], 0)
        self.assertFalse(comparison["judge_a"]["bootstrap"]["performed"])
        self.assertIn("small-n", comparison["judge_a"]["bootstrap"]["reason"])

    def test_win_tie_loss_direction_is_candidate_relative(self):
        self.runs[1]["hits"] = copy.deepcopy(self.runs[0]["hits"])
        comparison = self.report(baseline="baseline", candidate="candidate")["comparison"]
        self.assertEqual(comparison["judge_a"]["ties"], 1)
        self.runs[0]["hits"], self.runs[1]["hits"] = [hit("dataset-a", 1), hit("dataset-b", 2)], [hit("dataset-b", 1), hit("dataset-a", 2)]
        comparison = self.report(baseline="baseline", candidate="candidate")["comparison"]
        self.assertEqual(comparison["judge_a"]["candidate_losses"], 1)

    def test_original_top10_cutoff_does_not_promote_unknowns(self):
        runs = [run("baseline", ["unknown-" + str(i) for i in range(10)] + ["dataset-a"]),
                run("candidate", ["dataset-a"])]
        _, mapping = evaluate.build_pool(self.queries, runs, depth=20)
        a = judgments(mapping, {"dataset-a": 3})
        b = judgments(mapping, {"dataset-a": 3}, "assessor-B")
        report = evaluate.evaluate(self.queries, runs, mapping, a, b)
        row = self.row(report)
        self.assertEqual(row["ndcg_at_10"], 0)
        self.assertEqual(row["condensed_ndcg_at_10"], 1)
        self.assertEqual(row["unjudged_at_10"], 10)

    def test_paired_bootstrap_reproducibility_with_sufficient_queries(self):
        queries = [query("q" + str(i)) for i in range(12)]
        runs = [run(system, ids, q["id"]) for q in queries
                for system, ids in (("baseline", ["dataset-b", "dataset-a"]), ("candidate", ["dataset-a", "dataset-b"]))]
        _, mapping = evaluate.build_pool(queries, runs)
        a = judgments(mapping, {"dataset-a": 3, "dataset-b": 0})
        b = judgments(mapping, {"dataset-a": 3, "dataset-b": 0}, "assessor-B")
        arguments = (queries, runs, mapping, a, b)
        report = evaluate.evaluate(*arguments, baseline="baseline", candidate="candidate", bootstrap_samples=100, seed=17)
        repeated = evaluate.evaluate(*arguments, baseline="baseline", candidate="candidate", bootstrap_samples=100, seed=17)
        self.assertEqual(report["comparison"], repeated["comparison"])
        boot = report["comparison"]["judge_a"]["bootstrap"]
        self.assertTrue(boot["performed"])
        self.assertAlmostEqual(boot["mean_delta_ci"][0], 1 - 1 / math.log2(3))
        self.assertEqual(report["comparison"]["judge_a"]["n"], 12)

    def test_latency_retains_samples_and_separates_warmup_labels(self):
        self.queries += [query("q2"), query("q3")]
        self.runs += [run("baseline", [], "q2", latency_samples_ms=[100, 200], warmup=True),
                      run("baseline", [], "q3", latency_samples_ms=[10, 30], config={"warmup": False})]
        report = self.report()
        timing = report["latency"]["baseline"]
        self.assertEqual(timing["warmup"]["samples_ms"], [100, 200])
        self.assertEqual(timing["non_warmup"]["samples_ms"], [20, 10, 30])
        self.assertEqual(timing["excluding_explicit_warmup"]["median_ms"], 20)
        self.assertEqual(timing["excluding_explicit_warmup"]["p95_ms"], 29)
        self.assertEqual(report["latency"]["candidate"]["unlabeled"]["n"], 1)
        self.assertEqual(timing["unlabeled"]["n"], 0)

    def test_raw_records_and_evidence_preserved_for_recomputation(self):
        original = copy.deepcopy((self.queries, self.runs, self.mapping, self.a, self.b))
        report = self.report()
        raw = report["raw_records"]
        self.assertEqual(raw["judge_a"], self.a)
        self.assertEqual(raw["judge_b"], self.b)
        self.assertEqual(raw["runs"], self.runs)
        self.assertEqual((self.queries, self.runs, self.mapping, self.a, self.b), original)
        repeated = evaluate.evaluate(raw["queries"], raw["runs"], raw["mapping"], raw["judge_a"], raw["judge_b"], raw["anchors"])
        self.assertEqual(report, repeated)
        json.dumps(report, allow_nan=False)

    def test_rejects_invalid_judgments_and_mapping(self):
        for grade in (-1, 4, 1.0, True, "3", None):
            broken = copy.deepcopy(self.a)
            broken[0]["grade"] = grade
            with self.subTest(grade=grade), self.assertRaises(ValueError):
                evaluate.evaluate(self.queries, self.runs, self.mapping, broken, self.b)
        for broken in ([self.a[0], self.a[0]], [{"pair_id": "unknown", "grade": 3, "evidence": "x"}],
                       [{"pair_id": self.mapping[0]["pair_id"], "grade": 3}]):
            with self.subTest(broken=broken), self.assertRaises(ValueError):
                evaluate.evaluate(self.queries, self.runs, self.mapping, broken, self.b)
        with self.assertRaises(ValueError):
            evaluate.evaluate(self.queries, self.runs, self.mapping + [self.mapping[0]], self.a, self.b)

    def test_rejects_invalid_anchors_comparison_and_bootstrap_options(self):
        options = [{"anchors": [{"query_id": "q1", "dataset_ids": []}]},
                   {"anchors": [{"query_id": "unknown", "dataset_ids": ["a"]}]},
                   {"baseline": "baseline"}, {"baseline": "baseline", "candidate": "missing"},
                   {"baseline": "baseline", "candidate": "baseline"},
                   {"bootstrap_samples": -1}, {"bootstrap_samples": 10}, {"bootstrap_samples": True}]
        for option in options:
            with self.subTest(option=option), self.assertRaises(ValueError):
                self.report(**option)

    def test_rejects_bad_latency_instead_of_emitting_nan(self):
        for sample in (-1, float("inf"), float("nan"), True, "10"):
            self.runs[0]["latency_ms"] = sample
            with self.subTest(sample=sample), self.assertRaises(ValueError):
                self.report()
        self.runs[0]["latency_ms"] = 1
        self.runs[0]["warmup"] = "true"
        with self.assertRaises(ValueError):
            self.report()


class CliTests(unittest.TestCase):
    def test_end_to_end_pool_metrics_and_csv_with_synthetic_files(self):
        with tempfile.TemporaryDirectory(prefix="synthetic-search-eval-") as directory:
            root = Path(directory)
            queries = root / "queries.jsonl"
            runs = root / "runs.jsonl"
            packets = root / "public.jsonl"
            mapping = root / "private.jsonl"
            a, b = root / "a.jsonl", root / "b.jsonl"
            anchors = root / "anchors.jsonl"
            output, csv_path = root / "metrics.json", root / "metrics.csv"
            evaluate.write_jsonl(queries, [query()])
            evaluate.write_jsonl(runs, [run("baseline", ["dataset-b", "dataset-a"]), run("candidate", ["dataset-a", "dataset-b"])])
            result = subprocess.run([sys.executable, str(MODULE_PATH), "pool", "--queries", str(queries),
                                     "--runs", str(runs), "--packets", str(packets), "--mapping", str(mapping), "--seed", "42"],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            private = evaluate.read_jsonl(mapping)
            self.assertEqual(len(evaluate.read_jsonl(packets)), 2)
            evaluate.write_jsonl(a, judgments(private, {"dataset-a": 3, "dataset-b": 0}))
            evaluate.write_jsonl(b, judgments(private, {"dataset-a": 3, "dataset-b": 0}, "assessor-B"))
            evaluate.write_jsonl(anchors, [{"query_id": "q1", "dataset_ids": ["dataset-a"]}])
            result = subprocess.run([sys.executable, str(MODULE_PATH), "metrics", "--queries", str(queries),
                                     "--runs", str(runs), "--mapping", str(mapping), "--judge-a", str(a),
                                     "--judge-b", str(b), "--anchors", str(anchors), "--output", str(output),
                                     "--csv", str(csv_path), "--baseline", "baseline", "--candidate", "candidate"],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            with output.open(encoding="utf-8") as stream:
                report = json.load(stream)
            with csv_path.open(encoding="utf-8", newline="") as stream:
                rows = list(csv.DictReader(stream))
            self.assertEqual(len(rows), 6)
            self.assertEqual(report["comparison"]["consensus"]["candidate_wins"], 1)
            self.assertEqual(report["raw_records"]["judge_a"], evaluate.read_jsonl(a))

    def test_cli_rejects_public_private_or_input_output_collisions(self):
        with tempfile.TemporaryDirectory(prefix="synthetic-search-eval-") as directory:
            root = Path(directory)
            queries, runs = root / "q.jsonl", root / "r.jsonl"
            evaluate.write_jsonl(queries, [query()])
            evaluate.write_jsonl(runs, [run("s", ["dataset-a"])])
            original = queries.read_bytes()
            for packets, mapping in ((root / "same.jsonl", root / "same.jsonl"), (queries, root / "private.jsonl")):
                result = subprocess.run([sys.executable, str(MODULE_PATH), "pool", "--queries", str(queries),
                                         "--runs", str(runs), "--packets", str(packets), "--mapping", str(mapping)],
                                        capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("output paths must be distinct", result.stderr)
            self.assertEqual(queries.read_bytes(), original)

    def test_jsonl_reports_line_number_for_malformed_input(self):
        with tempfile.TemporaryDirectory(prefix="synthetic-search-eval-") as directory:
            path = Path(directory) / "bad.jsonl"
            path.write_text('{}\n\nnot-json\n', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, ":3: invalid JSON"):
                evaluate.read_jsonl(path)
            path.write_text('[]\n', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "expected a JSON object"):
                evaluate.read_jsonl(path)


if __name__ == "__main__":
    unittest.main()
