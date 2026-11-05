#!/usr/bin/env python3
"""Evaluation-only, stdlib scenario reporting for frozen relevance judgments.

No network, retrieval, LLM adjudication or production code is used. Inputs are
private artifacts. The primary qrels use explicit adjudication where supplied,
otherwise identical numeric A/B grades, otherwise U. No disagreement is silently
resolved. Sensitivity transformations are labeled assumptions, not new truth.

Primary cohort: heldout/test positive-intent queries with positive adjudicated
pooled IDCG. ``missing_answer`` and ``plausibly_missing_answer`` are excluded.
Development queries are analyzed separately. Every scenario uses that same
primary-defined cohort; undefined scenario scores are excluded and counted,
never imputed. Newly defined query counts are reported separately.
"""

import argparse
import csv
import hashlib
import json
import math
from pathlib import Path
import random
import re
import statistics
import unicodedata

import evaluate as core


SCENARIOS = ("judge_a", "judge_b", "agreement", "adjudicated", "u_as_3",
             "conflict_min", "conflict_max", "binary_ge_2", "family_collapsed")
EXCLUDED_CATEGORIES = {"missing_answer", "plausibly_missing_answer"}
HELDOUT_SPLITS = {"heldout", "held_out", "test"}
DEV_SPLITS = {"dev", "development"}
LIMITATIONS = [
    "Pooled IDCG is incomplete-corpus evidence, not objective corpus truth. U/unjudged gains are zero except the explicit u_as_3 sensitivity.",
    "Zero pooled IDCG makes both NDCGs undefined/null for every system and excludes that query from means and paired differences.",
    "Primary cohort is fixed using adjudicated qrels, heldout/test split and positive-intent categories; each scenario reports its effective defined subset and newly defined queries separately.",
    "Intervals are descriptive pilot paired query-resampling intervals (including small n), not significance tests or population guarantees. Dependence and query selection limit inference.",
    "Adjudication overrides A/B only when explicitly provided. Original judgments, evidence and metadata are preserved. Assessor independence is a protocol property, not verified here.",
    "Binary gain and conflict/U transformations are sensitivity assumptions, not substitute judgments or objective answers.",
    "Family collapse uses only supplied family IDs or exact normalized title plus publisher. It does not detect near-duplicates, version families or semantic equivalence. Without family evidence IDs remain separate.",
    "Family collapse retains each family's first retrieved occurrence, compresses ranks, and uses maximum numeric pooled family grade (U only when no numeric member exists).",
]


def _normal(value):
    return re.sub(r"[^\w]+", " ", unicodedata.normalize("NFKC", value).casefold()).strip()


def _split(query):
    value = str(query["split"]).lower().replace("-", "_")
    if value in HELDOUT_SPLITS:
        return "heldout"
    if value in DEV_SPLITS:
        return "dev"
    return "other"


def _positive(query):
    return str(query["category"]).lower().replace("-", "_") not in EXCLUDED_CATEGORIES


def _numeric(grade):
    return isinstance(grade, int) and not isinstance(grade, bool)


def _grade_views(pair_map, a, b, adjudication):
    views = {name: {} for name in SCENARIOS if name not in {"binary_ge_2", "family_collapsed"}}
    for pair_id in pair_map:
        left, right = a.get(pair_id, "U"), b.get(pair_id, "U")
        agreed = left if _numeric(left) and left == right else "U"
        resolved = adjudication.get(pair_id, agreed)
        views["judge_a"][pair_id] = left
        views["judge_b"][pair_id] = right
        views["agreement"][pair_id] = agreed
        views["adjudicated"][pair_id] = resolved
        views["u_as_3"][pair_id] = resolved if _numeric(resolved) else 3
        # Treat U/missing as zero in these *explicitly assumed* bounds.
        numeric_left, numeric_right = left if _numeric(left) else 0, right if _numeric(right) else 0
        views["conflict_min"][pair_id] = min(numeric_left, numeric_right)
        views["conflict_max"][pair_id] = max(numeric_left, numeric_right)
    views["binary_ge_2"] = dict(views["adjudicated"])
    views["family_collapsed"] = dict(views["adjudicated"])
    return views


