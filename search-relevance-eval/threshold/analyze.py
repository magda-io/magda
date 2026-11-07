#!/usr/bin/env python3
"""Pure offline #3887 analysis. Never retrieves, embeds, generates or judges.

All inputs are explicit artifacts. Missing evidence yields D, never a safety pass.
The CLI hashes only paths explicitly named in its input manifest. Metric helpers
are reused from the existing harness; no normalization systems are implemented.
"""
import argparse
from collections import defaultdict
import datetime as dt
import hashlib
import importlib.util
import itertools
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


synthetic = _load("threshold_synthetic_metrics", ROOT / "synthetic/analyze.py")
core = synthetic.core
METRICS = ("recall_at_10_ge_2", "ndcg_at_10", "success_at_5_ge_2")
NEGATIVE = ("negative_unrelated", "negative_or_lookalike", "no_answer")
AMBIGUOUS = ("ambiguous_ungraded", "ambiguous")
BINDINGS = ("architecture", "corpora", "qrels", "validation", "vectors", "runtime",
            "dsl", "schedule", "receipts", "correctness", "eligibility", "native_scores", "legacy")


def default_gates():
    return json.loads((HERE / "decision-gates.json").read_text())


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                     allow_nan=False).encode()).hexdigest()


def _number(value, label, nullable=False):
    if nullable and value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(label + " must be finite numeric")
    return value


def _identifier(value, label):
    return core._identifier(value, label)


def _ids(values, label):
    if not isinstance(values, list) or any(not isinstance(v, str) or not v for v in values) or len(values) != len(set(values)):
        raise ValueError(label + " must enumerate unique IDs")
    return set(values)


def _sha(value):
    return isinstance(value, str) and len(value) == 64 and all(c in "0123456789abcdef" for c in value)


def _utc(value):
    if not isinstance(value, str):
        raise ValueError("UTC timestamp required")
    parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() != dt.timedelta(0):
        raise ValueError("UTC timestamp requires explicit zero offset")
    return parsed


def _mean(values):
    values = list(values)
    return core._mean(values) if values and all(v is not None for v in values) else None


def _system(threshold, gates):
    return next(s["id"] for s in gates["registered_systems"] if s["dataset_min_score"] == threshold)


def _key(row):
    return row.get("cohort", "NEW"), row["seed"], row["size"], row["query_id"]


def score_query(query, grades, run):
    """Full-corpus metrics, original ranks, strict U suppression, one new ratio."""
    if any(not synthetic._numeric(g) and g != "U" for g in grades.values()):
        raise ValueError("grade must be integer0..3 or U")
    kind = query["kind"]
    adapted = dict(query, kind="no_answer" if kind in NEGATIVE else "ambiguous" if kind in AMBIGUOUS else kind)
    hits = core._ranked_hits(run) if run is not None else []
    if any(h["id"] not in grades for h in hits):
        raise ValueError("unknown corpus ID; never unjudged0")
    for hit in hits:
        _number(hit.get("score"), "hit score", nullable=True)
    result = synthetic._score(adapted, grades, run, suppress_unknown=True)
    positives = sorted(did for did, g in grades.items() if synthetic._numeric(g) and g >= 2)
    recovered = sorted(h["id"] for h in hits if h["rank"] <= 10 and h["id"] in positives)
    uncertain = "U" in grades.values()
    semantic = kind in ("semantic", "functional")
    ratio = len(recovered) / len(positives) if positives and run is not None else None
    result.update(useful_positive_ids=positives, useful_positive_denominator=len(positives),
                  retrieved_useful_ids=recovered, recall_at_10_ge_2=ratio if semantic and not uncertain else None,
                  descriptive_known_positive_recall=ratio if semantic and uncertain else None,
                  full_recall_available=semantic and not uncertain and bool(positives) and run is not None)
    for k in (5, 10):
        zero = sorted(h["id"] for h in hits if h["rank"] <= k and grades[h["id"]] == 0)
        one = sorted(h["id"] for h in hits if h["rank"] <= k and grades[h["id"]] == 1)
        result[f"known_grade0_ids_top{k}"] = zero
        result[f"grade0_count_top{k}"] = len(zero) if run is not None and not uncertain else None
        result[f"grade1_ids_top{k}"] = one
    return result


def normalize_run_labels(records, mapping=None):
    """Explicit audited source-label conversion; no arbitrary system aliases."""
    mapping = {} if mapping is None else dict(mapping)
    if mapping not in ({}, {"topk10diag": "topk10"}):
        raise ValueError("only explicit registered topk10diag->topk10 conversion allowed")
    labels = {r.get("system") for r in records}
    if "topk10diag" in labels and "topk10" in labels:
        raise ValueError("duplicate source/canonical topk aliases in one artifact")
    if "topk10diag" in labels and not mapping:
        raise ValueError("topk source label requires explicit mapping")
    converted = [dict(row, system=mapping.get(row.get("system"), row.get("system"))) for row in records]
    return converted, dict(mapping=mapping, raw_payload_sha256=digest(records),
                           canonical_payload_sha256=digest(converted),
                           converted_rows=sum(r.get("system") in mapping for r in records))


def _queries(records, intents=()):
    intent_map = {}
    for intent in intents:
        iid = _identifier(intent.get("intent_id"), "intent ID")
        if iid in intent_map:
            raise ValueError("duplicate intent")
        intent_map[iid] = intent
    result, splits = {}, {}
    for source in records:
        iid = _identifier(source.get("intent_id"), "intent ID")
        row = {**intent_map.get(iid, {}), **source}
        qid = _identifier(row.get("id"), "query ID")
        if qid in result:
            raise ValueError("duplicate query ID")
        if row.get("kind") not in ("semantic", "functional", "exact", *NEGATIVE, *AMBIGUOUS):
            raise ValueError("unknown query kind")
        if row.get("split") not in ("development", "heldout", "diagnostic"):
            raise ValueError("unknown query split")
        group = row.get("split_group", iid)
        if splits.setdefault(group, row["split"]) != row["split"]:
            raise ValueError("whole family/cluster must share split")
        if row["kind"] == "exact":
            targets = _ids(row.get("authoritative_target_ids"), "authoritative targets")
            if not targets:
                raise ValueError("exact target set empty")
            near = _ids(row.get("near_identifier_ids", []), "near identifiers")
            if near & targets:
                raise ValueError("near-ID overlaps target")
        result[qid] = row
    if not result:
        raise ValueError("queries empty")
    return result


def _prepare(queries, qrels, runs, corpora, *, intents=()):
    query_map = _queries(queries, intents)
    catalog = {}
    for row in corpora:
        key = row.get("cohort", "NEW"), row["seed"], row["size"]
        if type(row["seed"]) is not int or type(row["size"]) is not int or row["size"] < 1:
            raise ValueError("invalid seed/size")
        ids = _ids(row["ids"], "corpus IDs")
        if key in catalog or len(ids) != row["size"]:
            raise ValueError("duplicate corpus or size mismatch")
        core_ids = _ids(row.get("core_ids", row["ids"]), "core IDs")
        if not core_ids <= ids:
            raise ValueError("core IDs outside corpus")
        catalog[key] = dict(row, ids=ids, core_ids=core_ids)
    if not catalog:
        raise ValueError("corpus descriptors empty")
    grades = {(cohort, seed, size, qid): {} for cohort, seed, size in catalog for qid in query_map}
    for row in qrels:
        key = _key(row)
        did, grade = row["dataset_id"], row["grade"]
        if key not in grades or did not in catalog[key[:3]]["ids"]:
            raise ValueError("qrel outside declared corpus/query")
        if did in grades[key] or (not synthetic._numeric(grade) and grade != "U"):
            raise ValueError("duplicate qrel or invalid grade")
        grades[key][did] = grade
    for key, values in grades.items():
        if set(values) != catalog[key[:3]]["ids"]:
            raise ValueError("full explicit corpus qrels required; missing is not0")
        query = query_map[key[3]]
        if query["kind"] == "ambiguous_ungraded" and any(g != "U" for g in values.values()):
            raise ValueError("ambiguity must remain deliberately allU")
        if query["kind"] in NEGATIVE and any(synthetic._numeric(g) and g != 0 for g in values.values()):
            raise ValueError("registered all-zero negative has numeric nonzero")
        if query["kind"] == "exact":
            targets = set(query["authoritative_target_ids"])
            if not targets <= set(values) or ("U" not in values.values() and
                (targets != {d for d, g in values.items() if g == 3} or any(g not in (0, 3) for g in values.values()))):
                raise ValueError("exact identity/qrel mismatch")
    indexed = {}
    for source in runs:
        row = dict(source, cohort=source.get("cohort", "NEW"))
        key = _key(row)
        system = _identifier(row.get("system"), "system")
        if key not in grades or (*key, system) in indexed:
            raise ValueError("unknown or duplicate run")
        if row.get("timed_out") or row.get("shards", {}).get("failed", 0):
            raise ValueError("incomplete engine run")
        score_query(query_map[key[3]], grades[key], row)
        indexed[(*key, system)] = row
    return query_map, catalog, grades, indexed


def _rows(query_map, grades, indexed, systems):
    result = []
    for key, values in sorted(grades.items()):
        query = query_map[key[3]]
        for system in systems:
            result.append(dict(cohort=key[0], seed=key[1], size=key[2], query_id=key[3],
                               intent_id=query["intent_id"], kind=query["kind"], split=query["split"],
                               system=system, **score_query(query, values, indexed.get((*key, system)))))
    return result


def _families(rows):
    groups = defaultdict(list)
    for row in rows:
        if row["kind"] in ("semantic", "functional"):
            groups[(row["cohort"], row["seed"], row["size"], row["system"], row["split"], row["intent_id"])].append(row)
    result = []
    for key, members in sorted(groups.items()):
        complete = all(r["run_present"] for r in members)
        result.append(dict(zip(("cohort", "seed", "size", "system", "split", "intent_id"), key),
                           query_ids=[r["query_id"] for r in members], complete=complete,
                           **{m: _mean(r[m] for r in members) if complete else None for m in METRICS}))
    return result


