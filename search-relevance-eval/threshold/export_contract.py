#!/usr/bin/env python3
"""Offline assertions over actual production exports; never construct/rewrite DSL.

Pair comparison covers the complete request (including HTTP params), not exporter
provenance/config_sha: an explicit config override necessarily changes that hash.
"""
import argparse
import hashlib
import json
import math
import pathlib

BASELINE = "ba18156201c50565c85c62f76469245925994ece"
ROOT_FIELD = "queryContextVector"
NESTED_FIELD = "distributions.queryContextVector"
FIELDS = (ROOT_FIELD, NESTED_FIELD)
THRESHOLD_LABELS = {"ms_050": .50, "ms_048": .48, "ms_046": .46, "ms_045": .45,
                    "ms_044": .44, "ms_042": .42, "ms_040": .40}
DIAGNOSTIC_LABEL = "topk10diag"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def score(value):
    require(type(value) in (int, float) and math.isfinite(value) and 0 < value <= 1,
            "min_score must be a finite number in (0, 1]")
    return value


def canonical(value):
    """Stable JSON bytes; array order and numeric representation are retained."""
    return json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False,
                      separators=(",", ":")).encode("utf8")


def walk(value, path=()):
    yield path, value
    if isinstance(value, dict):
        for key, child in value.items():
            yield from walk(child, path + (key,))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from walk(child, path + (index,))


def at(value, path):
    for part in path:
        value = value[part]
    return value


def knn_copies(body):
    result = []
    for path, node in walk(body):
        if isinstance(node, dict) and "knn" in node:
            require(set(node) == {"knn"}, "Unexpected kNN query envelope")
            knn = node["knn"]
            require(isinstance(knn, dict) and len(knn) == 1, "Expected one kNN field")
            field, payload = next(iter(knn.items()))
            require(field in FIELDS and isinstance(payload, dict), "Unexpected kNN field/payload")
            result.append((path + ("knn", field), field, payload))
    require(bool(result), "No kNN queries found")
    return result


def _eligibility(filters, field):
    prefix = "distributions." if field == NESTED_FIELD else ""
    terms = [node["term"] for _, node in walk(filters) if isinstance(node, dict) and "term" in node]
    require({prefix + "tenantId": {"value": 0}} in terms, "Missing public-corpus tenant filter")
    require({prefix + "publishingState": {"value": "published"}} in terms,
            "Missing publishing-state eligibility filter")
    if prefix:
        require(any(node == {"bool": {"must_not": [{"exists": {"field": prefix + "publishingState"}}]}}
                    for _, node in walk(filters)), "Missing legacy-published distribution eligibility")


