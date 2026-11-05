#!/usr/bin/env python3
"""Evaluation-only pooling and metrics, using Python's standard library.

No search service, production code, network, or model is used. See ``--help``.
Public packets intentionally omit query/dataset identifiers, ranks and origins;
keep their mapping and the source runs private. A deterministic seed is for
reproducibility, not a cryptographic access-control boundary.

NDCG uses gains 2**grade-1 and log2 discounts at original submitted ranks,
assuming zero gain for U/unjudged hits. IDCG uses all judged pool documents.
Secondary condensed NDCG removes U/unjudged before ranking. Neither is an
unbiased estimate of complete-corpus quality; read coverage alongside them. A/B
judgments are never promoted to objective truth. Conservative consensus keeps
only identical numeric grades; every disagreement or missing judgment is U.
Known-answer metrics use only a separately supplied, human-curated anchor file.
"""

import argparse
import csv
import hashlib
import hmac
import json
import math
import random
import re
import statistics
from collections import defaultdict
from pathlib import Path


TASK_FIELDS = ("category", "split", "query", "intent", "success_criteria")
# Deliberately not arbitrary metadata: origin, IDs, scores and ranking features
# must not be copied to a judging packet, even inside nested structures.
DOCUMENT_FIELDS = {
    "title", "name", "description", "publisher", "distributions", "keywords",
    "themes", "spatial", "temporal", "license", "format", "language",
    "issued", "modified", "created", "accrualPeriodicity", "accessRights",
    "landingPage", "accessURL", "downloadURL", "mediaType", "byteSize",
    "start", "end", "startDate", "endDate", "label", "notes", "contactPoint",
    "organization", "organisation", "email", "url", "type",
    # Preserve structured temporal and geographic evidence, not just labels.
    "text", "date", "value", "unit", "period", "interval", "coverage",
    "boundingBox", "bbox", "coordinates", "geometry", "geometries", "geoJson", "geoJSON", "features",
    "properties", "crs", "north", "south", "east", "west", "latitude", "longitude",
    "lat", "lon", "x", "y", "z", "minX", "minY", "maxX", "maxY",
    "northBoundLatitude", "southBoundLatitude", "eastBoundLongitude", "westBoundLongitude",
    "referenceSystem", "projection", "datum",
}
# Compare normalized keys so camelCase and punctuation cannot bypass the
# recursive origin/ranking/answer-anchor guard. Task criteria themselves are
# not document metadata: preserve semantic keys rather than whitelisting them
# through DOCUMENT_FIELDS (which would silently discard hard requirements).
PRIVATE_FIELDS = {
    "id", "ids", "datasetid", "datasetids", "distributionid", "distributionids",
    "queryid", "queryids", "system", "systems", "systemid", "systemname",
    "rank", "ranks", "ranking", "score", "scores", "origin", "origins",
    "provenance", "sourceprovenance", "source", "sources", "config",
    "target", "targets", "targetid", "targetids", "targetdatasetid", "targetdatasetids",
    "knownanswer", "knownanswers", "anchor", "anchors", "actualid", "actualids",
}
# Also redact syntactic MAGDA identifiers and bare UUIDs that were never
# retrieved or explicitly marked as answer anchors in the frozen task.
MAGDA_IDENTIFIER = re.compile(r"(?<![\w])(?:ds|dist)-[a-z0-9]+(?:[-_][a-z0-9]+)*", re.IGNORECASE)
UUID_IDENTIFIER = re.compile(
    r"(?<![0-9a-f])(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})(?![0-9a-f])",
    re.IGNORECASE,
)
VIEWS = ("judge_a", "judge_b", "consensus")
LIMITATIONS = [
    "Primary NDCG@10 preserves original ranks and assumes zero gain for U/unjudged hits. "
    "This pessimistic gain assumption is not a guaranteed lower bound on full-corpus NDCG because IDCG is pooled.",
    "Secondary condensed NDCG@10 removes U/unjudged hits before cutoff and can make incomplete rankings look optimistic. "
    "Neither metric establishes complete-corpus truth; inspect judgment coverage and A/B sensitivity.",
    "Macro means exclude queries without numeric judgments; coverage and valid-query counts must accompany comparisons.",
    "Consensus is agreement-only: unequal grades, U, or a missing judge remain unresolved U.",
    "U means unassessable from the supplied packet/evidence, not evidence of corpus absence. "
    "Record missing or unseen metadata explicitly; this module does not truncate descriptive text.",
    "Assessor independence and evidence accuracy must be established by the judging protocol; "
    "preserving two files and judge metadata does not prove independence.",
    "Known-answer metrics use only supplied anchors; anchor absence is not a negative relevance label.",
    "Bootstrap intervals are exploratory query-level paired resamples, not causal or population guarantees; "
    "small, dependent or nonrepresentative query sets limit inference. No interval is computed below 10 comparable queries.",
    "Latency is descriptive client-supplied timing, not a controlled benchmark; unlabeled samples are not assumed warm or cold.",
]