def exact_events(query, baseline, candidate):
    """Every target, not best target. Missing ranks are censored/infinite."""
    if baseline is None or candidate is None:
        return None
    left = {h["id"]: h["rank"] for h in core._ranked_hits(baseline) if h["rank"] <= 10}
    right = {h["id"]: h["rank"] for h in core._ranked_hits(candidate) if h["rank"] <= 10}
    events = []
    for target in query["authoritative_target_ids"]:
        b, c = left.get(target), right.get(target)
        if b is not None and (c is None or c > b):
            events.append(dict(type="target_displacement", target_id=target, baseline_rank=b, candidate_rank=c))
        for near in query.get("near_identifier_ids", []):
            if near in right and near not in left and (c is None or right[near] < c):
                events.append(dict(type="new_wrong_ID_ahead", target_id=target, wrong_id=near,
                                   candidate_rank=c, wrong_rank=right[near]))
    return events


def _check(checks, name, value, limit, *, minimum=True, category="performance", **identity):
    passed = None if value is None else value >= limit - 1e-12 if minimum else value <= limit + 1e-12
    checks.append(dict(identity, name=name, value=value, limit=limit, minimum=minimum, passed=passed, category=category))


def _contrasts(rows, families, query_map, indexed, gates, split, candidates, development=False):
    checks, summaries, exposures, blockers = [], [], [], []
    base = gates["baseline"]
    shared, fp = gates["shared_safe_useful_gate"], gates["false_positive_limits"]
    rowmap = {(*_key(r), r["system"]): r for r in rows}
    fam = {(r["seed"], r["size"], r["system"], r["intent_id"]): r for r in families if r["split"] == split}
    semantic = [q for q in query_map.values() if q["split"] == split and q["kind"] == "semantic"]
    negatives = [q for q in query_map.values() if q["split"] == split and q["kind"] in NEGATIVE]
    for system, seed, size in itertools.product(candidates, gates["seeds"], gates["catalog_sizes"]):
        identity = dict(system=system, seed=seed, size=size, split=split)
        ids = sorted({q["intent_id"] for q in semantic})
        deltas, aggregate = {}, {}
        recovered = set()
        for iid in ids:
            left, right = fam.get((seed, size, base, iid)), fam.get((seed, size, system, iid))
            deltas[iid] = {m: right[m] - left[m] if left and right and left[m] is not None and right[m] is not None else None for m in METRICS}
            for metric, gatekey in ((METRICS[0], "minimum_each_family_recall10_delta"),
                                    (METRICS[1], "minimum_each_family_ndcg_delta"),
                                    (METRICS[2], "minimum_each_family_success5_delta")):
                _check(checks, "family_" + metric + ":" + iid, deltas[iid][metric], shared[gatekey], **identity)
        for metric in METRICS:
            aggregate[metric] = _mean(d[metric] for d in deltas.values())
        for query in semantic:
            key = ("NEW", seed, size, query["id"])
            b, c = rowmap.get((*key, base)), rowmap.get((*key, system))
            if b and c and b["run_present"] and c["run_present"] and set(c["retrieved_useful_ids"]) - set(b["retrieved_useful_ids"]):
                recovered.add(query["intent_id"])
        gain_size = size in shared["utility_gain_catalog_sizes"]
        dev = gates["safer_C_development_selection"]
        recall_floor = (dev["minimum_DEV_useful_recall_delta_growth"] if gain_size else dev["core60_minimum_DEV_useful_recall_delta"]) if development else (shared["minimum_useful_recall_delta_vs_050"] if gain_size else shared["core60_minimum_useful_recall_delta_vs_050"])
        recovery_floor = (dev["minimum_DEV_recovered_families_each_growth_size"] if gain_size else dev["core60_minimum_DEV_recovered_families"]) if development else (shared["minimum_recovered_heldout_semantic_families_each_seed_and_utility_size"] if gain_size else shared["core60_minimum_recovered_families"])
        _check(checks, "aggregate_recall", aggregate[METRICS[0]], recall_floor, **identity)
        _check(checks, "recovered_families", len(recovered) if aggregate[METRICS[0]] is not None else None, recovery_floor, **identity)
        _check(checks, "aggregate_ndcg", aggregate[METRICS[1]], shared["minimum_aggregate_ndcg_delta"], **identity)
        _check(checks, "aggregate_success5", aggregate[METRICS[2]], shared["minimum_aggregate_success5_delta"], **identity)
        summaries.append(dict(identity, paired_deltas=aggregate, per_family_deltas=deltas, recovered_families=sorted(recovered)))
        for query in query_map.values():
            # Held confirmation includes DEV exact controls too.
            if query["kind"] != "exact" or (development and query["split"] != split):
                continue
            key = ("NEW", seed, size, query["id"])
            events = exact_events(query, indexed.get((*key, base)), indexed.get((*key, system)))
            _check(checks, "exact:" + query["id"], len(events) if events is not None else None, 0, minimum=False, category="exact", **identity)
            blockers.extend(dict(identity, query_id=query["id"], **event) for event in events or [])
        current = []
        for query in semantic + negatives:
            key = ("NEW", seed, size, query["id"])
            b, c = rowmap.get((*key, base)), rowmap.get((*key, system))
            exposed = dict(identity, query_id=query["id"], kind=query["kind"])
            for k in (5, 10):
                valid = b and c and b[f"grade0_count_top{k}"] is not None and c[f"grade0_count_top{k}"] is not None
                new = sorted(set(c[f"known_grade0_ids_top{k}"]) - set(b[f"known_grade0_ids_top{k}"])) if valid else None
                exposed[f"new_grade0_ids_top{k}"] = new
                exposed[f"new_grade0_top{k}"] = len(new) if new is not None else None
                exposed[f"baseline_grade0_top{k}"] = b[f"grade0_count_top{k}"] if b else None
                exposed[f"candidate_grade0_top{k}"] = c[f"grade0_count_top{k}"] if c else None
            current.append(exposed)
            if query["kind"] == "semantic":
                for field, suffix in (("hard_negative_ids", "hard_negative"), ("or_control_ids", "OR_control")):
                    new = exposed["new_grade0_ids_top5"]
                    value = len(set(new) & set(query.get(field, []))) if new is not None else None
                    _check(checks, "new_" + suffix + ":" + query["id"], value,
                           fp["new_named_hard_negative_top5_each_query_max" if suffix == "hard_negative" else "new_unrelated_OR_control_top5_each_query_max"], minimum=False, **identity)
        exposures.extend(current)
        for kind, members in (("semantic", [r for r in current if r["kind"] == "semantic"]),
                              ("negative", [r for r in current if r["kind"] in NEGATIVE])):
            for k in ((5, 10) if kind == "semantic" else (10,)):
                prefix = "semantic" if kind == "semantic" else "heldout_negative"
                _check(checks, f"{kind}_new_top{k}_mean", _mean(r[f"new_grade0_top{k}"] for r in members), fp[f"{prefix}_new_grade0_top{k}_mean_max"], minimum=False, **identity)
                for row in members:
                    _check(checks, f"{kind}_new_top{k}:" + row["query_id"], row[f"new_grade0_top{k}"], fp[f"{prefix}_new_grade0_top{k}_each_query_max"], minimum=False, **identity)
        for kind, prefix in (("negative_unrelated", "heldout_unrelated_negative"), ("negative_or_lookalike", "heldout_OR_lookalike_negative")):
            members = [r for r in current if r["kind"] == kind]
            _check(checks, kind + "_top5_mean", _mean(r["new_grade0_top5"] for r in members), fp[prefix + "_new_grade0_top5_mean_max"], minimum=False, **identity)
            for row in members:
                _check(checks, kind + "_top5:" + row["query_id"], row["new_grade0_top5"], fp[prefix + "_new_grade0_top5_each_query_max"], minimum=False, **identity)
    # Growth differences concern the treatment contrast, NOT absolute crowding.
    smap = {(s["system"], s["seed"], s["size"]): s for s in summaries}
    emap = {(e["system"], e["seed"], e["size"], e["query_id"]): e for e in exposures}
    for system, seed, size in itertools.product(candidates, gates["seeds"], shared["utility_gain_catalog_sizes"]):
        identity = dict(system=system, seed=seed, size=size, split=split)
        b, c = smap[system, seed, 60], smap[system, seed, size]
        for metric, limit in ((METRICS[0], shared["maximum_paired_recall10_delta_drop_growth_vs_core60"]),
                              (METRICS[1], shared["maximum_paired_ndcg10_delta_drop_growth_vs_core60"])):
            x, y = b["paired_deltas"][metric], c["paired_deltas"][metric]
            _check(checks, "paired_growth_" + metric, y - x if x is not None and y is not None else None, -limit, **identity)
        for name, members in (("semantic", semantic), ("negative", negatives)):
            changes = []
            for query in members:
                x = emap[system, seed, 60, query["id"]]["new_grade0_top10"]
                y = emap[system, seed, size, query["id"]]["new_grade0_top10"]
                change = y - x if x is not None and y is not None else None
                changes.append(change)
                _check(checks, "incremental_FP_growth:" + query["id"], change, fp["growth_incremental_new_grade0_top10_each_query_increase_vs_core60_max"], minimum=False, **identity)
            _check(checks, name + "_incremental_FP_growth_mean", _mean(changes), fp["growth_incremental_new_grade0_top10_mean_increase_vs_core60_max"], minimum=False, **identity)
    return checks, summaries, exposures, blockers


def latency_summary(samples, *, expected_queries, repetitions=10, min_samples=100):
    core._latencies(samples)  # Validate all numeric samples, even excluded ones.
    observed = {r["query_id"] for r in samples}
    complete = observed == set(expected_queries) and len(samples) == len(expected_queries) and all(
        r.get("warmup") is False and r.get("latency_scope") == "local_warmed" and
        len(r.get("latency_samples_ms", [])) == repetitions for r in samples)
    values = [v for r in samples for v in r.get("latency_samples_ms", [])]
    return dict(core._timing_summary(values), complete=complete, expected_queries=sorted(expected_queries),
                guard_eligible=complete and len(values) >= min_samples,
                repeat_dependence="correlated repeated requests, not independent statistical proof")