def validate_request(request, *, min_score=None, k=None):
    """Validate raw post-3909 public-corpus root/nested/facet copies.

    Exactly one mode must be explicit. Structural validation is not provenance:
    source pin checks and actual Scala export remain the caller's responsibility.
    """
    require((min_score is None) != (k is None), "Specify exactly one of min_score or k")
    if min_score is not None:
        score(min_score)
    else:
        require(type(k) is int and k > 0, "k must be a positive integer")
    require(isinstance(request, dict) and set(request) == {"body", "query_params", "method", "path"},
            "Expected complete production request envelope")
    require(request["method"] == "POST" and request["path"].endswith("/_search"), "Unexpected search endpoint")
    require(isinstance(request["query_params"], dict) and isinstance(request["query_params"].get("search_pipeline"), str),
            "Missing production pipeline request parameter")
    body = request["body"]
    require(isinstance(body, dict) and "post_filter" not in body and "search_pipeline" not in body,
            "Expected raw builder body, not normalized/transformed replay DSL")
    scorer = body.get("query", {}).get("function_score", {})
    require(scorer.get("score_mode") == "sum" and len(scorer.get("functions", [])) >= 2,
            "Missing production quality/function-score placement")
    require(scorer["functions"][:2] == [
        {"weight": 1.0}, {"field_value_factor": {"field": "quality", "missing": 1.0},
                          "filter": {"term": {"hasQuality": {"value": True}}}}],
            "Changed production quality scorer")
    copies = knn_copies(body)
    expected_scopes = {("query",), ("aggs", "Format-global"), ("aggs", "Publisher-global")}
    groups = {}
    vectors = []
    for path, field, payload in copies:
        scope = path[:1] if path[0] == "query" else path[:2]
        require(scope in expected_scopes, "Unexpected kNN query scope")
        groups.setdefault(scope, []).append(field)
        expected_keys = {"vector", "min_score" if k is None else "k"}
        if field == ROOT_FIELD:
            expected_keys.add("boost")
            require(type(payload.get("boost")) in (int, float) and payload["boost"] == 50,
                    "Dataset kNN boost must remain 50")
        # Production nested boost is absent (implicit 1), never copied from root.
        if k is not None:
            expected_keys.add("filter")
        require(set(payload) == expected_keys, "Changed kNN payload keys/mode/boost/filter")
        vector = payload["vector"]
        require(isinstance(vector, list) and bool(vector) and all(type(v) in (int, float) and math.isfinite(v) for v in vector),
                "Invalid query vector")
        vectors.append(canonical(vector))
        query_path = path[:-2]
        if k is None:
            require(type(payload["min_score"]) in (int, float) and payload["min_score"] == min_score,
                    "Unexpected min_score in kNN copy")
            require(query_path[-3:] == ("bool", "must", 0), "Radial kNN lost same-scope bool wrapper")
            wrapper = at(body, query_path[:-3])
            require(set(wrapper) == {"bool"} and set(wrapper["bool"]) == {"must", "filter"}
                    and len(wrapper["bool"]["must"]) == 1, "Changed radial wrapper")
            filters = wrapper["bool"]["filter"]
            branch_path = query_path[:-3]
        else:
            require(type(payload["k"]) is int and payload["k"] == k, "Unexpected diagnostic k")
            filters = payload["filter"]
            branch_path = query_path
        _eligibility(filters, field)
        if field == NESTED_FIELD:
            require(branch_path[-2:] == ("nested", "query"), "Distribution kNN escaped nested scope")
            require(at(body, branch_path[:-1])["path"] == "distributions", "Wrong nested path")
            branch_path = branch_path[:-2]
        require(branch_path[-3:] == ("hybrid", "queries", 1), "Changed raw hybrid family layout")
        hybrid = at(body, branch_path[:-2])
        require(set(hybrid) == {"queries"} and len(hybrid["queries"]) == 2, "Changed hybrid arity")
    require(set(groups) == expected_scopes and all(sorted(fields) == sorted(FIELDS) for fields in groups.values()),
            "Missing/duplicated root, nested or aggregation kNN copies")
    require(len(set(vectors)) == 1, "Query vectors differ across copies")
    return {"knn_copies": len(copies), "scopes": len(groups), "mode": "top-k" if k is not None else "min-score"}


def threshold_pair(reference, candidate, reference_score, candidate_score):
    """Allow ONLY numeric min_score value changes at every actual kNN payload."""
    validate_request(reference, min_score=reference_score)
    validate_request(candidate, min_score=candidate_score)
    allowed = {("body",) + path + ("min_score",) for path, _, _ in knn_copies(reference["body"])}
    changed = set()

    def compare(left, right, path=()):
        if path in allowed:
            require(type(left) in (int, float) and type(right) in (int, float), "Non-numeric threshold diff")
            if canonical(left) != canonical(right):
                changed.add(path)
            return
        require(type(left) is type(right), "Non-threshold type change at " + repr(path))
        if isinstance(left, dict):
            require(left.keys() == right.keys(), "Non-threshold key change at " + repr(path))
            for key in left:
                compare(left[key], right[key], path + (key,))
        elif isinstance(left, list):
            require(len(left) == len(right), "Non-threshold array change at " + repr(path))
            for index, (a, b) in enumerate(zip(left, right)):
                compare(a, b, path + (index,))
        else:
            require(canonical(left) == canonical(right), "Non-threshold value change at " + repr(path))

    compare(reference, candidate)
    require(changed == (allowed if canonical(reference_score) != canonical(candidate_score) else set()),
            "Not every kNN copy changed threshold")
    return {"knn_copies": len(allowed), "changed_min_scores": len(changed), "other_changes": 0}


