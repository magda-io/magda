#!/usr/bin/env python3
"""Explicit non-primary probes; reuse exporter contracts and shared HTTP receipts.

None of these bodies is a candidate ranking implementation. Mixed-role probes
change only registered numeric leaves. Exhaustive probes change response window
and source projection, not query predicates. Native-score probes use OpenSearch's
exact kNN script and must be calibrated against the actual Faiss index separately.
"""
import copy
import datetime
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import time
import urllib.parse

ROOT = Path(__file__).resolve().parent


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


replay = load("threshold_diag_replay", ROOT.parent / "run.py")
contract = load("threshold_diag_contract", ROOT / "export_contract.py")


def digest(value):
    return hashlib.sha256(contract.canonical(value)).hexdigest()


def mixed_export(row, dataset_score, distribution_score):
    """Counterfactual diagnostics ONLY; never accepted by primary arm validation."""
    source = row["request"]
    contract.validate_request(source, min_score=.50)
    result = copy.deepcopy(row)
    for _, field, payload in contract.knn_copies(result["request"]["body"]):
        payload["min_score"] = dataset_score if field == contract.ROOT_FIELD else distribution_score
    proof = contract.role_threshold_pair(source, result["request"], reference_score=.50,
                                         dataset_min_score=dataset_score,
                                         distribution_min_score=distribution_score)
    result["diagnostic_mode"] = "mixed_role_threshold"
    result["diagnostic_source_request_sha256"] = digest(source)
    result["diagnostic_role_contract"] = proof
    return result


ROLE_PAIRS = {"diag_dataset045_nested050": (.45, .50),
              "diag_dataset050_nested045": (.50, .45)}
REGISTERED_ROLE_PAIRS = [[.50, .50], [.45, .45], [.45, .50], [.50, .45]]


def role_runner():
    """Private registry, SAME unchanged measurement implementation; primary stays8."""
    runner = load("threshold_private_role_replay", ROOT.parent / "run.py")
    runner.EXPORTED_VARIANTS = tuple(ROLE_PAIRS)
    return runner


def role_validator(reference_path, config_path):
    """Bind actual uniform Scala source/config; mixed rows are counterfactuals."""
    reference_path, config_path = Path(reference_path), Path(config_path)
    source_sha, config_file_sha = replay.sha(reference_path), replay.sha(config_path)
    reference = replay.load_jsonl(reference_path)
    contract.validate_exports(reference, min_score=.50)
    by_id = {row["query_id"]: row for row in reference}
    config = json.loads(config_path.read_text())
    config_sha = config.get("config_sha")
    if not isinstance(config_sha, str) or not all(row.get("config_sha") == config_sha for row in reference):
        raise ValueError("Role baseline config/source hash mismatch")
    hybrid = config["elasticSearch"]["indices"]["datasets"]["hybridSearch"]
    if hybrid.get("minScore") != .50 or hybrid.get("k") is not None or hybrid.get("maxDistance") is not None:
        raise ValueError("Role baseline must be actual uniform .50 configuration")

    def validate(request_sets, config_paths=None):
        if replay.sha(reference_path) != source_sha or replay.sha(config_path) != config_file_sha:
            raise ValueError("Actual role source changed")
        if set(request_sets) != set(ROLE_PAIRS) or config_paths is None or set(config_paths) != set(ROLE_PAIRS):
            raise ValueError("Exactly the two fixed counterfactual role sets required")
        reports = {}
        for label, pair in ROLE_PAIRS.items():
            path = Path(config_paths[label])
            if path.resolve() != config_path.resolve() or replay.sha(path) != config_file_sha:
                raise ValueError("Mixed roles must honestly reference original uniform source config")
            rows = request_sets[label]
            ids = [row["query_id"] for row in rows]
            if len(ids) != len(by_id) or len(set(ids)) != len(ids) or set(ids) != set(by_id):
                raise ValueError("Role diagnostics skipped/duplicated a frozen task")
            for row in rows:
                source = by_id[row["query_id"]]
                expected = mixed_export(source, *pair)
                if contract.canonical(row) != contract.canonical(expected):
                    raise ValueError("Mixed diagnostic changed more than registered leaves/metadata")
                contract.role_threshold_pair(source["request"], row["request"],
                    dataset_min_score=pair[0], distribution_min_score=pair[1])
            reports[label] = {"queries": len(rows), "dataset_min_score": pair[0], "distribution_min_score": pair[1],
                              "knn_copies_per_query": 6, "other_request_changes": 0}
        return {"diagnostic_only": True, "promotion_allowed": False,
                "mixed_rows_are_actual_Scala_exports": False,
                "source_request_file_sha256": source_sha, "source_config_file_sha256": config_file_sha,
                "source_config_sha": config_sha, "config_is_original_uniform_050_not_mixed": True,
                "request_sets": reports}
    return validate