def _latency(indexed, query_map, gates, systems):
    summaries, checks = [], []
    def group(q, name):
        held, dev = q["split"] == "heldout", q["split"] == "development"
        return {"heldout_semantic": held and q["kind"] == "semantic",
                "combined_heldout_positive": held and q["kind"] in ("semantic", "exact"),
                "all_validated_negative_queries": q["kind"] in NEGATIVE,
                "heldout_exact": held and q["kind"] == "exact",
                "development_positive": dev and q["kind"] in ("semantic", "exact"),
                "heldout_negative": held and q["kind"] in NEGATIVE,
                "development_semantic": dev and q["kind"] == "semantic"}[name]
    spec = gates["latency"]
    for seed, size, name in itertools.product(gates["seeds"], gates["catalog_sizes"], (*spec["gate_groups"], *spec["descriptive_groups"])):
        expected = {qid for qid, q in query_map.items() if group(q, name)}
        by_system = {}
        for system in systems:
            selected = [r for (cohort, s, n, qid, sy), r in indexed.items() if cohort == "NEW" and (s, n, sy) == (seed, size, system) and qid in expected]
            row = dict(seed=seed, size=size, system=system, group=name, **latency_summary(selected, expected_queries=expected,
                       repetitions=spec["measured_repetitions_per_query_system_seed_size"], min_samples=spec["minimum_samples_per_p95_group_system_seed_size"]))
            row["guard_eligible"] = row["guard_eligible"] and name in spec["gate_groups"]
            summaries.append(row)
            by_system[system] = row
        baseline = by_system[gates["baseline"]]
        if name in spec["gate_groups"]:
            for system in systems:
                current = by_system[system]
                budget = max(1.5 * baseline["p95_ms"], baseline["p95_ms"] + 25) if baseline["guard_eligible"] else None
                _check(checks, "latency:" + name, current["p95_ms"] if current["guard_eligible"] else None,
                       budget if budget is not None else 0, minimum=False, system=system, seed=seed, size=size, category="latency")
    return summaries, checks


def validate_bindings(bindings, required=BINDINGS):
    """Pure closure check. CLI supplies independently read observed hashes."""
    problems = []
    for name in required:
        row = (bindings or {}).get(name, {})
        if not _sha(row.get("expected_sha256")) or row.get("observed_sha256") != row.get("expected_sha256"):
            problems.append("missing/stale source binding: " + name)
        try:
            path = Path(row["path"])
            if not path.is_absolute():
                raise ValueError("source binding path must be resolved absolute by loader")
            hasher = hashlib.sha256()
            with path.open("rb") as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    hasher.update(block)
            if hasher.hexdigest() != row.get("expected_sha256"):
                problems.append("actual source bytes changed:" + name)
        except (OSError, KeyError, ValueError) as error:
            problems.append("unread source binding:" + name + ":" + str(error))
    return problems


def payload_problems(evidence, **payload):
    """Bind in-memory objects as well as separately hashed source-file bytes."""
    expected = evidence.get("input_sha256", {})
    problems = ["unbound in-memory input:" + name for name, value in payload.items()
                if expected.get(name) != digest(value)]
    sources = evidence.get("argument_files", {})
    for name, value in payload.items():
        # Optional empty arguments need not invent a source file.
        if value is None or value == () or value == [] or value == {}:
            continue
        if name not in sources:
            problems.append("missing independently loaded argument source:" + name)
            continue
        try:
            loaded = load_argument_source(sources[name], evidence.get("source_base", "."))
            if digest(loaded) != digest(value):
                problems.append("argument differs from actual source payload:" + name)
        except (OSError, KeyError, ValueError, TypeError) as error:
            problems.append("argument source rejected:" + name + ":" + str(error))
    return problems


def load_argument_source(spec, base=Path(".")):
    """Read declared bytes, check SHA, apply only a named lossless adapter."""
    if isinstance(spec, list):
        result = []
        for part in spec:
            rows = load_argument_source(part, base)
            if not isinstance(rows, list):
                raise ValueError("multipart source must contain record arrays")
            result.extend(rows)
        return result
    path = (Path(base) / spec["path"]).resolve()
    raw = path.read_bytes()
    if not _sha(spec.get("sha256")) or hashlib.sha256(raw).hexdigest() != spec["sha256"]:
        raise ValueError("actual source-file SHA mismatch")
    if spec.get("format") == "jsonl":
        value = [json.loads(line) for line in raw.decode("utf8").splitlines() if line.strip()]
    elif spec.get("format") == "json":
        value = json.loads(raw)
    else:
        raise ValueError("source format must be json or jsonl")
    projection = spec.get("projection", "identity")
    if projection == "legacy_qrels_v1":
        if not isinstance(value, list):
            raise ValueError("legacy qrels source must be rows")
        value = [dict(row, cohort="LEGACY", size=180) for row in value]
    elif projection != "identity":
        raise ValueError("unknown source projection (arbitrary transforms forbidden)")
    return value


def verify_bindings(bindings, base=Path(".")):
    """Read only explicitly listed source paths; no directory discovery."""
    result = {}
    for name, source in bindings.items():
        path = (Path(base) / source["path"]).resolve()
        row = dict(source, path=str(path))
        hasher = hashlib.sha256()
        with path.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                hasher.update(block)
        row["observed_sha256"] = hasher.hexdigest()
        result[name] = row
    return result


def _native_index(records):
    indexed = {}
    for row in records:
        key = (*_key(row), row["dataset_id"])
        if key in indexed:
            raise ValueError("duplicate native score pair")
        if row.get("source") != "engine_exact_docvalues_l2":
            raise ValueError("native score source must be declared exact engine L2")
        for field in ("root_projection_sha256", "query_vector_sha256"):
            if not _sha(row.get(field)):
                raise ValueError("native projection/vector hashes required")
        root = _number(row.get("root_score"), "native root", nullable=True)
        children, child_ids, offsets = [], set(), set()
        for child in row.get("children", []):
            did = _identifier(child.get("distribution_id"), "distribution ID")
            offset = child.get("offset")
            if did in child_ids or type(offset) is not int or offset < 0 or offset in offsets or type(child.get("allowed")) is not bool:
                raise ValueError("native child identity/offset/authorization invalid")
            child_ids.add(did)
            offsets.add(offset)
            value = _number(child.get("score"), "native child", nullable=True)
            if child["allowed"] and value is not None:
                children.append(value)
        maximum = max(children) if children else None
        if row.get("max_child_score") != maximum:
            raise ValueError("max child differs from all authorized child scores")
        if any(v is not None and not 0 <= v <= 1 for v in (root, maximum)):
            raise ValueError("native L2 score outside[0,1]")
        indexed[key] = row
    return indexed


def opportunity(native_scores, fixed_pairs, query_map, catalog, grades, gates, branch_evidence=()):
    """All predeclared useful pairs, same-scope evidence-bearing quotas."""
    native = _native_index(native_scores)
    evidence = {}
    for row in branch_evidence:
        key = (row.get("cohort", "NEW"), row["seed"], row["query_id"], row["dataset_id"], row["branch"])
        if key in evidence:
            raise ValueError("duplicate branch evidence")
        evidence[key] = row
    spec = gates["coverage_opportunity"]
    pairs, summaries = [], []
    held = [p for p in fixed_pairs if p.get("split", query_map[p["query_id"]]["split"]) == "heldout"]
    keys = [(p["query_id"], p.get("record_id", p.get("dataset_id"))) for p in held]
    if len(keys) != len(set(keys)):
        raise ValueError("duplicate fixed opportunity pair")
    for seed in gates["seeds"]:
        counts = dict(band=0, narrow=0, root=0, nested=0)
        families, missing = set(), []
        expected = {(qid, did) for (cohort, s, size, qid), values in grades.items()
                    if cohort == "NEW" and s == seed and size == 60 and query_map[qid]["kind"] == "semantic" and query_map[qid]["split"] == "heldout"
                    for did, g in values.items() if synthetic._numeric(g) and g >= 2}
        if set(keys) != expected:
            missing.append("fixed pair inventory differs from all held useful core pairs")
        for pair in held:
            qid, did = pair["query_id"], pair.get("record_id", pair.get("dataset_id"))
            query = query_map[qid]
            row = native.get(("NEW", seed, 60, qid, did))
            if row is None:
                missing.append(qid + "/" + did)
                continue
            root, child = row["root_score"], row["max_child_score"]
            broad = any(v is not None and spec["inclusive_band"][0] <= v <= spec["inclusive_band"][1] for v in (root, child))
            narrow = any(v is not None and spec["opportunity_interval_lower_inclusive_upper_exclusive"][0] <= v < spec["opportunity_interval_lower_inclusive_upper_exclusive"][1] for v in (root, child))
            counts["band"] += broad
            counts["narrow"] += narrow
            if narrow:
                families.add(query["intent_id"])
            scope = pair.get("evidence_bearing_scope")
            ev = evidence.get(("NEW", seed, qid, did, scope), {})
            certified = (ev.get("supports_dataset_grade") is True or ev.get("complete_for_query") is True) and bool(ev.get("evidence_refs"))
            value = root if scope == "root" else child if scope == "nested" else None
            scope_narrow = certified and value is not None and spec["opportunity_interval_lower_inclusive_upper_exclusive"][0] <= value < spec["opportunity_interval_lower_inclusive_upper_exclusive"][1]
            if not certified:
                missing.append("branch evidence:" + qid + "/" + did)
            if scope_narrow:
                counts[scope] += 1
            pairs.append(dict(seed=seed, query_id=qid, dataset_id=did, dataset_grade=grades["NEW", seed, 60, qid][did],
                              root_score=root, max_child_score=child, broad_band=broad, narrow_band=narrow,
                              evidence_bearing_scope=scope, scope_in_narrow=scope_narrow, branch_evidence_complete=certified))
        adequate = not missing and counts["band"] >= spec["minimum_heldout_pairs_in_band_per_seed"] and counts["narrow"] >= spec["minimum_heldout_pairs_in_opportunity_per_seed"] and len(families) >= spec["minimum_heldout_families_with_opportunity_per_seed"] and counts["root"] >= spec["minimum_opportunity_pairs_root_measurement_evidence_per_seed"] and counts["nested"] >= spec["minimum_opportunity_pairs_nested_measurement_evidence_per_seed"]
        summaries.append(dict(seed=seed, expected_pairs=len(expected), **counts, families=sorted(families), missing=missing, adequate=adequate))
    return dict(per_pair=pairs, per_seed=summaries, adequate=bool(summaries) and all(s["adequate"] for s in summaries))