def read_jsonl(path):
    """Read JSON objects, rejecting malformed records rather than silently skipping."""
    records = []
    with open(path, encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, 1):
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{line_number}: invalid JSON: {exc.msg}") from exc
            if not isinstance(record, dict):
                raise ValueError(f"{path}:{line_number}: expected a JSON object")
            records.append(record)
    return records


def write_jsonl(path, records):
    with open(path, "w", encoding="utf-8") as stream:
        for record in records:
            stream.write(json.dumps(record, ensure_ascii=False, sort_keys=True, allow_nan=False) + "\n")


def _canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False, separators=(",", ":"))


def _identifier(value, label):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a nonempty string")
    return value


def _queries(records):
    result = {}
    for record in records:
        query_id = _identifier(record.get("id"), "query id")
        if query_id in result:
            raise ValueError(f"duplicate query id: {query_id}")
        for field in TASK_FIELDS:
            if field not in record:
                raise ValueError(f"query {query_id}: missing {field}")
        if not isinstance(record["query"], str) or not isinstance(record["category"], str):
            raise ValueError("query text and category must be strings")
        result[query_id] = record
    return result


def _ranked_hits(run):
    hits = run.get("hits")
    if not isinstance(hits, list):
        raise ValueError("run hits must be a list")
    ranked = []
    ids, ranks = set(), set()
    for position, hit in enumerate(hits, 1):
        if not isinstance(hit, dict):
            raise ValueError("run hit must be an object")
        dataset_id = _identifier(hit.get("id"), "hit id")
        rank = hit.get("rank", position)
        if isinstance(rank, bool) or not isinstance(rank, int) or rank < 1:
            raise ValueError("hit rank must be a positive integer")
        if dataset_id in ids or rank in ranks:
            raise ValueError("duplicate dataset id or rank within a run")
        ids.add(dataset_id)
        ranks.add(rank)
        if not isinstance(hit.get("metadata", {}), dict):
            raise ValueError("hit metadata must be an object")
        ranked.append((rank, {**hit, "rank": rank}))
    return [hit for _, hit in sorted(ranked, key=lambda item: item[0])]


def _runs(records, queries):
    indexed = defaultdict(dict)
    for run in records:
        system = _identifier(run.get("system"), "system")
        query_id = _identifier(run.get("query_id"), "run query_id")
        if query_id not in queries:
            raise ValueError(f"unknown run query_id: {query_id}")
        if query_id in indexed[system]:
            raise ValueError(f"duplicate system/query run: {system}/{query_id}; aggregate timing samples in latency_samples_ms")
        _ranked_hits(run)
        indexed[system][query_id] = run
    return dict(indexed)


def _opaque(seed, namespace, value):
    return hmac.new(str(seed).encode(), (namespace + "\0" + _canonical(value)).encode(), hashlib.sha256).hexdigest()[:32]


def _private_field(key):
    normalized = re.sub(r"[^a-z0-9]", "", key.lower())
    return normalized in PRIVATE_FIELDS or normalized.startswith("expected")