def agreement_statistics(pair_map, a, b):
    """5x5 includes U; quadratic kappa uses numeric-numeric records only."""
    labels = [0, 1, 2, 3, "U"]
    confusion = [[0] * 5 for _ in labels]
    numeric = [[0] * 4 for _ in range(4)]
    missing_a = missing_b = 0
    for pair_id in pair_map:
        left, right = a.get(pair_id, "U"), b.get(pair_id, "U")
        missing_a += pair_id not in a
        missing_b += pair_id not in b
        confusion[labels.index(left)][labels.index(right)] += 1
        if _numeric(left) and _numeric(right):
            numeric[left][right] += 1
    n = sum(sum(row) for row in numeric)
    left_marginal = [sum(row) for row in numeric]
    right_marginal = [sum(numeric[row][column] for row in range(4)) for column in range(4)]
    observed = sum(((i - j) / 3) ** 2 * numeric[i][j] for i in range(4) for j in range(4)) / n if n else None
    expected = sum(((i - j) / 3) ** 2 * left_marginal[i] * right_marginal[j] for i in range(4) for j in range(4)) / (n * n) if n else None
    return {"labels": labels, "rows": "judge_a", "columns": "judge_b", "confusion": confusion,
            "n_pairs": len(pair_map), "missing_a": missing_a, "missing_b": missing_b,
            "missing_in_confusion": "mapped to U; explicit missing counts retained",
            "numeric_pair_count": n, "quadratic_weighted_kappa": 1 - observed / expected if expected else None,
            "kappa_undefined_reason": "no numeric pairs or degenerate expected disagreement" if not expected else None,
            "exact_numeric_agreements": sum(numeric[i][i] for i in range(4))}


def _family_map(runs, records):
    families = {}
    if records is not None:
        for record in records:
            dataset_id = core._identifier(record.get("dataset_id"), "family dataset_id")
            family_id = core._identifier(record.get("family_id"), "family_id")
            if dataset_id in families:
                raise ValueError("duplicate dataset_id in families")
            families[dataset_id] = "provided:" + family_id
        return families, "provided dataset_id/family_id mapping; unmapped IDs stay separate"
    # Optional API convenience: compact ranking inputs normally lack metadata,
    # so absent explicit families we do not invent similarity relationships.
    candidates = {}
    for run in runs:
        for hit in run["hits"]:
            metadata = hit.get("metadata", {})
            publisher = metadata.get("publisher", "")
            if isinstance(publisher, dict):
                publisher = publisher.get("name", "")
            title = metadata.get("title", metadata.get("name", ""))
            if isinstance(publisher, str) and isinstance(title, str) and _normal(publisher) and _normal(title):
                key = (_normal(publisher), _normal(title))
                candidates.setdefault(hit["id"], set()).add(key)
    for dataset_id, keys in candidates.items():
        if len(keys) == 1:
            families[dataset_id] = "derived:" + core._canonical(next(iter(keys)))
    return families, "exact NFKC/casefold/punctuation-space normalized publisher+title where available; ambiguous/missing metadata IDs stay separate"


def _family_id(dataset_id, families):
    return families.get(dataset_id, "dataset:" + dataset_id)


def _qrels(grades, pair_map, families=None):
    by_query = {}
    for pair_id, item in pair_map.items():
        query_id = item["query_id"]
        dataset_id = item["dataset_id"] if families is None else _family_id(item["dataset_id"], families)
        grade = grades[pair_id]
        group = by_query.setdefault(query_id, {})
        previous = group.get(dataset_id, "U")
        if _numeric(grade):
            group[dataset_id] = max(grade, previous) if _numeric(previous) else grade
        else:
            group.setdefault(dataset_id, "U")
    return by_query