def native_inventory_problems(native, vector_inventory, grades):
    inventory, problems = {}, []
    for row in vector_inventory:
        key = (row.get("cohort", "NEW"), row["seed"], row["size"], row["dataset_id"])
        if key in inventory:
            raise ValueError("duplicate independently validated vector inventory")
        inventory[key] = row
    for key, values in grades.items():
        for did in values:
            score = native.get((*key, did))
            inv = inventory.get((*key[:3], did))
            if not inv or not score:
                problems.append(dict(key=list(key), dataset_id=did, reason="C vector inventory/exact score unavailable"))
                continue
            children = {(c["distribution_id"], c["offset"]): c for c in score.get("children", []) if c["allowed"]}
            expected = {(c["distribution_id"], c["offset"]): c for c in inv.get("children", []) if c.get("allowed") is True}
            if set(children) != set(expected) or "root" not in inv:
                problems.append(dict(key=list(key), dataset_id=did, reason="native child/root scope inventory incomplete"))
                continue
            scopes = [(score.get("root_score"), score, inv["root"])] + [(children[k].get("score"), children[k], expected[k]) for k in expected]
            if any(value is None or not _sha(source.get("projection_sha256", source.get("root_projection_sha256"))) or
                   not _sha(truth.get("projection_sha256")) or
                   source.get("projection_sha256", source.get("root_projection_sha256")) != truth.get("projection_sha256") or
                   type(truth.get("dimension")) is not int or truth["dimension"] < 1 or
                   source.get("dimension") != truth["dimension"] for value, source, truth in scopes):
                problems.append(dict(key=list(key), dataset_id=did, reason="exact vector scope score/hash/dimension evidence missing"))
    return problems


def eligibility_attribution(eligibility, native_scores, query_map, catalog, grades, indexed, gates, vector_inventory=()):
    """Full actual eligibility, separate exact geometry and topK rank exposures."""
    native = _native_index(native_scores)
    memberships, missing, rows = {}, native_inventory_problems(native, vector_inventory,
        {key: value for key, value in grades.items() if query_map[key[3]]["kind"] not in AMBIGUOUS}), []
    for row in eligibility:
        key = (*_key(row), row["system"])
        if key in memberships or key[:4] not in grades:
            raise ValueError("duplicate/unknown eligibility key")
        ids = catalog[key[:3]]["ids"]
        parsed = {}
        for field in ("keyword_ids", "hybrid_ids", "root_vector_ids", "nested_vector_ids"):
            parsed[field] = _ids(row[field], field) if field in row else None
            if parsed[field] is not None and not parsed[field] <= ids:
                raise ValueError("eligibility contains unknown IDs")
        parsed["complete"] = row.get("complete") is True and row.get("source_primary_top10_subset") is True and _sha(row.get("request_sha256")) and all(parsed[field] is not None for field in ("keyword_ids", "hybrid_ids", "root_vector_ids", "nested_vector_ids"))
        run = indexed.get(key)
        if run is not None and parsed["hybrid_ids"] is not None and not {h["id"] for h in core._ranked_hits(run) if h["rank"] <= 10} <= parsed["hybrid_ids"]:
            raise ValueError("primary top10 not subset of full hybrid eligibility")
        memberships[key] = parsed
    systems = [s["id"] for s in gates["registered_systems"]]
    thresholds = {s["id"]: s["dataset_min_score"] for s in gates["registered_systems"]}
    for key, values in grades.items():
        if query_map[key[3]]["kind"] in AMBIGUOUS:
            continue
        baseline = memberships.get((*key, gates["baseline"]))
        for system in systems:
            current = memberships.get((*key, system))
            if not baseline or not current or not baseline["complete"] or not current["complete"]:
                missing.append(dict(key=list(key), system=system, reason="FULL actual membership unavailable"))
                continue
            if current["keyword_ids"] != baseline["keyword_ids"]:
                raise ValueError("keyword membership changed across thresholds")
            run = indexed.get((*key, system))
            base_run = indexed.get((*key, gates["baseline"]))
            top = {h["id"]: h["rank"] for h in core._ranked_hits(run)} if run else {}
            btop = {h["id"]: h["rank"] for h in core._ranked_hits(base_run)} if base_run else {}
            for did, grade in values.items():
                score = native.get((*key, did))
                if score is None or score["root_score"] is None:
                    missing.append(dict(key=list(key), dataset_id=did, system=system, reason="exact native pair unavailable"))
                    continue
                if grade != 0:
                    continue
                s = thresholds[system]
                root = score["root_score"]
                nested = score["max_child_score"]
                new_native_root = root >= s and root < .50
                new_native_child = nested is not None and nested >= s and nested < .50
                admission = did in current["hybrid_ids"] and did not in baseline["hybrid_ids"]
                exposure = did in top and top[did] <= 10 and (did not in btop or btop[did] > 10)
                if admission or exposure or new_native_root or new_native_child:
                    rows.append(dict(cohort=key[0], seed=key[1], size=key[2], query_id=key[3], system=system, dataset_id=did,
                                     dataset_grade=0, keyword_eligible=did in current["keyword_ids"], baseline_hybrid_eligible=did in baseline["hybrid_ids"],
                                     candidate_hybrid_eligible=did in current["hybrid_ids"], newly_admitted_hybrid=admission,
                                     new_top10_exposure=exposure, new_native_root_eligibility=new_native_root,
                                     new_native_nested_eligibility=new_native_child, candidate_rank=top.get(did),
                                     root_score=root, max_child_score=nested,
                                     actual_root_vector_member=None if current["root_vector_ids"] is None else did in current["root_vector_ids"],
                                     actual_nested_vector_member=None if current["nested_vector_ids"] is None else did in current["nested_vector_ids"]))
    return dict(available=not missing, missing=missing, events=rows,
                note="Native cutoff crossing, actual hybrid admission, keyword overlap and rank exposure are distinct; no branch-local relevance labels inferred")


def score_distributions(native_scores, grades, query_map, bins=50):
    """Fixed[0,1] hist/CDF conditioned on DATASET grade, never branch qrels."""
    groups = defaultdict(list)
    for key, row in _native_index(native_scores).items():
        pairkey, did = key[:4], key[4]
        if pairkey not in grades or did not in grades[pairkey]:
            raise ValueError("native score outside declared query/corpus")
        query = query_map[key[3]]
        grade = grades[pairkey][did]
        for branch, value in (("root", row["root_score"]), ("max_authorized_child", row["max_child_score"])):
            groups[(key[0], key[1], key[2], query["kind"], query["split"], str(grade), branch)].append(value)
    result = []
    edges = [i / bins for i in range(bins + 1)]
    for key, all_values in sorted(groups.items()):
        values = [v for v in all_values if v is not None]
        counts = [0] * bins
        for value in values:
            counts[min(int(value * bins), bins - 1)] += 1
        n = len(values)
        result.append(dict(zip(("cohort", "seed", "size", "query_kind", "split", "dataset_grade", "score_path"), key),
                           n=n, missing=len(all_values) - n, minimum=min(values) if n else None,
                           maximum=max(values) if n else None, mean=core._mean(values),
                           bin_edges=edges, bin_counts=counts,
                           conditional_density=[count * bins / n for count in counts] if n else None,
                           cdf=[dict(score=edge, fraction=sum(v <= edge for v in values) / n if n else None) for edge in edges],
                           label_policy="Dataset-level relevance joined to native branch scores; NOT independently graded branch utility"))
    return result