def _redactor(dataset_ids, *, task=False):
    """Build distinct recursive task/document sanitizers with shared ID guards.

    Task structures retain all semantic criteria keys (including geography,
    time, variables, granularity, format/access, preferences and U/rejection
    rules), except private provenance/ranking/answer fields at every depth.
    Documents instead use the descriptive metadata whitelist at every depth.
    Neither branch truncates text. Both redact unretrieved MAGDA IDs/UUIDs.
    """
    # Boundaries also match IDs embedded in URL path segments. Longest first
    # avoids partial replacement where an identifier is a prefix of another.
    patterns = [re.compile(r"(?<![\w])" + re.escape(value) + r"(?![\w])")
                for value in sorted(set(dataset_ids), key=lambda value: (-len(value), value))]

    def redact_text(value):
        for pattern in patterns:
            value = pattern.sub("[identifier redacted]", value)
        value = MAGDA_IDENTIFIER.sub("[identifier redacted]", value)
        return UUID_IDENTIFIER.sub("[identifier redacted]", value)

    def redact(value):
        if isinstance(value, str):
            return redact_text(value)
        if isinstance(value, list):
            return [redact(item) for item in value]
        if isinstance(value, dict):
            return {key: redact(item) for key, item in value.items()
                    if isinstance(key, str) and not _private_field(key)
                    and (task or key in DOCUMENT_FIELDS) and redact_text(key) == key}
        if value is None or isinstance(value, (int, float, bool)):
            return value
        return None
    return redact


def _task_anchor_strings(value, private=False):
    """Find explicitly marked answer/target anchors, never treat them as truth."""
    fields = {"expected_answers", "expected_answer", "known_answers", "anchors",
              "target", "targets", "target_id", "target_ids", "dataset_id", "dataset_ids",
              "expected_id", "expected_ids", "expected_dataset_ids", "target_dataset_ids"}
    normalized_fields = {re.sub(r"[^a-z0-9]", "", field.lower()) for field in fields}
    result = []
    if isinstance(value, dict):
        for key, item in value.items():
            normalized = re.sub(r"[^a-z0-9]", "", key.lower())
            result.extend(_task_anchor_strings(item, private or normalized in normalized_fields or normalized.startswith("expected")))
    elif isinstance(value, list):
        for item in value:
            result.extend(_task_anchor_strings(item, private))
    elif private and isinstance(value, str) and value:
        result.append(value)
    return result


def build_pool(queries, runs, seed=3901, depth=10):
    """Return (public_packets, private_mapping); never mutate input records.

    Pool all systems' first ``depth`` hits, deduplicating (query_id, dataset_id).
    Metadata conflicts resolve by canonical lexical order, independent of origin
    and input order; raw alternatives remain in private source_provenance.
    """
    if isinstance(depth, bool) or not isinstance(depth, int) or depth < 1:
        raise ValueError("pool depth must be a positive integer")
    query_map = _queries(queries)
    systems = _runs(runs, query_map)
    pairs = defaultdict(list)
    all_ids = _task_anchor_strings(queries) + list(query_map)
    for system in sorted(systems):
        for query_id, run in sorted(systems[system].items()):
            hits = _ranked_hits(run)
            all_ids.extend(hit["id"] for hit in hits)
            for hit in hits:
                if hit["rank"] > depth:
                    continue
                pairs[(query_id, hit["id"])].append({
                    "system": system, "rank": hit["rank"],
                    "score": hit.get("score"), "hit": hit,
                    "config": run.get("config"),
                })
    redact_document = _redactor(all_ids)
    redact_task = _redactor(all_ids, task=True)
    entries = []
    for (query_id, dataset_id), provenance in sorted(pairs.items()):
        pair_id = "p_" + _opaque(seed, "pair", [query_id, dataset_id])
        metadata = min((item["hit"].get("metadata", {}) for item in provenance), key=_canonical)
        document = redact_document(metadata)
        document["document_id"] = "d_" + _opaque(seed, "document", dataset_id)
        task = {field: redact_task(query_map[query_id][field]) for field in TASK_FIELDS}
        packet = {"pair_id": pair_id, "task": task, "document": document}
        private = {
            "pair_id": pair_id, "query_id": query_id, "dataset_id": dataset_id,
            "source_provenance": sorted(provenance, key=_canonical),
            "seed": seed, "pool_depth": depth,
        }
        entries.append((packet, private))
    random.Random(str(seed)).shuffle(entries)
    packets, mapping = [], []
    for order, (packet, private) in enumerate(entries, 1):
        private["pool_order"] = order
        packets.append(packet)
        mapping.append(private)
    return packets, mapping


def _judgments(records, pair_ids):
    result = {}
    for record in records:
        pair_id = _identifier(record.get("pair_id"), "judgment pair_id")
        if pair_id not in pair_ids:
            raise ValueError(f"judgment refers to unknown pair: {pair_id}")
        if pair_id in result:
            raise ValueError(f"duplicate judgment for pair: {pair_id}")
        grade = record.get("grade")
        if grade != "U" and (isinstance(grade, bool) or not isinstance(grade, int) or not 0 <= grade <= 3):
            raise ValueError("grade must be an integer 0..3 or 'U'")
        if "evidence" not in record or not isinstance(record["evidence"], (str, list, dict)):
            raise ValueError("judgment evidence must be recorded as text, list or object")
        result[pair_id] = grade
    return result