def _project_response_payloads(node):
    if isinstance(node, list):
        return [_project_response_payloads(item) for item in node]
    if not isinstance(node, dict):
        return node
    out = {key: _project_response_payloads(value) for key, value in node.items()}
    for key in ("top_hits", "inner_hits"):
        if key in out and isinstance(out[key], dict):
            out[key]["_source"] = False
    return out


def exhaustive_request(request, size):
    if type(size) is not int or not 0 < size <= 10000:
        raise ValueError("Exhaustive diagnostic window must be1..10000")
    result = copy.deepcopy(request)
    body = _project_response_payloads(result["body"])
    body["size"] = size
    body["_source"] = False
    body["track_total_hits"] = True
    result["body"] = body
    return result


def native_request(vector, size, *, nested=False, child_window=100,
                   eligible_parent_filter=None, eligible_child_filter=None):
    """Exact, unboosted docvalue geometry; not HNSW membership or hybrid ranking."""
    if type(size) is not int or not 0 < size <= 10000:
        raise ValueError("Invalid native-score document window")
    if not vector or not all(type(v) in (int, float) and math.isfinite(v) for v in vector):
        raise ValueError("Expected a frozen numeric query vector")
    if type(nested) is not bool or type(child_window) is not int or not 0 < child_window <= 100:
        raise ValueError("Invalid native nested mode/inner-hit window")
    for value in (eligible_parent_filter, eligible_child_filter):
        if value is not None and (not isinstance(value, dict) or not value):
            raise ValueError("Eligibility must be an actual nonempty query predicate")
    if not nested and eligible_child_filter is not None:
        raise ValueError("Child eligibility supplied for a root probe")
    parent_filters = [{"term": {"tenantId": 0}}, {"term": {"publishingState": "published"}}]
    if eligible_parent_filter is not None:
        parent_filters.append(copy.deepcopy(eligible_parent_filter))
    field = contract.NESTED_FIELD if nested else contract.ROOT_FIELD
    prefix = "distributions." if nested else ""
    publishing = {"term": {prefix + "publishingState": "published"}}
    if nested:
        publishing = {"bool": {"should": [publishing,
            {"bool": {"must_not": [{"exists": {"field": prefix + "publishingState"}}]}}
        ], "minimum_should_match": 1}}
    filters = [{"exists": {"field": field}}, {"term": {prefix + "tenantId": 0}}, publishing]
    if nested and eligible_child_filter is not None:
        filters.append(copy.deepcopy(eligible_child_filter))
    if not nested:
        filters = [{"exists": {"field": field}}] + parent_filters
    query = {"script_score": {
        "query": {"bool": {"filter": filters}}, 
        "script": {"lang": "knn", "source": "knn_score", "params": {
            "field": field, "query_value": vector, "space_type": "l2"}}
    }}
    if nested:
        query = {"bool": {"filter": parent_filters, "must": [{"nested": {
            "path": "distributions", "score_mode": "max", "query": query,
            "inner_hits": {"name": "native_child_geometry", "size": child_window, "_source": False}}}]}}
    return {"size": size, "_source": False, "track_total_hits": True, "query": query}


def _complete(response, size, *, child_offsets=False):
    if response.get("timed_out") or response.get("_shards", {}).get("failed"):
        raise ValueError("Incomplete diagnostic search response")
    hits = response["hits"]["hits"]
    total = response["hits"]["total"]
    count = total["value"] if isinstance(total, dict) else total
    if isinstance(total, dict) and total.get("relation") != "eq":
        raise ValueError("Diagnostic total is not exact")
    identities = [(hit["_id"], json.dumps(hit.get("_nested"), sort_keys=True)) if child_offsets else hit["_id"]
                  for hit in hits]
    if child_offsets and any(type(hit.get("_nested", {}).get("offset")) is not int
                             or hit["_nested"]["offset"] < 0
                             or hit["_nested"].get("field") != "distributions" for hit in hits):
        raise ValueError("Native child identity lacks its actual distribution offset")
    if count != len(hits) or len(hits) > size or len(set(identities)) != len(hits):
        raise ValueError("Diagnostic membership is truncated or duplicated")
    return hits