def legacy_sensitivity(queries, qrels, runs, corpora, *, systems, baseline="ms_050", max_scenarios=4096, uncertainty_domains=()):
    """Correlated U assignments; original qrels unchanged, full IDCG each time."""
    qm, catalog, grades, indexed = _prepare(queries, qrels, runs, corpora)
    results, domains = [], {}
    for row in uncertainty_domains:
        qid = row["query_id"]
        key = row["seed"], qm[qid]["intent_id"], row["dataset_id"]
        values = row.get("allowed_grades", [0, 1, 2, 3])
        if not values or any(not synthetic._numeric(g) for g in values) or len(set(values)) != len(values):
            raise ValueError("invalid independently audited uncertainty grade domain")
        if key in domains and domains[key] != values:
            raise ValueError("shared uncertainty unit has inconsistent grade domains")
        domains[key] = values
    for cohort, seed, size in catalog:
        units = sorted({(qm[qid]["intent_id"], did) for (c, s, n, qid), values in grades.items()
                        if (c, s, n) == (cohort, seed, size) for did, g in values.items() if g == "U" and qm[qid]["kind"] != "ambiguous_ungraded"})
        if not units:
            continue
        allowed = [domains.get((seed, *unit), [0, 1, 2, 3]) for unit in units]
        count = math.prod(len(values) for values in allowed)
        item = dict(cohort=cohort, seed=seed, size=size, units=[list(u) for u in units], allowed_grades=allowed, scenario_count=count,
                    cross_size_assignment="Same seed/intent/dataset assignment reused at every size; only original U query rows replaced in scenarios", 
                    interpretation="assumption-dependent full-IDCG/recall sensitivity, never validated point relevance")
        if count > max_scenarios:
            results.append(dict(item, status="not_enumerated", scenarios=[], reason="fixed scenario cap exceeded"))
            continue
        scenarios = []
        for assignment in itertools.product(*allowed):
            assumed = dict(zip(units, assignment))
            resolved = {key: {did: assumed[qm[key[3]]["intent_id"], did] if g == "U" and (qm[key[3]]["intent_id"], did) in assumed else g for did, g in values.items()}
                        for key, values in grades.items() if key[:3] == (cohort, seed, size)}
            rows = _rows(qm, resolved, indexed, systems)
            families = _families(rows)
            summaries = []
            for split, system in itertools.product(sorted({q["split"] for q in qm.values()}), systems):
                fs = [r for r in families if r["split"] == split and r["system"] == system]
                summaries.append(dict(split=split, system=system, **{m: _mean(r[m] for r in fs) for m in METRICS}))
            contrasts = []
            for split in sorted({q["split"] for q in qm.values()}):
                b = next(r for r in summaries if r["split"] == split and r["system"] == baseline)
                for c in [r for r in summaries if r["split"] == split and r["system"] != baseline]:
                    contrasts.append(dict(split=split, system=c["system"], **{m: c[m] - b[m] if c[m] is not None and b[m] is not None else None for m in METRICS}))
            scenarios.append(dict(assignments=[dict(intent_id=u[0], dataset_id=u[1], grade=g) for u, g in assumed.items()],
                                  per_query=rows, per_family=families, summaries=summaries, paired_contrasts=contrasts))
        bounds = []
        for system, split, metric in itertools.product(systems, sorted({q["split"] for q in qm.values()}), METRICS):
            values = [next(r for r in scenario["summaries"] if r["system"] == system and r["split"] == split)[metric] for scenario in scenarios]
            defined = [v for v in values if v is not None]
            bounds.append(dict(system=system, split=split, metric=metric, n_defined=len(defined),
                               minimum=min(defined) if defined else None, maximum=max(defined) if defined else None))
        query_bounds = []
        for qid, system, metric in itertools.product(qm, systems, METRICS):
            values = [next(r for r in scenario["per_query"] if r["query_id"] == qid and r["system"] == system)[metric] for scenario in scenarios]
            defined = [v for v in values if v is not None]
            query_bounds.append(dict(query_id=qid, system=system, metric=metric, n_defined=len(defined),
                                     minimum=min(defined) if defined else None, maximum=max(defined) if defined else None))
        results.append(dict(item, status="exhaustively_enumerated", scenarios=scenarios, bounds=bounds, per_query_bounds=query_bounds))
    return results


def _inventory(query_map, catalog, gates, development=False):
    problems = []
    expected = {("NEW", seed, size) for seed in gates["seeds"] for size in gates["catalog_sizes"]}
    if set(catalog) != expected:
        problems.append("incomplete registered seed/size corpus grid")
    inventory = gates["inventory"]
    registered = {q["id"]: q for q in core.read_jsonl(HERE / "query-spec.jsonl")}
    expected_queries = {qid: q for qid, q in registered.items() if not development or q["split"] == "development"}
    if set(query_map) != set(expected_queries):
        problems.append("exact frozen query-ID population mismatch")
    for qid in set(query_map) & set(expected_queries):
        if any(query_map[qid].get(field) != value for field, value in expected_queries[qid].items()):
            problems.append("query differs from frozen specification:" + qid)
    exact = [q for q in query_map.values() if q["kind"] == "exact"]
    clusters = defaultdict(list)
    for q in exact:
        clusters[q.get("split_group", q.get("intent_group"))].append(q)
    expected_clusters = {inventory["development_exact_cluster"]} if development else {inventory["development_exact_cluster"], *inventory["heldout_exact_clusters"]}
    if set(clusters) != expected_clusters or any(len(members) != 3 for members in clusters.values()):
        problems.append("all registered exact clusters require all three critical queries")
    if development and (len(query_map) != 13 or len(exact) != 3):
        problems.append("DEV inventory must be13 queries including3 critical exact")
    if not development:
        counts = {"semantic_queries": sum(q["kind"] == "semantic" for q in query_map.values()),
                  "critical_exact_queries": sum(q["kind"] == "exact" for q in query_map.values()),
                  "validated_zero_relevant_negative_queries": sum(q["kind"] in NEGATIVE for q in query_map.values()),
                  "ungraded_ambiguity_queries": sum(q["kind"] in AMBIGUOUS for q in query_map.values()),
                  "queries": len(query_map)}
        if any(counts[name] != inventory[name] for name in counts):
            problems.append("registered query/kind inventory mismatch")
    for split, name in (("development", "development_negative_intents"), ("heldout", "heldout_negative_intents")):
        if development and split != "development":
            continue
        actual = {q["intent_id"] for q in query_map.values() if q["split"] == split and q["kind"] in NEGATIVE}
        if actual != set(inventory[name]):
            problems.append("negative intent inventory:" + split)
    for split, key in (("development", "development_semantic_families"), ("heldout", "heldout_semantic_families")):
        if development and split != "development":
            continue
        actual = {q["intent_id"] for q in query_map.values() if q["split"] == split and q["kind"] == "semantic"}
        if actual != set(gates["inventory"][key]):
            problems.append("semantic family inventory:" + split)
        for iid in actual:
            if sum(q["intent_id"] == iid for q in query_map.values()) != 3:
                problems.append("three paraphrases required:" + iid)
    for seed in gates["seeds"]:
        levels = [catalog.get(("NEW", seed, size)) for size in gates["catalog_sizes"]]
        if all(levels) and not all(levels[0]["ids"] <= level["ids"] and level["core_ids"] == levels[0]["ids"] for level in levels):
            problems.append("core stable-ID/subset closure failed")
        if all(levels) and not all(a["ids"] <= b["ids"] for a, b in zip(levels, levels[1:])):
            problems.append("growth nested subset mismatch")
    return problems


def choose_development_candidate(checks, problems, gates):
    for threshold in gates["safer_C_development_selection"]["strict_preference_order"]:
        candidate = _system(threshold, gates)
        subset = [c for c in checks if c["system"] == candidate]
        if not problems and subset and all(c["passed"] is True for c in subset):
            return candidate
    return None


def select_development(queries, qrels, runs, *, corpora, intents=(), gates=None, evidence=None,
                       timestamp_utc=None, parent_acknowledgment=None, receipts=(), label_mapping=None):
    """Emit a hash-bound choice proposal. Parent persists/acks BEFORE held release."""
    gates = gates or default_gates()
    evidence = evidence or {}
    raw_runs, raw_receipts = runs, receipts
    runs, run_label_audit = normalize_run_labels(runs, label_mapping)
    receipts, receipt_label_audit = normalize_run_labels(receipts, label_mapping)
    qm = _queries(queries, intents)
    # Reject held input, not merely hide it in the final summary.
    if any(q["split"] != "development" for q in qm.values()):
        raise ValueError("DEV selector must receive ONLY development queries")
    qm, catalog, grades, indexed = _prepare(list(qm.values()), qrels, runs, corpora)
    systems = [s["id"] for s in gates["registered_systems"]]
    if any(k[-1] not in systems + [gates["diagnostic_ids"]["topk"]] for k in indexed):
        raise ValueError("unregistered development system")
    rows = _rows(qm, grades, indexed, systems)
    families = _families(rows)
    candidates = [_system(t, gates) for t in gates["safer_C_development_selection"]["strict_preference_order"]]
    checks, summaries, exposures, blockers = _contrasts(rows, families, qm, indexed, gates, "development", candidates, development=True)
    required = ("architecture", "corpora", "qrels", "validation", "vectors", "runtime", "dsl", "schedule", "correctness")
    problems = validate_bindings(evidence.get("bindings"), required) + _inventory(qm, catalog, gates, development=True)
    problems += payload_problems(evidence, queries=queries, intents=intents, qrels=qrels, runs=raw_runs, corpora=corpora, receipts=raw_receipts, label_mapping=label_mapping)
    expected_keys = {(*key, system) for key in grades for system in systems + [gates["diagnostic_ids"]["topk"]]}
    if expected_keys - set(indexed):
        problems.append("incomplete DEV seven-system/topk run grid")
    problems += receipt_problems(receipts, indexed, expected_keys, gates)
    if any("U" in values.values() for values in grades.values()):
        problems.append("unresolved DEV qrels")
    if evidence.get("supplementary_validation_passed") is not True or evidence.get("dev_correctness_passed") is not True:
        problems.append("DEV validation/correctness evidence missing")
    if evidence.get("heldout_not_executed") is not True:
        problems.append("no pre-held execution attestation")
    chosen = choose_development_candidate(checks, problems, gates)
    when = timestamp_utc or dt.datetime.now(dt.timezone.utc).isoformat()
    _utc(when)
    record = dict(schema_version=1, phase="DEV_selection_before_heldout", chosen_system_or_none=chosen,
                  chosen_threshold_or_none=next((s["dataset_min_score"] for s in gates["registered_systems"] if s["id"] == chosen), None),
                  timestamp_before_first_heldout_request=when, parent_acknowledgment=parent_acknowledgment,
                  gates_sha256=digest(gates), architecture_hashes=evidence.get("architecture_hashes", {}),
                  corpus_vector_DSL_hashes=evidence.get("bindings", {}), dev_input_sha256=digest(dict(queries=list(qm.values()), qrels=qrels, runs=runs, corpora=corpora)),
                  all_DEV_gate_values=checks, failure_reasons_for_rejected_thresholds={candidate: [c for c in checks if c["system"] == candidate and c["passed"] is not True] for candidate in candidates},
                  input_problems=problems, selection_valid=not problems, summaries=summaries, exposures=exposures, blockers=blockers,
                  label_conversion=dict(runs=run_label_audit, receipts=receipt_label_audit))
    record["record_sha256"] = digest(record)
    return record