def ndcg_at_k(ranked_ids, grades, k=10, condensed=False, ranks=None):
    """Pooled NDCG; None without numeric grades or when pooled IDCG is zero.

    Default: preserve submitted positions, assuming zero gain for missing/U.
    ``ranks`` may supply sparse original ranks. ``condensed=True`` instead drops
    missing/U hits before the cutoff. IDCG always uses all numeric pool grades.
    """
    numeric = {key: value for key, value in grades.items() if isinstance(value, int) and not isinstance(value, bool)}
    if not numeric:
        return None
    ideal = sorted(numeric.values(), reverse=True)[:k]
    denominator = sum((2 ** grade - 1) / math.log2(index + 2) for index, grade in enumerate(ideal))
    if not denominator:
        return None
    if condensed:
        ordered = [numeric[dataset_id] for dataset_id in ranked_ids if dataset_id in numeric][:k]
        numerator = sum((2 ** grade - 1) / math.log2(index + 2) for index, grade in enumerate(ordered))
    else:
        positions = list(range(1, len(ranked_ids) + 1)) if ranks is None else ranks
        if len(positions) != len(ranked_ids):
            raise ValueError("ranks must match ranked_ids length")
        numerator = sum((2 ** numeric.get(dataset_id, 0) - 1) / math.log2(rank + 1)
                        for dataset_id, rank in zip(ranked_ids, positions) if rank <= k)
    return numerator / denominator


def _mean(values):
    values = [value for value in values if value is not None]
    return statistics.mean(values) if values else None


def _percentile(values, probability):
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * probability
    lower = math.floor(position)
    upper = math.ceil(position)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def _timing_summary(values):
    return {"n": len(values), "samples_ms": values,
            "median_ms": statistics.median(values) if values else None,
            "p95_ms": _percentile(values, .95)}


def _latencies(records):
    groups = defaultdict(lambda: defaultdict(list))
    for run in records:
        samples = run.get("latency_samples_ms")
        if samples is None:
            samples = [] if run.get("latency_ms") is None else [run["latency_ms"]]
        if not isinstance(samples, list):
            raise ValueError("latency_samples_ms must be a list")
        config = run.get("config")
        warmup = run.get("warmup", config.get("warmup") if isinstance(config, dict) else None)
        if warmup is not None and not isinstance(warmup, bool):
            raise ValueError("warmup must be a boolean when provided")
        label = "warmup" if warmup is True else "non_warmup" if warmup is False else "unlabeled"
        groups[run["system"]]  # Include systems with no timings.
        for sample in samples:
            if isinstance(sample, bool) or not isinstance(sample, (int, float)) or not math.isfinite(sample) or sample < 0:
                raise ValueError("latencies must be finite nonnegative numbers")
            groups[run["system"]][label].append(sample)
    result = {}
    for system, labels in sorted(groups.items()):
        result[system] = {label: _timing_summary(labels[label]) for label in ("warmup", "non_warmup", "unlabeled")}
        result[system]["excluding_explicit_warmup"] = _timing_summary(labels["non_warmup"] + labels["unlabeled"])
    return result


def _anchor_map(records, queries):
    result = {}
    for record in records:
        query_id = record.get("query_id")
        if query_id not in queries or query_id in result:
            raise ValueError("anchors must have unique known query_id values")
        ids = record.get("dataset_ids")
        if not isinstance(ids, list) or not ids:
            raise ValueError("anchor dataset_ids must be a nonempty list")
        result[query_id] = set(_identifier(value, "anchor dataset id") for value in ids)
    return result


