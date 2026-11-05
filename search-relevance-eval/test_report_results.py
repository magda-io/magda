"""Synthetic-only protocol reporting tests; no real rankings or judgments."""

import copy
import csv
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import evaluate
import report_results as reporting


def query(query_id, split="heldout", category="discovery"):
    return {"id": query_id, "category": category, "split": split,
            "query": "Find synthetic observations", "intent": "Compare synthetic measurements",
            "success_criteria": {"hard_requirements": ["Monthly invented measurements"]}}


def run(system, query_id, ids):
    return {"system": system, "query_id": query_id,
            "hits": [{"id": dataset_id, "rank": rank, "score": 1 / rank}
                     for rank, dataset_id in enumerate(ids, 1)]}


def grade_records(mapping, grades, judge):
    return [{"pair_id": item["pair_id"], "grade": grades[(item["query_id"], item["dataset_id"])],
             "evidence": "Invented evidence only", "judge": {"id": judge}}
            for item in mapping if (item["query_id"], item["dataset_id"]) in grades]


class ReportTests(unittest.TestCase):
    def setUp(self):
        self.queries = [query("q1"), query("q2"), query("q3", "dev"),
                        query("q4", category="plausibly_missing_answer"),
                        query("q5", category="missing_answer")]
        self.runs = [run(system, query["id"], ids) for query in self.queries
                     for system, ids in (("baseline", ["b", "a", "c"]), ("candidate", ["a", "b", "c"]))]
        _, self.mapping = evaluate.build_pool(self.queries, self.runs)
        self.mapping = [{key: record[key] for key in ("pair_id", "query_id", "dataset_id")} for record in self.mapping]
        grades_a = {(query["id"], dataset_id): grade for query in self.queries
                    for dataset_id, grade in (("a", 3), ("b", 0), ("c", "U"))}
        grades_b = dict(grades_a)
        grades_b[("q2", "a")] = 1
        self.a = grade_records(self.mapping, grades_a, "A")
        self.b = grade_records(self.mapping, grades_b, "B")

    def report(self, **kwargs):
        return reporting.build_report(self.queries, self.runs, self.mapping, self.a, self.b,
                                      bootstrap_samples=kwargs.pop("bootstrap_samples", 30), **kwargs)

    def pair(self, query_id, dataset_id):
        return next(record["pair_id"] for record in self.mapping
                    if record["query_id"] == query_id and record["dataset_id"] == dataset_id)

    def row(self, report, query_id="q1", system="baseline", scenario="adjudicated"):
        return next(row for row in report["per_query"] if row["query_id"] == query_id
                    and row["system"] == system and row["scenario"] == scenario)

    def summary(self, report, scenario="adjudicated", scope="heldout_primary", system="baseline"):
        return next(row for row in report["overall"] if row["scenario"] == scenario
                    and row["scope"] == scope and row["system"] == system)

    def test_primary_cohort_excludes_zero_idcg_missing_answer_and_dev(self):
        report = self.report()
        self.assertEqual(report["cohorts"]["heldout_primary"], ["q1"])
        self.assertEqual(report["cohorts"]["dev_primary"], ["q3"])
        self.assertEqual(report["cohorts"]["heldout_missing_answer_diagnostic"], ["q4", "q5"])
        self.assertEqual(self.summary(report)["n_cohort_queries"], 1)
        self.assertEqual(self.summary(report, scope="dev_primary")["n_cohort_queries"], 1)
        self.assertIsNone(self.row(report, query_id="q2")["ndcg_at_10"])

    def test_adjudication_overrides_conflict_and_audited_agreement(self):
        adjudication = [
            {"pair_id": self.pair("q2", "a"), "grade": 2, "evidence": "Independent resolution"},
            {"pair_id": self.pair("q1", "a"), "grade": "U", "evidence": "Agreement audit cannot verify"},
        ]
        report = self.report(adjudication=adjudication)
        self.assertEqual(report["cohorts"]["heldout_primary"], ["q2"])
        resolved = {record["pair_id"]: record for record in report["resolved_judgments"]}
        self.assertEqual(resolved[self.pair("q2", "a")]["resolved_grade"], 2)
        self.assertEqual(resolved[self.pair("q1", "a")]["resolved_grade"], "U")
        self.assertEqual(resolved[self.pair("q1", "a")]["resolution_source"], "explicit_adjudication")
        self.assertEqual(report["raw_records"]["judge_a"], self.a)
        self.assertEqual(report["raw_records"]["judge_b"], self.b)
        self.assertEqual(report["raw_records"]["adjudication"], adjudication)

    def test_unresolved_disagreement_is_not_synthetic_truth(self):
        report = self.report()
        record = next(item for item in report["resolved_judgments"] if item["pair_id"] == self.pair("q2", "a"))
        self.assertEqual(record["resolved_grade"], "U")
        self.assertEqual(record["resolution_source"], "unresolved_U")
        self.assertEqual(record["judge_a"], 3)
        self.assertEqual(record["judge_b"], 1)
        self.assertTrue(self.row(report, query_id="q2")["zero_idcg"])

    def test_scenarios_retain_fixed_cohort_and_disclose_newly_defined(self):
        report = self.report()
        self.assertEqual({row["scenario"] for row in report["overall"]}, set(reporting.SCENARIOS))
        for row in report["scenario_cohorts"]:
            if row["scope"] == "heldout_primary":
                self.assertEqual(row["fixed_primary_defined_query_ids"], ["q1"])
        sensitivity = next(row for row in report["scenario_cohorts"]
                           if row["scope"] == "heldout_primary" and row["scenario"] == "judge_a")
        self.assertEqual(sensitivity["newly_defined_query_ids"], ["q2"])
        self.assertEqual(sensitivity["n_newly_defined_outside_common_cohort"], 1)
        self.assertEqual(self.summary(report, scenario="judge_a")["n_cohort_queries"], 1)
        self.assertEqual(self.summary(report, scenario="judge_a", scope="heldout_all_positive")["n_cohort_queries"], 2)

    def test_original_rank_ndcg_and_condensed_sensitivity(self):
        self.runs[0]["hits"] = [{"id": "c", "rank": 1}, {"id": "a", "rank": 10}, {"id": "b", "rank": 11}]
        report = self.report()
        row = self.row(report)
        self.assertAlmostEqual(row["ndcg_at_10"], 1 / math.log2(11))
        self.assertEqual(row["condensed_ndcg_at_10"], 1)
        self.assertEqual((row["retrieved_at_10"], row["judged_at_10"], row["u_at_10"]), (2, 1, 1))

    def test_zero_idcg_is_null_in_every_system_and_condensed_metric(self):
        report = self.report()
        for system in ("baseline", "candidate"):
            row = self.row(report, query_id="q2", system=system)
            self.assertTrue(row["zero_idcg"])
            self.assertIsNone(row["ndcg_at_10"])
            self.assertIsNone(row["condensed_ndcg_at_10"])
        summary = self.summary(report, scope="heldout_all_positive")
        self.assertEqual(summary["n_zero_idcg_queries"], 1)
        self.assertEqual(summary["n_defined_queries"], 1)

    def test_u_as_three_and_conflict_bounds_are_explicit_assumptions(self):
        views = reporting._grade_views({"p": {}}, {"p": 2}, {"p": "U"}, {})
        self.assertEqual(views["adjudicated"]["p"], "U")
        self.assertEqual(views["u_as_3"]["p"], 3)
        self.assertEqual(views["conflict_min"]["p"], 0)
        self.assertEqual(views["conflict_max"]["p"], 2)
        views = reporting._grade_views({"p": {}}, {"p": 1}, {"p": 3}, {"p": 2})
        self.assertEqual(views["conflict_min"]["p"], 1)
        self.assertEqual(views["conflict_max"]["p"], 3)
        self.assertEqual(views["adjudicated"]["p"], 2)

    def test_binary_uses_custom_gain_not_exponential_grade(self):
        hits = [{"id": "b", "rank": 1}, {"id": "a", "rank": 2}]
        grades = {"a": 3, "b": 2}
        binary = reporting._score(hits, grades, binary=True)
        graded = reporting._score(hits, grades)
        self.assertEqual(binary["ndcg_at_10"], 1)
        self.assertLess(graded["ndcg_at_10"], 1)
        self.assertIsNone(reporting._score(hits, {"a": 1, "b": 0}, binary=True)["ndcg_at_10"])

    def test_binary_scenario_can_be_undefined_in_fixed_cohort(self):
        adjudication = [{"pair_id": self.pair("q1", "a"), "grade": 1, "evidence": "Weak usefulness"}]
        report = self.report(adjudication=adjudication)
        summary = self.summary(report, scenario="binary_ge_2")
        self.assertEqual(summary["n_cohort_queries"], 1)
        self.assertEqual(summary["n_defined_queries"], 0)
        cohort = next(row for row in report["scenario_cohorts"] if row["scenario"] == "binary_ge_2" and row["scope"] == "heldout_primary")
        self.assertEqual(cohort["undefined_in_common_cohort"], ["q1"])

    def test_supplied_family_collapse_first_hit_max_grade_and_compressed_rank(self):
        families = [{"dataset_id": "a", "family_id": "observations"},
                    {"dataset_id": "b", "family_id": "observations"}]
        report = self.report(families=families)
        self.assertLess(self.row(report)["ndcg_at_10"], 1)
        row = self.row(report, scenario="family_collapsed")
        self.assertEqual(row["ndcg_at_10"], 1)
        self.assertEqual(row["retrieved_at_10"], 2)
        self.assertEqual(row["numeric_pool_count"], 1)
        self.assertEqual(row["pool_count"], 2)
        self.assertIn("provided", report["settings"]["family_method"])

    def test_no_family_metadata_does_not_invent_duplicate_relationships(self):
        report = self.report()
        self.assertEqual(self.row(report)["ndcg_at_10"], self.row(report, scenario="family_collapsed")["ndcg_at_10"])
        self.assertEqual(report["raw_records"]["families"], None)

    def test_derived_families_require_same_normalized_publisher_and_title(self):
        runs = [run("s", "q1", ["a", "b", "c", "d"])]
        metadata = [
            {"title": "Water: Levels", "publisher": {"name": "SYNTHETIC Institute"}},
            {"title": " water levels ", "publisher": {"name": "Synthetic Institute"}},
            {"title": "Water levels", "publisher": {"name": "Different Publisher"}},
            {"title": "Water levels version 2", "publisher": {"name": "Synthetic Institute"}},
        ]
        for hit, value in zip(runs[0]["hits"], metadata):
            hit["metadata"] = value
        families, method = reporting._family_map(runs, None)
        self.assertEqual(families["a"], families["b"])
        self.assertNotEqual(families["a"], families["c"])
        self.assertNotEqual(families["a"], families["d"])
        self.assertIn("normalized publisher+title", method)

    def test_agreement_confusion_includes_u_and_quadratic_kappa_numeric_only(self):
        pair_map = {"p1": {}, "p2": {}, "p3": {}, "p4": {}}
        a = {"p1": 0, "p2": 3, "p3": "U"}
        b = {"p1": 0, "p2": 2, "p3": 1, "p4": "U"}
        stats = reporting.agreement_statistics(pair_map, a, b)
        self.assertEqual(stats["confusion"][0][0], 1)
        self.assertEqual(stats["confusion"][3][2], 1)
        self.assertEqual(stats["confusion"][4][1], 1)
        self.assertEqual(stats["confusion"][4][4], 1)
        self.assertEqual(stats["numeric_pair_count"], 2)
        self.assertEqual(stats["missing_a"], 1)
        self.assertAlmostEqual(stats["quadratic_weighted_kappa"], 6 / 7)
        self.assertIsNone(reporting.agreement_statistics({"p": {}}, {"p": 0}, {"p": 0})["quadratic_weighted_kappa"])

    def test_descriptive_paired_bootstrap_runs_at_small_n_and_is_reproducible(self):
        report = self.report(bootstrap_samples=100)
        repeated = self.report(bootstrap_samples=100)
        self.assertEqual(report["comparisons"], repeated["comparisons"])
        comparison = next(row for row in report["comparisons"] if row["scenario"] == "adjudicated" and row["scope"] == "heldout_primary")
        self.assertEqual(comparison["n_effective_paired"], 1)
        self.assertEqual(comparison["candidate_wins"], 1)
        self.assertEqual(comparison["bootstrap"]["samples"], 100)
        self.assertTrue(comparison["bootstrap"]["small_n"])
        self.assertIn("descriptive pilot", comparison["bootstrap"]["interpretation"])
        self.assertIsNotNone(comparison["bootstrap"]["percentile_interval"])
        self.assertEqual(comparison["per_query_deltas"][0]["outcome"], "candidate_win")
        self.assertTrue(any(row["candidate_wins"] == 1 for row in report["comparison_by_category"]))

    def test_missing_run_reduces_effective_paired_n_not_fixed_cohort(self):
        self.runs = [run for run in self.runs if (run["system"], run["query_id"]) != ("candidate", "q1")]
        report = self.report()
        comparison = next(row for row in report["comparisons"] if row["scenario"] == "adjudicated" and row["scope"] == "heldout_primary")
        self.assertEqual(comparison["n_fixed_cohort"], 1)
        self.assertEqual(comparison["n_effective_paired"], 0)
        self.assertEqual(comparison["n_excluded_undefined_or_missing_run"], 1)
        self.assertFalse(self.row(report, system="candidate")["run_present"])
        self.assertIsNone(self.row(report, system="candidate")["ndcg_at_10"])

    def test_coverage_u_rates_and_scenarios_are_not_deduplicated_globally(self):
        report = self.report()
        row = self.summary(report)
        self.assertEqual(row["retrieved_at_10"], 3)
        self.assertEqual(row["judged_at_10"], 2)
        self.assertEqual(row["u_fraction_at_10"], 1 / 3)
        coverage = next(row for row in report["pool_coverage"] if row["query_id"] == "q1" and row["scenario"] == "adjudicated")
        self.assertEqual(coverage["u_fraction"], 1 / 3)
        self.assertEqual(coverage["pooled"], 3)

    def test_raw_records_recompute_and_inputs_are_not_mutated(self):
        original = copy.deepcopy((self.queries, self.runs, self.mapping, self.a, self.b))
        report = self.report()
        repeated = reporting.build_report(**report["raw_records"], bootstrap_samples=30)
        self.assertEqual(report, repeated)
        self.assertEqual((self.queries, self.runs, self.mapping, self.a, self.b), original)
        json.dumps(report, allow_nan=False)

    def test_rejects_bad_adjudication_mapping_families_and_settings(self):
        for options in ({"adjudication": [{"pair_id": "unknown", "grade": 3, "evidence": "x"}]},
                        {"adjudication": [{"pair_id": self.pair("q1", "a"), "grade": 5, "evidence": "x"}]},
                        {"families": [{"dataset_id": "a", "family_id": "x"}, {"dataset_id": "a", "family_id": "x"}]},
                        {"baseline": "not-a-system"}, {"bootstrap_samples": -1}, {"bootstrap_samples": True}):
            with self.subTest(options=options), self.assertRaises(ValueError):
                self.report(**options)
        self.mapping.append(self.mapping[0])
        with self.assertRaises(ValueError):
            self.report()

    def test_split_aliases_and_missing_answer_category_hyphen_alias(self):
        self.queries[0]["split"] = "test"
        self.queries[2]["split"] = "development"
        self.queries[3]["category"] = "plausibly-missing-answer"
        report = self.report()
        self.assertEqual(report["cohorts"]["heldout_primary"], ["q1"])
        self.assertEqual(report["cohorts"]["dev_primary"], ["q3"])