def _selection_problems(selection, evidence, gates, development_bundle=None, diagnostic_policy=None):
    if not selection:
        return ["missing immutable DEV choice record"]
    body = {k: v for k, v in selection.items() if k != "record_sha256"}
    problems = []
    if selection.get("record_sha256") != digest(body) or selection.get("gates_sha256") != digest(gates):
        problems.append("invalid DEV choice digest/rule/input evidence")
    problems += validate_bindings(evidence.get("bindings"), ("selection",))
    problems += payload_problems(evidence, selection=selection)
    if diagnostic_policy is not None:
        if (selection.get("phase") != "nonpromotional_no_selection" or
            selection.get("chosen_system_or_none") is not None or
            selection.get("chosen_threshold_or_none") is not None or
            selection.get("promotion_allowed") is not False or
            selection.get("forced_recommendation") != "D" or
            selection.get("diagnostic_policy_sha256") != digest(diagnostic_policy)):
            problems.append("diagnostic mode requires policy-bound nonpromotional NONE record")
    else:
        if selection.get("selection_valid") is not True:
            problems.append("strict DEV selection did not validate")
        if development_bundle is None:
            problems.append("strict selection requires full frozen DEV source bundle replay")
        else:
            problems += payload_problems(evidence, development_bundle=development_bundle)
            try:
                allowed_keys = {"queries", "qrels", "runs", "corpora", "intents", "evidence", "receipts", "label_mapping"}
                if set(development_bundle) - allowed_keys:
                    raise ValueError("unexpected DEV bundle fields (no held/legacy inputs)")
                replay = select_development(**development_bundle, gates=gates,
                    timestamp_utc=selection["timestamp_before_first_heldout_request"],
                    parent_acknowledgment=selection.get("parent_acknowledgment"))
                if replay != selection:
                    problems.append("DEV selection differs from complete source-input recomputation")
            except (KeyError, ValueError, TypeError) as error:
                problems.append("DEV source replay rejected:" + str(error))
    if not selection.get("parent_acknowledgment"):
        problems.append("DEV choice lacks parent acknowledgment")
    chosen = selection.get("chosen_system_or_none")
    allowed = [_system(t, gates) for t in gates["safer_C_development_selection"]["eligible_candidates"]]
    if chosen is not None and chosen not in allowed:
        problems.append("unregistered safer-C candidate")
    dev_checks = selection.get("all_DEV_gate_values", [])
    if diagnostic_policy is None and (not dev_checks or any(not any(c.get("system") == s for c in dev_checks) for s in allowed)):
        problems.append("DEV choice missing both registered candidate check sets")
    elif diagnostic_policy is None and choose_development_candidate(dev_checks, selection.get("input_problems", []), gates) != chosen:
        problems.append("DEV choice contradicts frozen strict preference/pass rule")
    try:
        if _utc(selection["timestamp_before_first_heldout_request"]) >= _utc(evidence["first_heldout_event_utc"]):
            problems.append("DEV choice not before first held request OR score")
    except (KeyError, ValueError, TypeError):
        problems.append("missing provable DEV-before-held chronology")
    if evidence.get("dev_record_sha256_before_heldout") != selection.get("record_sha256"):
        problems.append("held release does not bind immutable DEV record")
    return problems


def diagnostic_policy_problems(policy, evidence, grades, query_map):
    """Separately preregistered nonpromotional mode, NEVER a validation pass."""
    problems = validate_bindings(evidence.get("bindings"), ("diagnostic_policy", "uncertainty_mask", "validation"))
    problems += payload_problems(evidence, diagnostic_policy=policy, uncertainty_pairs=policy.get("uncertainty_pairs", []))
    if (policy.get("schema_version") != 1 or policy.get("status") != "original_failed" or
        policy.get("original_conformance_passed") is not False or
        policy.get("promotion_allowed") is not False or policy.get("forced_recommendation") != "D"):
        problems.append("diagnostic policy must truthfully preserve failed original conformance and forcedD")
    if evidence.get("supplementary_validation_passed") is not False:
        problems.append("diagnostic failed study must not assert supplementary validation passed")
    pairs = policy.get("uncertainty_pairs", [])
    expected = set()
    for row in pairs:
        key = (row.get("cohort", "NEW"), row["seed"], row["query_id"], row["dataset_id"])
        allowed = row.get("allowed_grades", [0, 1, 2, 3])
        if key in expected or not allowed or any(not synthetic._numeric(g) for g in allowed) or len(set(allowed)) != len(allowed):
            problems.append("invalid/duplicate registered scoped uncertainty pair")
        expected.add(key)
    actual = {(key[0], key[1], key[3], did) for key, values in grades.items()
              if query_map[key[3]]["kind"] not in AMBIGUOUS for did, grade in values.items() if grade == "U"}
    if actual != expected:
        problems.append("diagnostic U mask differs from exact independently audited scoped pairs")
    # Mask applies at each containing catalog size, not just one convenient level.
    for cohort, seed, qid, did in expected:
        for key, values in grades.items():
            if key[0] == cohort and key[1] == seed and key[3] == qid and did in values and values[did] != "U":
                problems.append("diagnostic U lost at a registered size")
    bindings = evidence.get("bindings", {})
    if policy.get("uncertainty_mask_sha256") != digest(pairs):
        problems.append("policy uncertainty mask payload hash mismatch")
    if policy.get("validation_manifest_sha256") != bindings.get("validation", {}).get("expected_sha256"):
        problems.append("policy independent C validation source differs")
    if policy.get("architecture_sha256") != bindings.get("architecture", {}).get("expected_sha256"):
        problems.append("policy frozen architecture source differs")
    try:
        if _utc(policy["created_utc"]) >= _utc(evidence["first_target_embedding_utc"]):
            problems.append("diagnostic policy not registered before first target embedding")
    except (KeyError, ValueError, TypeError):
        problems.append("diagnostic pre-embedding policy chronology unavailable")
    if evidence.get("diagnostic_policy_sha256_before_embedding") != digest(policy):
        problems.append("pre-embedding release does not bind diagnostic policy")
    return problems


def nonpromotional_no_selection(policy, *, timestamp_utc, parent_acknowledgment, gates=None):
    """Explicit immutable NONE record; makes NO DEV safe/useful selection claim."""
    gates = gates or default_gates()
    _utc(timestamp_utc)
    if policy.get("promotion_allowed") is not False or policy.get("forced_recommendation") != "D":
        raise ValueError("nonpromotional NONE requires forcedD policy")
    record = dict(schema_version=1, phase="nonpromotional_no_selection", chosen_system_or_none=None,
                  chosen_threshold_or_none=None, promotion_allowed=False, forced_recommendation="D",
                  diagnostic_policy_sha256=digest(policy), gates_sha256=digest(gates),
                  timestamp_before_first_heldout_request=timestamp_utc, parent_acknowledgment=parent_acknowledgment)
    record["record_sha256"] = digest(record)
    return record


def receipt_problems(receipts, indexed, expected_keys, gates):
    grouped = defaultdict(list)
    problems = []
    for row in receipts:
        key = (*_key(row), row["system"])
        grouped[key].append(row)
        if row.get("error") or row.get("error_type") or row.get("timed_out") or row.get("shards", {}).get("failed", 0) or row.get("authorization_violations"):
            problems.append("request failure:" + str(key))
        if _number(row.get("elapsed_ms"), "receipt elapsed") < 0:
            raise ValueError("negative receipt elapsed")
        if row.get("took") is not None and _number(row["took"], "receipt engine took") < 0:
            raise ValueError("negative receipt engine took")
        if not _sha(row.get("request_sha256")) or not _sha(row.get("parsed_json_sha256")):
            problems.append("receipt hashes unavailable:" + str(key))
        if (not isinstance(row.get("hits"), list) or "aggregations" not in row or
            "total_hits" not in row or not isinstance(row.get("all_hit_signatures"), list)):
            problems.append("receipt missing explicit root/nested/facet/count surfaces:" + str(key))
        elif not any(signature.get("path") == ["hits", "hits"] and signature.get("hits") == row["hits"]
                     for signature in row["all_hit_signatures"]):
            problems.append("receipt root signature not linked to all-surface signatures:" + str(key))
    for key in expected_keys:
        members = grouped.get(key, [])
        warmup = [r for r in members if r.get("phase") == "warmup" and r.get("warmup") is True]
        measured = [r for r in members if r.get("phase") == "measured" and r.get("warmup") is False]
        expected_n = gates["latency"]["measured_repetitions_per_query_system_seed_size"]
        if len(warmup) != 1 or len(measured) != expected_n or {r.get("repetition") for r in measured} != set(range(1, expected_n + 1)):
            problems.append("receipt warmup/repetition coverage:" + str(key))
            continue
        if len({r["request_sha256"] for r in members}) != 1:
            problems.append("request changed within repetitions:" + str(key))
        run = indexed.get(key)
        ordered = sorted(measured, key=lambda r: r["repetition"])
        if run is None or run.get("latency_samples_ms") != [r["elapsed_ms"] for r in ordered]:
            problems.append("run samples differ from request ledger:" + str(key))
        if run is not None and ordered[-1].get("hits") is not None:
            expected_hits = [{"id": h["id"], "rank": h["rank"], "score": h.get("score")} for h in core._ranked_hits(run)]
            if ordered[-1]["hits"] != expected_hits:
                problems.append("last receipt ranking differs from run:" + str(key))
    return problems


def repeat_diagnostics(receipts):
    groups = defaultdict(list)
    for row in receipts:
        if row.get("phase") == "measured":
            groups[(*_key(row), row["system"])].append(row)
    return [dict(key=list(key), n=len(members),
                 ranking_score_variants=len({digest(r.get("hits")) for r in members}),
                 facet_count_variants=len({digest(r.get("aggregations")) for r in members}),
                 total_hit_variants=len({digest(r.get("total_hits")) for r in members}),
                 engine_took_samples_ms=[r.get("took") for r in members],
                 note="All repetitions retained; variations are descriptive, never silently replaced by last result")
            for key, members in sorted(groups.items())]


def _decisive(checks, candidate, gates):
    selected = [c for c in checks if c["system"] == candidate]
    if any(c["category"] == "exact" and c["passed"] is False for c in selected):
        return True
    failures = defaultdict(set)
    for c in selected:
        if c["passed"] is False:
            failures[c.get("cohort", "NEW"), c["name"], c["size"]].add(c["seed"])
    return any(seeds == (set(gates["seeds"]) if cohort == "NEW" else {39031, 39032, 39033})
               for (cohort, name, size), seeds in failures.items())