def _score(hits, grades, binary=False, families=None):
    if families is not None:
        collapsed, seen = [], set()
        for hit in hits:
            family = _family_id(hit["id"], families)
            if family not in seen:
                seen.add(family)
                collapsed.append({"id": family, "rank": len(collapsed) + 1})
        hits = collapsed
    gain = (lambda grade: int(grade >= 2)) if binary else (lambda grade: 2 ** grade - 1)
    numeric = {dataset_id: grade for dataset_id, grade in grades.items() if _numeric(grade)}
    ideal = sorted((gain(grade) for grade in numeric.values()), reverse=True)[:10]
    idcg = sum(value / math.log2(index + 2) for index, value in enumerate(ideal))
    top = [hit for hit in hits if hit["rank"] <= 10]
    judged = sum(hit["id"] in numeric for hit in top)
    u = sum(hit["id"] in grades and grades[hit["id"]] == "U" for hit in top)
    if idcg:
        dcg = sum(gain(numeric.get(hit["id"], 0)) / math.log2(hit["rank"] + 1) for hit in top)
        condensed = [gain(numeric[hit["id"]]) for hit in hits if hit["id"] in numeric][:10]
        condensed_dcg = sum(value / math.log2(index + 2) for index, value in enumerate(condensed))
    else:
        dcg = condensed_dcg = None
    return {"ndcg_at_10": dcg / idcg if idcg else None,
            "condensed_ndcg_at_10": condensed_dcg / idcg if idcg else None,
            "pooled_idcg_at_10": idcg, "zero_idcg": bool(numeric) and not idcg,
            "numeric_pool_count": len(numeric), "pool_count": len(grades),
            "pool_u_count": sum(grade == "U" for grade in grades.values()),
            "retrieved_at_10": len(top), "judged_at_10": judged, "u_at_10": u,
            "unjudged_at_10": len(top) - judged - u,
            "judged_fraction_at_10": judged / len(top) if top else None}


def _aggregate(rows):
    numeric = [row["ndcg_at_10"] for row in rows if row["ndcg_at_10"] is not None]
    retrieved = sum(row["retrieved_at_10"] for row in rows)
    judged = sum(row["judged_at_10"] for row in rows)
    u = sum(row["u_at_10"] for row in rows)
    return {"n_cohort_queries": len(rows), "n_runs": sum(row["run_present"] for row in rows),
            "n_defined_queries": len(numeric), "n_undefined_queries": len(rows) - len(numeric),
            "n_zero_idcg_queries": sum(row["zero_idcg"] for row in rows),
            "ndcg_at_10": core._mean(numeric),
            "condensed_ndcg_at_10": core._mean(row["condensed_ndcg_at_10"] for row in rows),
            "retrieved_at_10": retrieved, "judged_at_10": judged, "u_at_10": u,
            "unjudged_at_10": sum(row["unjudged_at_10"] for row in rows),
            "judged_fraction_at_10": judged / retrieved if retrieved else None,
            "u_fraction_at_10": u / retrieved if retrieved else None}