def role_threshold_pair(reference, candidate, reference_score=.5,
                        dataset_min_score=.45, distribution_min_score=.5):
    """Diagnostic-only check of four frozen dataset/distribution cutoff pairs.

    This does not construct/patch a request or weaken any primary uniform-mode
    API. The reference must be an actual uniform .50 production export. Exact
    recursive equality except six typed numeric leaves proves candidate shape,
    boosts, filters, vectors, aggregation copies and all HTTP params unchanged.
    Execution/target-freeze authorization remains the caller's responsibility.
    """
    require(type(reference_score) in (int, float) and reference_score == .5,
            "Role diagnostic requires uniform .50 reference")
    score(dataset_min_score)
    score(distribution_min_score)
    require((dataset_min_score, distribution_min_score) in ((.5, .5), (.45, .45), (.45, .5), (.5, .45)),
            "Unregistered role diagnostic cutoff pair")
    validate_request(reference, min_score=reference_score)
    targets = {("body",) + path + ("min_score",):
               dataset_min_score if field == ROOT_FIELD else distribution_min_score
               for path, field, _ in knn_copies(reference["body"])}
    changed = set()

    def compare(left, right, path=()):
        if path in targets:
            require(type(right) in (int, float) and right == targets[path],
                    "Incorrect role threshold at " + repr(path))
            if canonical(left) != canonical(right):
                changed.add(path)
            return
        require(type(left) is type(right), "Non-threshold type change at " + repr(path))
        if isinstance(left, dict):
            require(left.keys() == right.keys(), "Non-threshold key change at " + repr(path))
            for key in left:
                compare(left[key], right[key], path + (key,))
        elif isinstance(left, list):
            require(len(left) == len(right), "Non-threshold array change at " + repr(path))
            for index, (a, b) in enumerate(zip(left, right)):
                compare(a, b, path + (index,))
        else:
            require(canonical(left) == canonical(right), "Non-threshold value change at " + repr(path))

    compare(reference, candidate)
    expected_changes = {path for path, target in targets.items() if canonical(reference_score) != canonical(target)}
    require(changed == expected_changes, "Not every intended role/facet copy changed threshold")
    return {"diagnostic_only": True, "dataset_min_score": dataset_min_score,
            "distribution_min_score": distribution_min_score, "knn_copies": len(targets),
            "changed_min_scores": len(changed), "other_changes": 0}


def validate_exports(rows, *, min_score=None, k=None, baseline_commit=BASELINE):
    require(isinstance(rows, list) and bool(rows), "Empty export")
    ids = [row["query_id"] for row in rows]
    require(len(set(ids)) == len(ids), "Duplicate query IDs")
    for row in rows:
        require(row.get("baseline_commit") == baseline_commit, "Unexpected production baseline label")
        require("diagnostic_mode" not in row, "Primary request sets cannot contain attribution controls")
        validate_request(row["request"], min_score=min_score, k=k)
    return {"queries": len(rows), "mode": "top-k" if k is not None else "min-score"}


