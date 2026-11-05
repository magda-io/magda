#!/usr/bin/env python3
"""Objective/operational analysis; never assigns relevance grades.

Use with --queries, --anchors, --runs (repeatable), --output and
--rankings-output. Publishes IDs/scores/timings, not bulk catalogue metadata.
"""
import argparse
import hashlib
import json
import math
import pathlib
import statistics

BASELINE = "baseline"
CANDIDATE = "candidate_03_07"


def rows(path):
    return [json.loads(line) for line in pathlib.Path(path).read_text().splitlines() if line.strip()]


def percentile(values, quantile):
    values = sorted(values)
    position = (len(values) - 1) * quantile
    lo, hi = math.floor(position), math.ceil(position)
    return values[lo] + (values[hi] - values[lo]) * (position - lo)


def counts(value):
    """Canonical facet eligibility/count tree; ignore scored top-hit payloads."""
    if isinstance(value, dict):
        return {k: counts(v) for k, v in sorted(value.items()) if k not in ("topHits", "top_hits", "hits", "max_score", "meta")}
    if isinstance(value, list):
        result = [counts(v) for v in value]
        if result and all(isinstance(v, dict) and "key" in v for v in result):
            result.sort(key=lambda v: json.dumps(v["key"], sort_keys=True))
        return result
    return value


def differences(left, right, prefix=""):
    if isinstance(left, dict) and isinstance(right, dict):
        result = []
        for key in sorted(set(left) | set(right)):
            result.extend(differences(left.get(key), right.get(key), prefix + "/" + key))
        return result
    if left != right:
        return [{"path": prefix, "baseline": left, "candidate": right}]
    return []


def analyze(queries, anchors, runs):
    task = {q["id"]: q for q in queries}
    known = {a["query_id"]: set(a["dataset_ids"]) for a in anchors}
    indexed = {}
    for run in runs:
        key = (run["system"], run["query_id"])
        if key in indexed:
            raise ValueError("Duplicate system/query run")
        indexed[key] = run
    systems = sorted({r["system"] for r in runs})
    latency = {}
    objective = []
    fidelity = []
    stability = []
    for split in sorted({q["split"] for q in queries}):
        latency[split] = {}
        for system in systems:
            group = [r for r in runs if r["system"] == system and task[r["query_id"]]["split"] == split]
            samples = [v for r in group for v in r.get("latency_samples_ms", [])]
            latency[split][system] = {"tasks": len(group), "requests": len(samples),
                                      "median_ms": statistics.median(samples) if samples else None,
                                      "p95_ms": percentile(samples, .95) if len(samples) >= 100 else None,
                                      "p95_omission": None if len(samples) >= 100 else "fewer than 100 samples",
                                      "repeat_dependence": "repeated requests are correlated; not independent tasks"}
    for run in runs:
        qid, system = run["query_id"], run["system"]
        if qid in known:
            ranks = [h.get("rank", i + 1) for i, h in enumerate(run["hits"]) if h["id"] in known[qid]]
            rank = min(ranks) if ranks else None
            objective.append({"query_id": qid, "system": system, "split": task[qid]["split"],
                              "best_known_rank": rank, "success_at_5": int(rank is not None and rank <= 5),
                              "mrr_at_10": 1 / rank if rank is not None and rank <= 10 else 0})
        base = indexed.get((BASELINE, qid))
        if system.startswith("candidate_") and base:
            facet_diff = differences(counts(base.get("aggregations")), counts(run.get("aggregations")))
            fidelity.append({"query_id": qid, "system": system,
                             "same_total_hits": base.get("total_hits") == run.get("total_hits"),
                             "baseline_total": base.get("total_hits"), "candidate_total": run.get("total_hits"),
                             "facet_count_differences": facet_diff})
        if base:
            original = [h["id"] for h in base["hits"][:10]]
            current = [h["id"] for h in run["hits"][:10]]
            union = set(original) | set(current)
            stability.append({"query_id": qid, "system": system, "top10_jaccard_with_baseline": len(set(original) & set(current)) / len(union) if union else 1,
                              "same_leader_as_baseline": original[:1] == current[:1],
                              "repeat_ranking_and_score_variants": len(run.get("ranking_score_variants", [])),
                              "top10_ids": current})
    held = latency.get("heldout", {})
    b = held.get(BASELINE, {}).get("p95_ms")
    c = held.get(CANDIDATE, {}).get("p95_ms")
    budget = max(1.5 * b, b + 25) if b is not None else None
    summary = {}
    for split in sorted({q["split"] for q in queries}):
        summary[split] = {}
        for system in systems:
            group = [x for x in objective if x["system"] == system and x["split"] == split]
            summary[split][system] = {"tasks": len(group), "success_at_5": statistics.mean(x["success_at_5"] for x in group) if group else None,
                                     "mrr_at_10": statistics.mean(x["mrr_at_10"] for x in group) if group else None}
    return {"latency": latency, "latency_guard": {"baseline_heldout_p95_ms": b, "candidate_heldout_p95_ms": c, "budget_ms": budget, "passed": c <= budget if c is not None and budget is not None else None},
            "objective_known_answer_summary": summary, "objective_per_query": objective,
            "facet_and_total_count_fidelity": fidelity, "ranking_stability": stability,
            "limitations": ["No relevance grades are inferred from these operational checks.",
                            "Latency is local warmed OpenSearch HTTP only, excluding embedding/public API; samples are correlated repeats.",
                            "Count invariance is checked against the baseline, not against an independent full-corpus truth."]}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ("queries", "anchors", "output", "rankings-output"):
        p.add_argument("--" + name, required=True)
    p.add_argument("--runs", action="append", required=True)
    a = p.parse_args()
    runs = [r for path in a.runs for r in rows(path)]
    report = analyze(rows(a.queries), rows(a.anchors), runs)
    report["input_sha256"] = {path: hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest() for path in [a.queries, a.anchors] + a.runs}
    pathlib.Path(a.output).write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    compact = []
    for run in runs:
        item = {k: v for k, v in run.items() if k not in ("hits", "aggregations")}
        item["hits"] = [{k: v for k, v in hit.items() if k != "metadata"} for hit in run["hits"]]
        item["facet_counts_sha256"] = hashlib.sha256(json.dumps(counts(run.get("aggregations")), sort_keys=True).encode()).hexdigest()
        compact.append(item)
    pathlib.Path(a.rankings_output).write_text("".join(json.dumps(r, sort_keys=True) + "\n" for r in compact))


if __name__ == "__main__":
    main()