def _paired(rows, baseline, candidate, samples, seed, cohort_size):
    indexed = {(row["system"], row["query_id"]): row["ndcg_at_10"] for row in rows}
    query_ids = sorted({row["query_id"] for row in rows})
    differences = [{"query_id": query_id, "candidate_minus_baseline": indexed[(candidate, query_id)] - indexed[(baseline, query_id)]}
                   for query_id in query_ids if indexed.get((candidate, query_id)) is not None and indexed.get((baseline, query_id)) is not None]
    for item in differences:
        delta = item["candidate_minus_baseline"]
        item["outcome"] = "candidate_win" if delta > 1e-12 else "candidate_loss" if delta < -1e-12 else "tie"
    values = [item["candidate_minus_baseline"] for item in differences]
    interval = None
    if values and samples:
        rng = random.Random(seed)
        means = [statistics.mean(rng.choices(values, k=len(values))) for _ in range(samples)]
        interval = [core._percentile(means, .025), core._percentile(means, .975)]
    return {"baseline": baseline, "candidate": candidate, "n_fixed_cohort": cohort_size,
            "n_effective_paired": len(values), "n_excluded_undefined_or_missing_run": cohort_size - len(values),
            "candidate_wins": sum(value > 1e-12 for value in values),
            "ties": sum(abs(value) <= 1e-12 for value in values),
            "candidate_losses": sum(value < -1e-12 for value in values),
            "mean_candidate_minus_baseline": core._mean(values), "per_query_deltas": differences,
            "bootstrap": {"samples": samples if values else 0, "requested_samples": samples,
                "seed": seed, "unit": "paired query", "confidence_level": .95,
                "percentile_interval": interval, "n_effective": len(values),
                "small_n": len(values) < 10, "interpretation": "descriptive pilot interval only; no significance claim",
                "reason": None if interval is not None else "no comparable queries or bootstrap disabled"}}