def validate_request_sets(request_sets, config_paths=None):
    """Runner hook: validate loaded label -> Scala-export rows before execution.

    Subsets require the .50 reference and at least one comparison arm; the frozen
    study adapter must separately require all eight registered labels. No engine
    calls or DSL transformations occur here. Diagnostic k10 is not subjected to
    a radial-only pair diff, because its production filter placement differs.
    """
    require(isinstance(request_sets, dict) and len(request_sets) >= 2 and "ms_050" in request_sets,
            "Require ms_050 reference and at least one comparison request set")
    require(set(request_sets) <= set(THRESHOLD_LABELS) | {DIAGNOSTIC_LABEL}, "Unknown request-set label")
    if config_paths is not None:
        require(isinstance(config_paths, dict) and set(config_paths) == set(request_sets),
                "Config paths must cover exactly the request-set labels")
    by_id = {}
    report = {"reference": "ms_050", "query_count": None, "request_sets": {},
              "full_frozen_label_set": set(request_sets) == set(THRESHOLD_LABELS) | {DIAGNOSTIC_LABEL}}
    for label, rows in request_sets.items():
        diagnostic = label == DIAGNOSTIC_LABEL
        validate_exports(rows, k=10 if diagnostic else None,
                         min_score=None if diagnostic else THRESHOLD_LABELS[label])
        require(all(isinstance(row["query_id"], str) and bool(row["query_id"].strip()) for row in rows),
                "Expected nonempty string query IDs")
        by_id[label] = {row["query_id"]: row for row in rows}
        receipt = {"mode": "top-k-diagnostic" if diagnostic else "min-score", "queries": len(rows),
                   "knn_copies_per_query": 6,
                   "exports_canonical_sha256": hashlib.sha256(canonical(rows)).hexdigest(),
                   "request_sha256_by_query": {row["query_id"]: hashlib.sha256(canonical(row["request"])).hexdigest()
                                                for row in rows}}
        if config_paths is not None:
            path = pathlib.Path(config_paths[label])
            config_bytes = path.read_bytes()
            exported_config = json.loads(config_bytes)
            hybrid = exported_config["elasticSearch"]["indices"]["datasets"]["hybridSearch"]
            config_sha = exported_config.get("config_sha")
            require(isinstance(config_sha, str) and len(config_sha) == 64
                    and all(row.get("config_sha") == config_sha for row in rows),
                    "Exported rows/config provenance hash mismatch")
            if diagnostic:
                # --k preserves legacy fallback config; these radial values are
                # ignored by production's k-first serializer, not emitted DSL.
                require(type(hybrid.get("k")) is int and hybrid["k"] == 10, "Diagnostic config requires k10")
            else:
                require(type(hybrid.get("minScore")) in (int, float)
                        and hybrid["minScore"] == THRESHOLD_LABELS[label]
                        and hybrid.get("k") is None and hybrid.get("maxDistance") is None,
                        "Radial config must exclusively select intended minScore")
            receipt.update(config_file_sha256=hashlib.sha256(config_bytes).hexdigest(), config_sha=config_sha)
        report["request_sets"][label] = receipt
    reference = by_id["ms_050"]
    report["query_count"] = len(reference)
    for label, rows in by_id.items():
        require(rows.keys() == reference.keys(), "Request sets have different query-ID sets")
        if label != DIAGNOSTIC_LABEL:
            pairs = [threshold_pair(reference[qid]["request"], rows[qid]["request"], .5, THRESHOLD_LABELS[label])
                     for qid in sorted(reference)]
            report["request_sets"][label].update(
                changed_min_scores=sum(pair["changed_min_scores"] for pair in pairs), other_request_changes=0)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--requests", type=pathlib.Path, required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--min-score", type=float)
    mode.add_argument("--k", type=int)
    parser.add_argument("--reference", type=pathlib.Path)
    parser.add_argument("--reference-min-score", type=float, default=.5)
    parser.add_argument("--baseline-commit", default=BASELINE)
    args = parser.parse_args()
    load = lambda path: [json.loads(line) for line in path.read_text(encoding="utf8").splitlines() if line.strip()]
    rows = load(args.requests)
    result = validate_exports(rows, min_score=args.min_score, k=args.k, baseline_commit=args.baseline_commit)
    if args.reference:
        require(args.min_score is not None, "Threshold pair comparison requires --min-score")
        reference = load(args.reference)
        validate_exports(reference, min_score=args.reference_min_score, baseline_commit=args.baseline_commit)
        require([row["query_id"] for row in rows] == [row["query_id"] for row in reference], "Pair query IDs/order differ")
        result["pairs"] = [threshold_pair(a["request"], b["request"], args.reference_min_score, args.min_score)
                           for a, b in zip(reference, rows)]
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