def decide(checks, problems, chosen, gates):
    """Only fixed primary or immutable DEV choice; never best-held selection."""
    candidates = [s["id"] for s in gates["registered_systems"] if s["id"] != gates["baseline"]]
    passed = {s: bool([c for c in checks if c["system"] == s]) and all(c["passed"] is True for c in checks if c["system"] == s) for s in candidates}
    primary = gates["fixed_primary"]
    recommendation = "D"
    if not problems:
        if passed[primary]:
            recommendation = "A"
        elif chosen is not None and passed.get(chosen):
            recommendation = "C"
        elif _decisive(checks, primary, gates) and (chosen is None or _decisive(checks, chosen, gates)):
            recommendation = "B"
    return recommendation, passed


def build_report(queries, qrels, runs, *, corpora, intents=(), gates=None, evidence=None,
                 eligibility=(), native_scores=(), branch_evidence=(), selection=None,
                 legacy=None, receipts=(), fixed_pairs=(), diagnostic_policy=None,
                 development_bundle=None, label_mapping=None, vector_inventory=()):
    """Offline report. Invalid dictionaries raise; absent mandatory proof gives D.

    `evidence.bindings` maps role to {expected_sha256, observed_sha256}; callers
    must independently hash artifact bytes (CLI verify_bindings does that).
    Extra provenance keys are preserved. Attestations are labeled, not claimed
    as independent cryptographic proof of semantics/reviewer independence.
    """
    gates = gates or default_gates()
    evidence = evidence or {}
    raw_runs, raw_receipts, raw_eligibility = runs, receipts, eligibility
    runs, run_label_audit = normalize_run_labels(runs, label_mapping)
    receipts, receipt_label_audit = normalize_run_labels(receipts, label_mapping)
    eligibility, eligibility_label_audit = normalize_run_labels(eligibility, label_mapping)
    qm, catalog, grades, indexed = _prepare(queries, qrels, runs, corpora, intents=intents)
    systems = [s["id"] for s in gates["registered_systems"]]
    diagnostic_ids = list(gates["diagnostic_ids"].values())
    if any(k[-1] not in systems + diagnostic_ids for k in indexed):
        raise ValueError("unknown system; no normalized candidate permitted")
    rows = _rows(qm, grades, indexed, systems + [gates["diagnostic_ids"]["topk"]])
    families = _families(rows)
    candidates = [s for s in systems if s != gates["baseline"]]
    checks, summaries, exposures, blockers = _contrasts(rows, families, qm, indexed, gates, "heldout", candidates)
    timing, latency_checks = _latency(indexed, qm, gates, systems + [gates["diagnostic_ids"]["topk"]])
    checks.extend(latency_checks)
    problems = validate_bindings(evidence.get("bindings")) + _inventory(qm, catalog, gates)
    problems += payload_problems(evidence, queries=queries, intents=intents, qrels=qrels, runs=raw_runs, corpora=corpora,
                                 eligibility=raw_eligibility, native_scores=native_scores,
                                 branch_evidence=branch_evidence, receipts=raw_receipts, fixed_pairs=fixed_pairs, legacy=legacy,
                                 label_mapping=label_mapping, vector_inventory=vector_inventory)
    problems += _selection_problems(selection, evidence, gates, development_bundle, diagnostic_policy)
    if diagnostic_policy is not None:
        problems += diagnostic_policy_problems(diagnostic_policy, evidence, grades, qm)
        problems.append("preregistered nonpromotional forcedD: original conformance failed")
    if diagnostic_policy is None and evidence.get("supplementary_validation_passed") is not True:
        problems.append("independent actual-text supplementary validation unavailable")
    if evidence.get("runtime_and_DSL_verified") is not True:
        problems.append("actual raw production runtime/DSL not verified")
    if evidence.get("native_engine_calibration_passed") is not True:
        problems.append("native L2 engine calibration unavailable")
    if evidence.get("all_threshold_correctness_passed") is not True or not evidence.get("correctness_case_ids"):
        problems.append("all-system real-engine correctness evidence unavailable/failed")
    if evidence.get("authorization_violations"):
        problems.append("absolute authorization exposure")
    if evidence.get("all_repetition_surface_checks_passed") is not True:
        problems.append("all-repetition nested/facet/count/explain evidence unavailable/failed")
    if evidence.get("mandatory_branch_diagnostics_complete") is not True:
        problems.append("fixed mixed-axis diagnostic evidence unavailable")
    for key, values in grades.items():
        if qm[key[3]]["kind"] not in AMBIGUOUS and "U" in values.values():
            problems.append("unresolved NEW scored qrels:" + str(key))
    expected_keys = {(*key, system) for key in grades for system in systems + [gates["diagnostic_ids"]["topk"]]}
    missing_runs = expected_keys - set(indexed)
    if missing_runs:
        problems.append("incomplete primary/topk run grid")
    # Both matched role pairs reuse main radial runs; mixed pairs require REAL
    # distinct run/receipt evidence, never an attestation replacing missing data.
    mixed_ids = [gates["diagnostic_ids"][name] for name in ("dataset045_nested050", "dataset050_nested045")]
    mixed_keys = {(*key, system) for key in grades for system in mixed_ids}
    if mixed_keys - set(indexed):
        problems.append("fixed mixed-axis run grid incomplete")
    problems += receipt_problems(receipts, indexed, expected_keys | mixed_keys, gates)
    opportunity_report = opportunity(native_scores, fixed_pairs, qm, catalog, grades, gates, branch_evidence)
    if not opportunity_report["adequate"]:
        problems.append("insufficient/missing genuine-positive threshold opportunity")
    attribution = eligibility_attribution(eligibility, native_scores, qm, catalog, grades, indexed, gates, vector_inventory)
    if not attribution["available"]:
        problems.append("mandatory full eligibility/native-score diagnostics unavailable")
    legacy_output = legacy_report(legacy, systems + [gates["diagnostic_ids"]["topk"]], gates) if legacy else None
    if legacy_output is None or not legacy_output["complete"]:
        problems.append("legacy unchanged known/U closure and engineering guards unavailable")
    if legacy_output:
        for c in legacy_output["checks"]:
            checks.append(c)
        blockers.extend(legacy_output["blockers"])
    if any(c["passed"] is None for c in checks if c["system"] in systems):
        problems.append("undefined required metric/latency/legacy check")
    primary = gates["fixed_primary"]
    chosen = selection.get("chosen_system_or_none") if selection else None
    decision, passed = decide(checks, problems, chosen, gates)
    return dict(schema_version=1, generated_utc=dt.datetime.now(dt.timezone.utc).isoformat(),
                decision=dict(recommendation=decision, problems=sorted(set(problems)), candidate_passed=passed,
                              fixed_primary=primary, preselected_alternative=chosen,
                              scope="controlled supplementary engineering evidence only; no deployment/production relevance claim"),
                gates_sha256=digest(gates), evidence=evidence, selection=selection,
                analysis_mode="forced_D_nonpromotional" if diagnostic_policy is not None else "strict_confirmatory",
                original_conformance_passed=False if diagnostic_policy is not None else evidence.get("supplementary_validation_passed"),
                promotion_allowed=False if diagnostic_policy is not None else not problems,
                forced_recommendation="D" if diagnostic_policy is not None else None,
                diagnostic_policy=diagnostic_policy,
                label_conversion=dict(runs=run_label_audit, receipts=receipt_label_audit, eligibility=eligibility_label_audit),
                new_uncertainty_sensitivity=legacy_sensitivity(list(qm.values()), qrels, runs, corpora, systems=systems, baseline=gates["baseline"], uncertainty_domains=diagnostic_policy.get("uncertainty_pairs", [])) if diagnostic_policy is not None else [],
                per_query=rows, per_family=families, contrasts=summaries, checks=checks,
                exact_blockers=blockers, false_positive_exposures=exposures, latency=timing,
                repeat_diagnostics=repeat_diagnostics(receipts),
                opportunity=opportunity_report, eligibility_attribution=attribution, legacy=legacy_output,
                native_score_distributions=score_distributions(native_scores, grades, qm),
                limitations=["Seeds/paraphrases/repeats/templates are correlated, not independent significance evidence.",
                             "Synthetic dataset relevance is not separate branch-local human utility.",
                             "Exact native geometry differs from approximate Faiss eligibility and fused rankings.",
                             "Original legacy primary-eight validation never passed; U remains unchanged.",
                             "Real494 fixture has limited positive coverage and is not primary recall evidence."])


def descriptive_groups(rows, query_map):
    groups = defaultdict(list)
    for row in rows:
        groups[(row["cohort"], row["seed"], row["size"], row["system"], row["kind"], row["split"])].append(row)
    result = []
    for key, members in sorted(groups.items()):
        fs = _families(members)
        result.append(dict(zip(("cohort", "seed", "size", "system", "kind", "split"), key),
                           n_queries=len(members), n_families=len(fs),
                           n_resolved_families=sum(all(f[m] is not None for m in METRICS) for f in fs),
                           full_population_means={m: _mean(f[m] for f in fs) for m in METRICS},
                           descriptive_known_only_means={m: core._mean(f[m] for f in fs) for m in METRICS},
                           primary_validation_claim=False))
    return result