def build_report(queries, runs, mapping, judge_a, judge_b, adjudication=None,
                 families=None, seed=3901, bootstrap_samples=10000, baseline=None):
    """Build report entirely from supplied records; original evidence retained.

    ``families`` is optional JSONL-like {dataset_id,family_id} records. A third
    judgment may grade any pair (including an audit of agreements); its explicit
    numeric or U grade overrides the agreement fallback. Binary NDCG uses actual
    gains 1[grade>=2], not exponential gain applied to fabricated grades.
    """
    if isinstance(bootstrap_samples, bool) or not isinstance(bootstrap_samples, int) or bootstrap_samples < 0:
        raise ValueError("bootstrap_samples must be a nonnegative integer")
    query_map = core._queries(queries)
    system_runs = core._runs(runs, query_map)
    pair_map, seen = {}, set()
    for item in mapping:
        pair_id = core._identifier(item.get("pair_id"), "pair_id")
        query_id = item.get("query_id")
        dataset_id = core._identifier(item.get("dataset_id"), "dataset_id")
        if query_id not in query_map or pair_id in pair_map or (query_id, dataset_id) in seen:
            raise ValueError("mapping must contain unique pairs for known queries")
        pair_map[pair_id] = item
        seen.add((query_id, dataset_id))
    a = core._judgments(judge_a, pair_map)
    b = core._judgments(judge_b, pair_map)
    third = core._judgments(adjudication or [], pair_map)
    views = _grade_views(pair_map, a, b, third)
    family_ids, family_method = _family_map(runs, families)
    qrels = {name: _qrels(grades, pair_map, family_ids if name == "family_collapsed" else None)
             for name, grades in views.items()}
    primary_defined = {query_id for query_id in query_map
                       if any(_numeric(grade) and grade > 0 for grade in qrels["adjudicated"].get(query_id, {}).values())}
    primary_cohort = {query_id for query_id, query in query_map.items()
                      if _split(query) == "heldout" and _positive(query) and query_id in primary_defined}
    dev_cohort = {query_id for query_id, query in query_map.items()
                  if _split(query) == "dev" and _positive(query) and query_id in primary_defined}
    rows = []
    pool_coverage = []
    for scenario in SCENARIOS:
        for query_id, query in sorted(query_map.items()):
            grades = qrels[scenario].get(query_id, {})
            measure = _score([], grades, binary=scenario == "binary_ge_2")
            pool_coverage.append({"scenario": scenario, "query_id": query_id,
                "pooled": len(grades), "numeric": measure["numeric_pool_count"],
                "u": measure["pool_u_count"], "u_fraction": measure["pool_u_count"] / len(grades) if grades else None,
                "zero_idcg": measure["zero_idcg"], "scenario_defined": bool(measure["pooled_idcg_at_10"])})
            for system in sorted(system_runs):
                run = system_runs[system].get(query_id)
                hits = core._ranked_hits(run) if run else []
                score = _score(hits, grades, binary=scenario == "binary_ge_2",
                               families=family_ids if scenario == "family_collapsed" else None)
                if run is None:
                    score["ndcg_at_10"] = score["condensed_ndcg_at_10"] = None
                rows.append({"scenario": scenario, "system": system, "query_id": query_id,
                    "category": query["category"], "split": query["split"], "split_group": _split(query),
                    "positive_intent": _positive(query), "run_present": run is not None,
                    "in_primary_cohort": query_id in primary_cohort, "in_dev_cohort": query_id in dev_cohort,
                    **score})
    scopes = {"heldout_primary": primary_cohort, "dev_primary": dev_cohort,
              "heldout_all_positive": {query_id for query_id, query in query_map.items() if _split(query) == "heldout" and _positive(query)},
              "heldout_missing_answer_diagnostic": {query_id for query_id, query in query_map.items() if _split(query) == "heldout" and not _positive(query)},
              "dev_missing_answer_diagnostic": {query_id for query_id, query in query_map.items() if _split(query) == "dev" and not _positive(query)}}
    overall, by_category, comparisons, comparison_by_category, scenario_cohorts = [], [], [], [], []
    systems = sorted(system_runs)
    if baseline is not None and baseline not in system_runs:
        raise ValueError("baseline must name a known system")
    baseline_selected = baseline if baseline is not None else ("baseline" if "baseline" in systems else systems[0] if systems else None)
    coverage_by_scenario = {(row["scenario"], row["query_id"]): row for row in pool_coverage}
    for scenario in SCENARIOS:
        for scope, cohort in scopes.items():
            selected = [row for row in rows if row["scenario"] == scenario and row["query_id"] in cohort]
            for system in systems:
                group = [row for row in selected if row["system"] == system]
                overall.append({"scenario": scenario, "scope": scope, "system": system, **_aggregate(group)})
                for category in sorted({query_map[query_id]["category"] for query_id in cohort}):
                    category_rows = [row for row in group if row["category"] == category]
                    by_category.append({"scenario": scenario, "scope": scope, "system": system, "category": category, **_aggregate(category_rows)})
            if scope in {"heldout_primary", "dev_primary"}:
                # Every named baseline comparison uses identical query draws for
                # equal cohort sizes, enabling direct recomputation by seed.
                for candidate in systems:
                    if candidate != baseline_selected:
                        comparisons.append({"scenario": scenario, "scope": scope,
                            **_paired(selected, baseline_selected, candidate, bootstrap_samples, seed, len(cohort))})
                        for category in sorted({query_map[query_id]["category"] for query_id in cohort}):
                            category_cohort = {query_id for query_id in cohort if query_map[query_id]["category"] == category}
                            category_rows = [row for row in selected if row["query_id"] in category_cohort]
                            comparison_by_category.append({"scenario": scenario, "scope": scope, "category": category,
                                **_paired(category_rows, baseline_selected, candidate, 0, seed, len(category_cohort))})
            if scope in {"heldout_primary", "dev_primary"}:
                split = "heldout" if scope == "heldout_primary" else "dev"
                eligible = {query_id for query_id, query in query_map.items() if _split(query) == split and _positive(query)}
                defined = {query_id for query_id in eligible if coverage_by_scenario[(scenario, query_id)]["scenario_defined"]}
                scenario_cohorts.append({"scenario": scenario, "scope": scope,
                    "fixed_primary_defined_query_ids": sorted(cohort), "n_fixed_primary_defined": len(cohort),
                    "n_scenario_defined_in_common_cohort": len(defined & cohort),
                    "undefined_in_common_cohort": sorted(cohort - defined),
                    "n_newly_defined_outside_common_cohort": len(defined - cohort),
                    "newly_defined_query_ids": sorted(defined - cohort)})
    resolved_records = [{"pair_id": pair_id, "query_id": item["query_id"], "dataset_id": item["dataset_id"],
        "judge_a": a.get(pair_id), "judge_b": b.get(pair_id), "adjudication": third.get(pair_id),
        "resolved_grade": views["adjudicated"][pair_id],
        "resolution_source": "explicit_adjudication" if pair_id in third else "numeric_agreement" if _numeric(views["agreement"][pair_id]) else "unresolved_U"}
        for pair_id, item in sorted(pair_map.items())]
    return {"schema_version": 1, "settings": {"seed": seed, "bootstrap_samples": bootstrap_samples,
        "primary_scenario": "adjudicated", "baseline": baseline_selected,
        "baseline_selection": "explicit" if baseline is not None else "named baseline if present, otherwise lexicographically first system",
        "primary_cohort_rule": "heldout/test positive-intent, adjudicated pooled IDCG>0",
        "excluded_categories": sorted(EXCLUDED_CATEGORIES), "family_method": family_method,
        "conflict_min_max_rule": "all A/B pairs: min/max numeric grade; missing/U treated as 0; explicit sensitivity not adjudication",
        "binary_gain": "1 if resolved grade>=2 else 0; U/unjudged gain0",
        "bootstrap_policy": "paired query percentile, even n<10 labeled descriptive pilot; no significance claim"},
        "limitations": LIMITATIONS, "cohorts": {name: sorted(cohort) for name, cohort in scopes.items()},
        "scenario_cohorts": scenario_cohorts, "overall": overall, "by_category": by_category,
        "per_query": rows, "pool_coverage": pool_coverage, "comparisons": comparisons,
        "comparison_by_category": comparison_by_category,
        "agreement": agreement_statistics(pair_map, a, b), "resolved_judgments": resolved_records,
        "latency": core._latencies(runs), "evidence_files": {},
        "raw_records": {"queries": queries, "runs": runs, "mapping": mapping,
            "judge_a": judge_a, "judge_b": judge_b, "adjudication": adjudication or [], "families": families}}