def _comparison(rows, baseline, candidate, samples, seed):
    comparisons = {}
    for view in VIEWS:
        by_system = defaultdict(dict)
        for row in rows:
            if row["view"] == view:
                by_system[row["system"]][row["query_id"]] = row["ndcg_at_10"]
        differences = []
        for query_id in sorted(set(by_system[baseline]) & set(by_system[candidate])):
            left, right = by_system[baseline][query_id], by_system[candidate][query_id]
            if left is not None and right is not None:
                differences.append((query_id, right - left))
        values = [value for _, value in differences]
        bootstrap = {"requested_samples": samples, "performed": False,
                     "unit": "query", "seed": seed, "minimum_comparable_queries": 10}
        if samples and len(values) >= 10:
            rng = random.Random(str(seed) + ":" + view)
            means = [statistics.mean(rng.choices(values, k=len(values))) for _ in range(samples)]
            bootstrap.update(performed=True, confidence_level=.95,
                             mean_delta_ci=[_percentile(means, .025), _percentile(means, .975)],
                             interpretation="exploratory paired percentile interval; assumes exchangeable independent queries")
        else:
            bootstrap["reason"] = "disabled (opt in with bootstrap_samples)" if not samples else "fewer than 10 comparable queries; small-n interval withheld"
        comparisons[view] = {
            "baseline": baseline, "candidate": candidate, "n": len(values),
            "candidate_wins": sum(value > 1e-12 for value in values),
            "ties": sum(abs(value) <= 1e-12 for value in values),
            "candidate_losses": sum(value < -1e-12 for value in values),
            "mean_candidate_minus_baseline": _mean(values),
            "per_query_deltas": [{"query_id": query_id, "delta": delta} for query_id, delta in differences],
            "bootstrap": bootstrap,
        }
    return comparisons