def legacy_source_problems(bundle):
    """Re-read pinned original legacy sources; caller hash declarations are not truth."""
    problems = []
    binder_path = HERE / "analysis-bindings.json"
    raw = binder_path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != "8a105328c7756c9da08e38c442d8e333f261466217afd9f47e1f1ea41e7a39bc":
        return ["pre-execution legacy analysis binding changed"]
    binding = json.loads(raw)["legacy"]
    loaded = {}
    workspace = ROOT.parent
    for relative, expected in binding["source_sha256"].items():
        path = workspace / relative
        actual = path.read_bytes()
        if hashlib.sha256(actual).hexdigest() != expected:
            problems.append("pinned original legacy source changed:" + relative)
        loaded[path.name] = ([json.loads(line) for line in actual.decode().splitlines() if line.strip()]
                             if path.suffix == ".jsonl" else json.loads(actual))
    if bundle.get("resolved_positive_intent_ids") != binding["resolved_positive_intent_ids"]:
        problems.append("legacy14 population differs from prescore binding")
    registered_mask = {(r["seed"], r["query_id"], r["dataset_id"]) for r in binding["uncertainty_pairs"]}
    declared_mask = {tuple(r) for r in bundle.get("uncertainty_pairs", [])}
    if declared_mask != registered_mask:
        problems.append("legacy12U identities differ from pinned original mask")
    original_qrels = {(r["seed"], r["query_id"], r["dataset_id"]): r["grade"] for r in loaded["diagnostic-qrels.jsonl"]}
    provided_qrels = {(r["seed"], r["query_id"], r["dataset_id"]): r["grade"] for r in bundle["qrels"]}
    if original_qrels != provided_qrels:
        problems.append("legacy qrel values differ from actual pinned original bytes")
    validation = loaded["diagnostic-validation.json"]
    for descriptor in validation["corpora"]:
        path = (ROOT / "synthetic" / descriptor["path"]).resolve()
        raw_corpus = path.read_bytes()
        if hashlib.sha256(raw_corpus).hexdigest() != descriptor["sha256"]:
            problems.append("legacy original complete corpus raw bytes changed:" + str(descriptor["seed"]))
        corpus_ids = {json.loads(line)["identifier"] for line in raw_corpus.decode().splitlines() if line.strip()}
        declared = [c for c in bundle["corpora"] if c["seed"] == descriptor["seed"]]
        if len(declared) != 1 or set(declared[0]["ids"]) != corpus_ids:
            problems.append("legacy corpus descriptor IDs differ from pinned actual corpus")
    for field, relative in validation.items():
        if field.endswith("_path") and field[:-5] + "_sha256" in validation:
            source = (ROOT / "synthetic" / relative).resolve()
            if hashlib.sha256(source.read_bytes()).hexdigest() != validation[field[:-5] + "_sha256"]:
                problems.append("legacy validation referenced source changed:" + field)
    originals = {q["id"]: q for q in loaded["query-spec.jsonl"]}
    provided = {q["id"]: q for q in bundle["queries"]}
    if set(originals) != set(provided) or any(any(provided[qid].get(k) != v for k, v in q.items()) for qid, q in originals.items() if qid in provided):
        problems.append("legacy queries differ from actual pinned original specification")
    try:
        refreshed = verify_bindings(bundle.get("bindings", {}), bundle.get("source_base", "."))
        problems += validate_bindings(refreshed, ("queries", "qrels", "corpora", "uncertainty_mask", "validation"))
        problems += payload_problems(bundle, queries=bundle["queries"], qrels=bundle["qrels"], runs=bundle["runs"], corpora=bundle["corpora"])
    except (OSError, KeyError, ValueError, TypeError) as error:
        problems.append("nested legacy actual source closure rejected:" + str(error))
    return problems


def legacy_report(bundle, systems, gates):
    """Legacy input is raw immutable labels/runs, never a claimed passed primary8."""
    qm, catalog, grades, indexed = _prepare(bundle["queries"], bundle["qrels"], bundle["runs"], bundle["corpora"], intents=bundle.get("intents", ()))
    rows = _rows(qm, grades, indexed, systems)
    families = _families(rows)
    checks, blockers, summaries = [], [], []
    closure = legacy_source_problems(bundle)
    known = sum(g != "U" for values in grades.values() for g in values.values())
    unknown = sum(g == "U" for values in grades.values() for g in values.values())
    if known != 40488 or unknown != 12 or len(qm) != 75 or set((seed, size) for _, seed, size in catalog) != {(s, 180) for s in (39031, 39032, 39033)}:
        closure.append("legacy fixed40488known/12U/75queries/180x3 inventory mismatch")
    expected_mask = {tuple(row) for row in bundle.get("uncertainty_pairs", [])}
    actual_mask = {(key[1], key[3], did) for key, values in grades.items() for did, g in values.items() if g == "U"}
    if expected_mask != actual_mask:
        closure.append("legacy uncertainty mask differs")
    # Population is fixed by labels across ALL seeds, NEVER per-run results.
    positive_ids = {q["intent_id"] for q in qm.values() if q["kind"] in ("semantic", "functional")}
    resolved_ids = sorted(iid for iid in positive_ids if all(
        "U" not in values.values() for key, values in grades.items() if qm[key[3]]["intent_id"] == iid))
    frozen_resolved = bundle.get("resolved_positive_intent_ids")
    if frozen_resolved != resolved_ids or len(resolved_ids) != 14:
        closure.append("pre-execution frozen resolved ALL-split14-family population missing/different")
    for cohort, seed, size in catalog:
        for system in systems:
            if system == gates["baseline"]:
                continue
            identity = dict(seed=seed, size=size, system=system, cohort=cohort)
            resolved = [f for f in families if f["seed"] == seed and f["system"] == gates["baseline"] and f["intent_id"] in resolved_ids]
            paired = []
            for base in resolved:
                current = next(f for f in families if f["seed"] == seed and f["system"] == system and f["intent_id"] == base["intent_id"])
                paired.append({m: current[m] - base[m] if current[m] is not None and base[m] is not None else None for m in METRICS})
            for metric, minimum in ((METRICS[1], -.02), (METRICS[2], 0)):
                _check(checks, "legacy_resolved_" + metric, _mean(p[metric] for p in paired), minimum, **identity)
            summaries.append(dict(identity, descriptive_resolved_families=[f["intent_id"] for f in resolved],
                                  resolved_family_count=len(resolved), frozen_primary_available=False,
                                  **{m: _mean(p[m] for p in paired) for m in METRICS}))
            for query in qm.values():
                if query["kind"] != "exact":
                    continue
                key = (cohort, seed, size, query["id"])
                events = exact_events(query, indexed.get((*key, gates["baseline"])), indexed.get((*key, system)))
                _check(checks, "legacy_exact:" + query["id"], len(events) if events is not None else None, 0, minimum=False, category="exact", **identity)
                blockers.extend(dict(identity, query_id=query["id"], **e) for e in events or [])
    if any(not r["run_present"] for r in rows):
        closure.append("legacy run coverage incomplete")
    rowmap = {(*_key(r), r["system"]): r for r in rows}
    fp_observations = []
    for row in rows:
        base = rowmap[(*_key(row), gates["baseline"])]
        if row["kind"] in AMBIGUOUS:
            continue
        fp_observations.append(dict(cohort=row["cohort"], seed=row["seed"], size=row["size"], system=row["system"], query_id=row["query_id"],
            baseline_grade0_top10=base["grade0_count_top10"], candidate_grade0_top10=row["grade0_count_top10"],
            new_grade0_ids_top10=sorted(set(row["known_grade0_ids_top10"]) - set(base["known_grade0_ids_top10"])) if row["grade0_count_top10"] is not None else None,
            baseline_grade0_top5=base["grade0_count_top5"], candidate_grade0_top5=row["grade0_count_top5"],
            new_grade0_ids_top5=sorted(set(row["known_grade0_ids_top5"]) - set(base["known_grade0_ids_top5"])) if row["grade0_count_top5"] is not None else None,
            interpretation="Visible descriptive legacy cost, not a new preregistered FP decision bound"))
    return dict(complete=not closure, closure_problems=closure, known_pairs=known, U_pairs=unknown,
                original_validation_passed=False, frozen_primary_available=False, per_query=rows,
                kind_split_groups=descriptive_groups(rows, qm), false_positive_observations=fp_observations,
                descriptive_resolved_comparisons=summaries, checks=checks, blockers=blockers,
                sensitivity=legacy_sensitivity(bundle["queries"], bundle["qrels"], bundle["runs"], bundle["corpora"], systems=systems, baseline=gates["baseline"]))


def load_analysis_payload(payload, base):
    """Typed actual-source loader, recursively including DEV replay and legacy."""
    payload = dict(payload)
    evidence = dict(payload.get("evidence", {}))
    evidence["source_base"] = str(Path(base).resolve())
    evidence["bindings"] = verify_bindings(evidence.get("bindings", {}), base)
    calculated = {}
    for name, spec in evidence.get("argument_files", {}).items():
        loaded = load_argument_source(spec, base)
        if name in payload and digest(payload[name]) != digest(loaded):
            raise ValueError("supplied argument differs from actual typed source:" + name)
        payload[name] = loaded
        calculated[name] = digest(loaded)
    evidence["input_sha256"] = {**evidence.get("input_sha256", {}), **calculated}
    payload["evidence"] = evidence
    if payload.get("development_bundle") is not None:
        # Replay input source bytes remain bound as supplied; refresh only nested
        # observed hashes already agreeing with actual bytes, never fabricate a pass.
        bundle = payload["development_bundle"]
        be = bundle.get("evidence", {})
        verify_bindings(be.get("bindings", {}), be.get("source_base", base))
        for name, spec in be.get("argument_files", {}).items():
            if digest(load_argument_source(spec, be.get("source_base", base))) != digest(bundle[name]):
                raise ValueError("DEV actual source payload mismatch:" + name)
    if payload.get("legacy") is not None:
        bundle = payload["legacy"]
        verify_bindings(bundle.get("bindings", {}), bundle.get("source_base", base))
        for name, spec in bundle.get("argument_files", {}).items():
            if digest(load_argument_source(spec, bundle.get("source_base", base))) != digest(bundle[name]):
                raise ValueError("legacy actual source payload mismatch:" + name)
    return payload


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inputs", required=True, help="Explicit JSON manifest of build_report/select_development arguments")
    parser.add_argument("--output", required=True)
    parser.add_argument("--development", action="store_true")
    args = parser.parse_args(argv)
    path = Path(args.inputs).resolve()
    payload = load_analysis_payload(json.loads(path.read_text()), path.parent)
    report = select_development(**payload) if args.development else build_report(**payload)
    target = Path(args.output).resolve()
    if target == path or target.exists():
        raise ValueError("refuse to overwrite input/existing analysis")
    with target.open("x") as stream:
        json.dump(report, stream, sort_keys=True, indent=2, allow_nan=False)
        stream.write("\n")


if __name__ == "__main__":
    main()