def timed_probe(engine, path, body, *, receipt_sink=None):
    """One diagnostic request, no retries; retain UTC and full parsed-JSON hash."""
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    clock = time.perf_counter()
    try:
        response = replay.request(engine, "POST", path, body)
    except Exception as error:
        if receipt_sink is not None:
            receipt_sink({"request_started_utc": started,
                "request_completed_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "request_sha256": digest(body), "request_path": path, "diagnostic_only": True,
                "error_type": type(error).__name__, "error": str(error)})
        raise
    elapsed = (time.perf_counter() - clock) * 1000
    completed = datetime.datetime.now(datetime.timezone.utc).isoformat()
    receipt = replay.export_response_receipt(response, request_started_utc=started,
        request_completed_utc=completed, elapsed_ms=elapsed, request_sha256=digest(body),
        request_path=path, diagnostic_only=True)
    if receipt_sink is not None:
        receipt_sink(receipt)  # Persist before completeness checks can reject it.
    return response, receipt


def fetch_exhaustive(engine, index, request, size, *, primary_ids, receipt_sink=None):
    """Return complete full-window *diagnostic* membership, not an exact oracle.

    A caller MUST check every corresponding primary top10 is a subset and record
    any HNSW/window discrepancy. The collector window differs from primary10.
    """
    replay.local_url(engine)
    replay.owned(index)
    projected = exhaustive_request(request, size)
    params = dict(projected.get("query_params", {}))
    params["search_pipeline"] = "_none"
    response, receipt = timed_probe(engine, "/" + index + "/_search?" + urllib.parse.urlencode(params),
                                    projected["body"], receipt_sink=receipt_sink)
    hits = _complete(response, size)
    ids = [hit["_id"] for hit in hits]
    primary_ids = list(primary_ids)
    if any(not isinstance(value, str) or not value for value in primary_ids) or len(set(primary_ids)) != len(primary_ids):
        raise ValueError("Primary identities must be unique actual hit IDs")
    missing = sorted(set(primary_ids) - set(ids))
    return {"ids": ids, "complete": True,
            "primary_top10_subset": not missing, "primary_ids_missing_from_collector": missing,
            "primary_top10_checked": primary_ids,
            "method": "full_window_diagnostic_collector_not_exact_HNSW_oracle",
            "request_sha256": digest(projected), "source_request_sha256": digest(request),
            "receipt": receipt,
            "source_projection_changed": True, "window": size}


def fetch_native(engine, index, vector, size, *, nested=False, child_window=100,
                 eligible_parent_filter=None, eligible_child_filter=None, receipt_sink=None):
    replay.local_url(engine)
    replay.owned(index)
    body = native_request(vector, size, nested=nested, child_window=child_window,
                          eligible_parent_filter=eligible_parent_filter,
                          eligible_child_filter=eligible_child_filter)
    response, receipt = timed_probe(engine, "/" + index + "/_search?search_pipeline=_none", body,
                                    receipt_sink=receipt_sink)
    hits = _complete(response, size)
    result = {}
    for hit in hits:
        if not nested:
            result[hit["_id"]] = {"score": hit["_score"]}
            continue
        child_result = hit.get("inner_hits", {}).get("native_child_geometry", {})
        children = _complete(child_result, child_window, child_offsets=True) if "_shards" in child_result else None
        # inner_hits has hits.total but no shard envelope; validate the same tree.
        if children is None:
            children = _complete({"hits": child_result["hits"]}, child_window, child_offsets=True)
        if any(child["_id"] != hit["_id"] for child in children):
            raise ValueError("Native child identity belongs to a different parent")
        result[hit["_id"]] = {"score": hit["_score"], "children": [
            {"offset": child.get("_nested", {}).get("offset"), "score": child["_score"]}
            for child in children]}
    return {"scores": result, "request_sha256": digest(body),
            "source": "engine_exact_docvalues_l2", "approximate_radial_membership": False,
            "requires_Faiss_calibration": True, "receipt": receipt}