def evaluate(queries, runs, mapping, judge_a, judge_b, anchors=None,
             baseline=None, candidate=None, bootstrap_samples=0, seed=3901):
    """Return a self-contained report including raw inputs for recomputation.

    Each independent judgment file may contain at most one record per pair.
    Missing and explicit U are distinguishable in coverage. Judge identity and
    evidence are retained verbatim; this module cannot establish independence
    or verify the factual correctness of an assessor's evidence.
    """
    if isinstance(bootstrap_samples, bool) or not isinstance(bootstrap_samples, int) or bootstrap_samples < 0:
        raise ValueError("bootstrap_samples must be a nonnegative integer")
    if 0 < bootstrap_samples < 100:
        raise ValueError("use at least 100 bootstrap samples, or 0 to disable")
    query_map = _queries(queries)
    systems = _runs(runs, query_map)
    pair_map, seen = {}, set()
    for item in mapping:
        pair_id = _identifier(item.get("pair_id"), "mapping pair_id")
        query_id = item.get("query_id")
        dataset_id = _identifier(item.get("dataset_id"), "mapping dataset_id")
        if query_id not in query_map or pair_id in pair_map or (query_id, dataset_id) in seen:
            raise ValueError("mapping must contain unique pairs for known queries")
        pair_map[pair_id] = item
        seen.add((query_id, dataset_id))
    a, b = _judgments(judge_a, pair_map), _judgments(judge_b, pair_map)
    views = {"judge_a": a, "judge_b": b,
             "consensus": {pair_id: a[pair_id] if pair_id in a and pair_id in b and a[pair_id] == b[pair_id] and a[pair_id] != "U" else "U" for pair_id in pair_map}}
    disagreements = []
    for pair_id in sorted(pair_map):
        if pair_id not in a or pair_id not in b or a[pair_id] != b[pair_id] or a[pair_id] == "U":
            disagreements.append({"pair_id": pair_id, "judge_a": a.get(pair_id), "judge_b": b.get(pair_id),
                                  "reason": "missing_judgment" if pair_id not in a or pair_id not in b else "unassessable" if a[pair_id] == b[pair_id] else "disagreement",
                                  "consensus": "U"})
    anchor_map = _anchor_map(anchors or [], query_map)
    rows = []
    pool_coverage = []
    for view, grades in views.items():
        per_query = defaultdict(dict)
        counts = defaultdict(lambda: {"pooled": 0, "judged": 0, "u": 0, "unjudged": 0})
        pair_for_doc = {}
        for pair_id, item in pair_map.items():
            query_id, dataset_id = item["query_id"], item["dataset_id"]
            pair_for_doc[(query_id, dataset_id)] = pair_id
            count = counts[query_id]
            count["pooled"] += 1
            if pair_id not in grades:
                count["unjudged"] += 1
            elif grades[pair_id] == "U":
                count["u"] += 1
            else:
                count["judged"] += 1
                per_query[query_id][dataset_id] = grades[pair_id]
        zero_idcg = {query_id: bool(per_query[query_id]) and not any(per_query[query_id].values())
                     for query_id in query_map}
        for query_id in sorted(query_map):
            count = counts[query_id]
            pool_coverage.append({"view": view, "query_id": query_id, "zero_idcg": zero_idcg[query_id], **count,
                                  "judged_fraction": count["judged"] / count["pooled"] if count["pooled"] else None})
        for system, system_runs in sorted(systems.items()):
            for query_id, query in sorted(query_map.items()):
                run = system_runs.get(query_id)
                hits = _ranked_hits(run) if run else []
                ranked = [hit["id"] for hit in hits]
                top = [hit["id"] for hit in hits if hit["rank"] <= 10]
                judged = explicit_u = 0
                for dataset_id in top:
                    pair_id = pair_for_doc.get((query_id, dataset_id))
                    grade = grades.get(pair_id)
                    judged += isinstance(grade, int) and not isinstance(grade, bool)
                    explicit_u += grade == "U"
                known = anchor_map.get(query_id)
                first = next((hit["rank"] for hit in hits if hit["rank"] <= 10 and known and hit["id"] in known), None)
                rows.append({
                    "view": view, "system": system, "query_id": query_id,
                    "category": query["category"], "split": query["split"], "run_present": run is not None,
                    "zero_idcg": zero_idcg[query_id],
                    "ndcg_at_10": ndcg_at_k(ranked, per_query[query_id], ranks=[hit["rank"] for hit in hits]) if run else None,
                    "condensed_ndcg_at_10": ndcg_at_k(ranked, per_query[query_id], condensed=True) if run else None,
                    "retrieved_at_10": len(top), "judged_at_10": judged,
                    "u_at_10": explicit_u, "unjudged_at_10": len(top) - judged - explicit_u,
                    "judged_fraction_at_10": judged / len(top) if top else None,
                    "mrr_at_10": (1.0 / first if first else 0.0) if known is not None and run else None,
                    "success_at_5": int(any(hit["id"] in known and hit["rank"] <= 5 for hit in hits)) if known is not None and run else None,
                })
    overall, by_category = [], []
    for view in VIEWS:
        for system in sorted(systems):
            selected = [row for row in rows if row["view"] == view and row["system"] == system]
            for category in [None] + sorted({query["category"] for query in query_map.values()}):
                group = [row for row in selected if category is None or row["category"] == category]
                summary = {"view": view, "system": system, "n_queries": len(group),
                           "n_runs": sum(row["run_present"] for row in group),
                           "n_ndcg_queries": sum(row["ndcg_at_10"] is not None for row in group),
                           "n_zero_idcg_queries": sum(row["zero_idcg"] for row in group),
                           "n_anchor_queries": sum(row["mrr_at_10"] is not None for row in group),
                           "ndcg_at_10": _mean(row["ndcg_at_10"] for row in group),
                           "condensed_ndcg_at_10": _mean(row["condensed_ndcg_at_10"] for row in group),
                           "mrr_at_10": _mean(row["mrr_at_10"] for row in group),
                           "success_at_5": _mean(row["success_at_5"] for row in group),
                           "retrieved_at_10": sum(row["retrieved_at_10"] for row in group),
                           "judged_at_10": sum(row["judged_at_10"] for row in group),
                           "u_at_10": sum(row["u_at_10"] for row in group),
                           "unjudged_at_10": sum(row["unjudged_at_10"] for row in group)}
                summary["judged_fraction_at_10"] = summary["judged_at_10"] / summary["retrieved_at_10"] if summary["retrieved_at_10"] else None
                if category is None:
                    overall.append(summary)
                else:
                    by_category.append({"category": category, **summary})
    if (baseline is None) != (candidate is None):
        raise ValueError("baseline and candidate must be supplied together")
    if baseline is not None and (baseline not in systems or candidate not in systems or baseline == candidate):
        raise ValueError("baseline and candidate must be distinct known systems")
    return {
        "schema_version": 1, "settings": {"seed": seed, "bootstrap_samples": bootstrap_samples,
            "ndcg": "original submitted ranks, U/unjudged zero gain, pooled IDCG, exponential gain, log2 discount, k=10",
            "condensed_ndcg": "secondary: drop U/unjudged before cutoff; same pooled IDCG",
            "zero_idcg": "numeric pooled judgments exist but all grades are zero: NDCG undefined/null for all systems; exclude from means and comparisons",
            "p95": "linear interpolation, (n-1)*0.95", "consensus": "identical numeric grades only"},
        "limitations": LIMITATIONS, "overall": overall, "by_category": by_category,
        "per_query": rows, "pool_coverage": pool_coverage,
        "known_answers": {
            "source": "separately supplied anchors only; independent of assessor grades",
            "per_query": [{key: row[key] for key in ("system", "query_id", "category", "split", "run_present", "mrr_at_10", "success_at_5")}
                          for row in rows if row["view"] == "judge_a"],
            "overall": [{key: row[key] for key in ("system", "n_anchor_queries", "mrr_at_10", "success_at_5")}
                        for row in overall if row["view"] == "judge_a"],
            "by_category": [{key: row[key] for key in ("system", "category", "n_anchor_queries", "mrr_at_10", "success_at_5")}
                            for row in by_category if row["view"] == "judge_a"],
        },
        "unresolved_pairs": disagreements,
        "comparison": _comparison(rows, baseline, candidate, bootstrap_samples, seed) if baseline is not None else None,
        "latency": _latencies(runs),
        "raw_records": {"queries": queries, "runs": runs, "mapping": mapping,
                        "judge_a": judge_a, "judge_b": judge_b, "anchors": anchors or []},
    }