def write_report_csv(path, report):
    fields = ["scenario", "system", "query_id", "category", "split", "split_group", "positive_intent",
              "run_present", "in_primary_cohort", "in_dev_cohort", "ndcg_at_10", "condensed_ndcg_at_10",
              "pooled_idcg_at_10", "zero_idcg", "numeric_pool_count", "pool_count", "pool_u_count",
              "retrieved_at_10", "judged_at_10", "u_at_10", "unjudged_at_10", "judged_fraction_at_10"]
    with open(path, "w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(report["per_query"])


def _file_hash(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return {"path": str(path), "sha256": digest.hexdigest(), "bytes": Path(path).stat().st_size}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    for name in ("queries", "runs", "mapping", "judge-a", "judge-b", "output", "csv"):
        parser.add_argument("--" + name, required=True)
    parser.add_argument("--adjudication")
    parser.add_argument("--families", help="optional JSONL {dataset_id,family_id}")
    parser.add_argument("--baseline")
    parser.add_argument("--seed", type=int, default=3901)
    parser.add_argument("--bootstrap-samples", type=int, default=10000)
    args = parser.parse_args(argv)
    names = ("queries", "runs", "mapping", "judge_a", "judge_b", "adjudication", "families")
    inputs = {name: getattr(args, name) for name in names}
    try:
        core._distinct_paths(inputs.values(), [args.output, args.csv])
        records = {name: core.read_jsonl(path) if path else None for name, path in inputs.items()}
        report = build_report(**records, seed=args.seed, bootstrap_samples=args.bootstrap_samples, baseline=args.baseline)
        report["evidence_files"] = {name: _file_hash(path) for name, path in inputs.items() if path}
        with open(args.output, "w", encoding="utf-8") as stream:
            json.dump(report, stream, sort_keys=True, ensure_ascii=False, indent=2, allow_nan=False)
            stream.write("\n")
        write_report_csv(args.csv, report)
    except (ValueError, OSError, TypeError) as exc:
        parser.error(str(exc))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