class ReportCliTests(unittest.TestCase):
    def test_cli_preserves_evidence_hashes_and_writes_recomputable_csv_json(self):
        with tempfile.TemporaryDirectory(prefix="synthetic-report-") as directory:
            root = Path(directory)
            queries = [query("q1")]
            runs = [run("baseline", "q1", ["b", "a"]), run("candidate", "q1", ["a", "b"])]
            _, mapping = evaluate.build_pool(queries, runs)
            a = grade_records(mapping, {("q1", "a"): 3, ("q1", "b"): 0}, "A")
            b = grade_records(mapping, {("q1", "a"): 3, ("q1", "b"): 0}, "B")
            inputs = {"queries": queries, "runs": runs, "mapping": mapping, "judge-a": a, "judge-b": b}
            arguments = []
            for name, records in inputs.items():
                path = root / (name + ".jsonl")
                evaluate.write_jsonl(path, records)
                arguments += ["--" + name, str(path)]
            output, csv_path = root / "report.json", root / "report.csv"
            result = subprocess.run([sys.executable, str(Path(reporting.__file__)), *arguments,
                                     "--output", str(output), "--csv", str(csv_path),
                                     "--bootstrap-samples", "25", "--baseline", "baseline"],
                                    text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            with output.open(encoding="utf-8") as stream:
                report = json.load(stream)
            expected_hash = hashlib.sha256((root / "judge-a.jsonl").read_bytes()).hexdigest()
            self.assertEqual(report["evidence_files"]["judge_a"]["sha256"], expected_hash)
            self.assertEqual(report["raw_records"]["judge_a"], a)
            self.assertEqual(report["settings"]["baseline_selection"], "explicit")
            with csv_path.open(encoding="utf-8", newline="") as stream:
                rows = list(csv.DictReader(stream))
            self.assertEqual(len(rows), 18)
            self.assertIn("in_primary_cohort", rows[0])
            self.assertEqual({row["scenario"] for row in rows}, set(reporting.SCENARIOS))


if __name__ == "__main__":
    unittest.main()