def write_metrics_csv(path, report):
    """Write per-query sensitivity rows; JSON contains aggregates and raw inputs."""
    fields = ["view", "system", "query_id", "category", "split", "run_present", "zero_idcg", "ndcg_at_10", "condensed_ndcg_at_10",
              "retrieved_at_10", "judged_at_10", "u_at_10", "unjudged_at_10",
              "judged_fraction_at_10", "mrr_at_10", "success_at_5"]
    with open(path, "w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(report["per_query"])


def _distinct_paths(inputs, outputs):
    resolved = [Path(path).resolve() for path in outputs]
    if len(set(resolved)) != len(resolved) or set(resolved) & {Path(path).resolve() for path in inputs if path}:
        raise ValueError("output paths must be distinct and must not overwrite input files")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    pool = commands.add_parser("pool", help="create public blind packets and a separate PRIVATE mapping")
    pool.add_argument("--queries", required=True)
    pool.add_argument("--runs", required=True)
    pool.add_argument("--packets", required=True)
    pool.add_argument("--mapping", required=True)
    pool.add_argument("--seed", type=int, default=3901)
    pool.add_argument("--depth", type=int, default=10)
    metrics = commands.add_parser("metrics", help="evaluate independent judgments and optional objective anchors")
    for name in ("queries", "runs", "mapping", "judge-a", "judge-b", "output", "csv"):
        metrics.add_argument("--" + name, required=True)
    metrics.add_argument("--anchors", help="PRIVATE JSONL {query_id,dataset_ids:[...]}; never inferred from judges")
    metrics.add_argument("--baseline")
    metrics.add_argument("--candidate")
    metrics.add_argument("--bootstrap-samples", type=int, default=0, help="opt-in; >=100 samples and >=10 comparable queries")
    metrics.add_argument("--seed", type=int, default=3901)
    args = parser.parse_args(argv)
    try:
        if args.command == "pool":
            _distinct_paths([args.queries, args.runs], [args.packets, args.mapping])
            packets, mapping = build_pool(read_jsonl(args.queries), read_jsonl(args.runs), args.seed, args.depth)
            # Write PRIVATE first: do not release a public pool without its mapping.
            write_jsonl(args.mapping, mapping)
            write_jsonl(args.packets, packets)
        else:
            _distinct_paths([args.queries, args.runs, args.mapping, args.judge_a, args.judge_b, args.anchors], [args.output, args.csv])
            report = evaluate(read_jsonl(args.queries), read_jsonl(args.runs), read_jsonl(args.mapping),
                              read_jsonl(args.judge_a), read_jsonl(args.judge_b),
                              read_jsonl(args.anchors) if args.anchors else None,
                              args.baseline, args.candidate, args.bootstrap_samples, args.seed)
            with open(args.output, "w", encoding="utf-8") as stream:
                json.dump(report, stream, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False)
                stream.write("\n")
            write_metrics_csv(args.csv, report)
    except (ValueError, OSError, TypeError) as exc:
        parser.error(str(exc))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
