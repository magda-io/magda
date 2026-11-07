#!/usr/bin/env python3
"""Post-latency, parent-gated NEW geometry/actual-membership diagnostics only.

Never embeds, installs, tunes, grades, or rewrites a primary request. Native exact
geometry, actual isolated Faiss membership and full-window hybrid membership are
separate observations; HNSW/window misses are retained, never inferred label0.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("threshold_collection_execute", ROOT / "execute.py")
execution = importlib.util.module_from_spec(spec)
spec.loader.exec_module(execution)
diag = execution.diagnostics
contract = execution.contract
replay = execution.replay
EPSILON = 1e-5


def emit(stream, value):
    stream.write(json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False) + "\n")
    stream.flush()


def identity(case, **extra):
    return dict(cohort=case["cohort"], seed=case["seed"], size=case["catalog_size"], **extra)


def projection(value):
    execution.require(isinstance(value, str) and value, "Missing exact source queryContext")
    return hashlib.sha256(value.encode("utf8")).hexdigest()


def inventory(documents, case, dimension):
    """Typed source inventory, no grades and no saved vectors/searchable prose."""
    indexed = execution.unique_rows(documents, "identifier")
    execution.require(len(indexed) == case["catalog_size"], "Inventory count differs")
    result = {}
    for identifier, doc in indexed.items():
        execution.require(doc.get("tenantId") == 0 and doc.get("publishingState") == "published",
                          "NEW geometry requires frozen public parent scope")
        execution.vector(doc.get("queryContextVector"), dimension)
        children = []
        seen = set()
        execution.require(len(doc.get("distributions", [])) <= 100, "Native inner-hit window would truncate")
        for offset, child in enumerate(doc.get("distributions", [])):
            cid = child.get("identifier")
            execution.require(isinstance(cid, str) and cid and cid not in seen, "Missing/duplicate actual child identifier")
            seen.add(cid)
            execution.require(child.get("tenantId") == 0 and child.get("publishingState") in (None, "published"),
                              "Unexpected nonpublic NEW child; do not silently drop scope")
            execution.vector(child.get("queryContextVector"), dimension)
            children.append({"distribution_id": cid, "offset": offset, "allowed": True, "dimension": dimension,
                "projection_sha256": projection(child.get("queryContext")),
                "vector_sha256": execution.digest(child["queryContextVector"])})
        result[identifier] = identity(case, dataset_id=identifier,
            root={"allowed": True, "dimension": dimension, "projection_sha256": projection(doc.get("queryContext")),
                  "vector_sha256": execution.digest(doc["queryContextVector"])}, children=children)
    return result


def source_wrappers(request, threshold):
    """Extract literal main-scope production kNN wrappers; no reimplementation."""
    contract.validate_request(request, min_score=threshold)
    body = request["body"]
    copies = [(path, field) for path, field, _ in contract.knn_copies(body) if path[0] == "query"]
    execution.require(len(copies) == 2, "Expected exactly main root+child kNN")
    result = {}
    for path, field in copies:
        wrapper_path = path[:-2][:-3]  # contract-checked bool.must[0].knn.FIELD.
        wrapper = contract.at(body, wrapper_path)
        if field == contract.ROOT_FIELD:
            result["root"] = copy.deepcopy(wrapper)
            result["parent_filters"] = copy.deepcopy(wrapper["bool"]["filter"])
        else:
            result["nested"] = {"nested": copy.deepcopy(contract.at(body, wrapper_path[:-1]))}
            result["child_filters"] = copy.deepcopy(wrapper["bool"]["filter"])
    return result


def isolated_request(request, threshold, role):
    wrappers = source_wrappers(request, threshold)
    execution.require(role in ("root", "nested"), "Unknown branch role")
    query = wrappers["root"] if role == "root" else {
        "bool": {"must": [wrappers["nested"]], "filter": wrappers["parent_filters"]}}
    # Response-only projection/window changes are applied by fetch_exhaustive.
    return {"method": request["method"], "path": request["path"],
            "query_params": copy.deepcopy(request["query_params"]), "body": {"query": query}}, {
        "source_request_sha256": execution.digest(request), "isolated_query_sha256": execution.digest(query),
        "method": "literal_production_knn_wrapper_isolation_diagnostic", "role": role,
        "parent_eligibility_copied_from_actual_root_wrapper": True,
        "primary_request_modified": False}


def scored_queries(queries, design):
    actual, frozen = execution.unique_rows(queries, "id"), execution.unique_rows(design, "id")
    execution.require(actual.keys() == frozen.keys() and len(actual) == 50, "All50 frozen NEW tasks required")
    for qid, query in actual.items():
        execution.require(query["query"] == frozen[qid]["query"] and query.get("filters", {}) in ({}, None),
                          "Collector supports only frozen unfiltered NEW source tasks")
    ids = sorted(qid for qid, query in frozen.items() if query.get("kind") != "ambiguous_ungraded")
    execution.require(len(ids) == 48, "Exactly48 numeric tasks, not an outcome-selected subset")
    return [actual[qid] for qid in ids]


def sink(stream, case, mode, qid, **source):
    def append(receipt):
        emit(stream, dict(receipt, **identity(case, query_id=qid, mode=mode, **source)))
    return append


def native_rows(case, query, inv, root, nested):
    execution.require(set(root["scores"]) == set(inv), "Native root coverage incomplete")
    expected_nested = {did for did, item in inv.items() if item["children"]}
    execution.require(set(nested["scores"]) == expected_nested, "Native parent/child coverage incomplete")
    for did in sorted(inv):
        item = inv[did]
        observed = nested["scores"].get(did, {}).get("children", [])
        offsets = {child["offset"]: child["score"] for child in observed}
        execution.require(len(offsets) == len(observed) and set(offsets) == {c["offset"] for c in item["children"]},
                          "Native actual child offsets differ from complete source inventory")
        children = [dict(child, score=offsets[child["offset"]]) for child in item["children"]]
        scores = [root["scores"][did]["score"], *offsets.values()]
        execution.require(all(type(score) in (int, float) and 0 <= score <= 1 for score in scores),
                          "Invalid/missing exact native scope score")
        yield identity(case, query_id=query["id"], dataset_id=did, source="engine_exact_docvalues_l2",
            root_score=root["scores"][did]["score"], max_child_score=max(offsets.values()) if offsets else None,
            dimension=item["root"]["dimension"], root_dimension=item["root"]["dimension"],
            root_projection_sha256=item["root"]["projection_sha256"],
            query_vector_sha256=execution.digest(query["vector"]), children=children,
            root_request_sha256=root["request_sha256"], nested_request_sha256=nested["request_sha256"])


def faiss_observations(branch, exact, boost, role):
    """Observed retrieved-score calibration, NOT an exact HNSW membership claim."""
    hits = branch["receipt"]["hits"]
    errors = []
    mismatches = []
    for hit in hits:
        execution.require(hit["id"] in exact["scores"], "Faiss branch contains unknown native-scope ID")
        expected = exact["scores"][hit["id"]]["score"]
        observed = hit["score"] / boost
        delta = abs(expected - observed)
        errors.append(delta)
        if delta > EPSILON:
            mismatches.append({"dataset_id": hit["id"], "exact_native_score": expected,
                               "observed_Faiss_unboosted_score": observed, "absolute_error": delta})
    return {"role": role, "retrieved_scores_checked": len(hits), "source_boost_preserved": boost,
            "tolerance": EPSILON, "maximum_absolute_error": max(errors) if errors else None,
            "mismatches": mismatches, "membership_is_approximate": True,
            "nested_max_can_differ_if_HNSW_omits_best_child": role == "nested",
            "does_not_infer_scores_or_labels_for_unretrieved_ids": True}


def primary_rows(target):
    rows = replay.load_jsonl(target / "development-runs.jsonl") + replay.load_jsonl(target / "heldout-runs.jsonl")
    indexed = {}
    for row in rows:
        key = row["query_id"], row["system"]
        execution.require(key not in indexed, "Duplicate primary task/arm")
        indexed[key] = row
    return indexed


def preconditions(a, verified):
    execution.require(verified["approval"].get("diagnostic_only") is True
        and verified["approval"].get("forced_recommendation") == "D"
        and verified["approval"].get("promotion_allowed") is False
        and verified["approval"].get("geometry_diagnostics_allowed") is True,
        "Explicit separately approved forced-D geometry permission required")
    execution.bound_file(verified["inputs"], execution.relative(ROOT / "collect.py"))
    execution.bound_file(verified["inputs"], execution.relative(ROOT / "query-spec.jsonl"))
    root = execution.artifact_root(a.artifact_root)
    decision = execution.development_decision(a.development_record, verified)
    execution.require(decision["selected_threshold"] in (None, "NONE"), "Diagnostic DEV must explicitly select NONE")
    for split in ("development", "heldout", "roles"):
        execution.verify_complete(root, split, verified)
    execution.require(decision["development_completion_sha256"] == replay.sha(root / "complete-development.json"),
                      "DEV completion changed")
    for name in ("release-heldout.json", "release-roles.json"):
        release = execution.read_json(root / name)
        execution.require(release["development_record_sha256"] == replay.sha(a.development_record),
                          "Immutable DEV record changed")
    execution.verify_installation(a, root, verified)
    return root


def calibrate(a, verified, root, cases, ledger, output):
    """Fixed first10 source IDs ×first DEV task percase; never pick score boundaries."""
    dimension = execution.embedding_spec(verified["inputs"])["dimension"]
    receipts = []
    for case in cases:
        target = execution.case_dir(root, case)
        docs = replay.load_jsonl(target / "embedded-corpus.jsonl")
        inv = inventory(docs, case, dimension)
        by_id = {doc["identifier"]: doc for doc in docs}
        tasks = replay.load_jsonl(target / "embedded-queries.jsonl")
        query = sorted((q for q in tasks if q.get("split") == "development"), key=lambda q: q["id"])[0]
        execution.vector(query["vector"], dimension)
        ids = sorted(inv)[:10]
        execution.require(len(ids) == 10, "Fixed calibration needs first10 source IDs")
        source = {row["query_id"]: row for row in replay.load_jsonl(target / "exports/ms_050/requests.jsonl")}[query["id"]]
        wrappers = source_wrappers(source["request"], .5)
        execution.require(all(payload["vector"] == query["vector"]
                              for _, _, payload in contract.knn_copies(source["request"]["body"])),
                          "Calibration query vector differs from actual Scala source")
        parent_filter = {"bool": {"filter": [{"bool": {"filter": wrappers["parent_filters"]}}, {"ids": {"values": ids}}]}}
        result = diag.fetch_native(a.engine_url, case["index"], query["vector"], 10,
            eligible_parent_filter=parent_filter,
            receipt_sink=sink(ledger, case, "fixed_source_L2_calibration", query["id"],
                              source_request_sha256=execution.digest(source["request"])))
        execution.require(set(result["scores"]) == set(ids), "Calibration source membership differs")
        points = []
        for did in ids:
            expected = 1 / (1 + sum((float(x) - float(y)) ** 2
                                  for x, y in zip(query["vector"], by_id[did]["queryContextVector"])))
            observed = result["scores"][did]["score"]
            delta = abs(expected - observed)
            points.append({"dataset_id": did, "expected_l2_score": expected, "observed_engine_knn_score": observed,
                           "absolute_error": delta, "projection_sha256": inv[did]["root"]["projection_sha256"]})
        row = identity(case, query_id=query["id"], method="fixed_source_first10_engine_exact_knn_score_L2_formula",
            tolerance=EPSILON, selection="first10_sorted_source_ids_and_first_sorted_DEV_query_not_score_selected",
            passed=all(p["absolute_error"] <= EPSILON for p in points), points=points,
            query_vector_sha256=execution.digest(query["vector"]), receipt=result["receipt"],
            requires_separate_approximate_Faiss_membership_observation=True)
        emit(output, row)
        receipts.append(row)
        execution.require(row["passed"], "Native exact-script L2 calibration failed; do not proceed/rerun")
    return receipts


def collect_case(a, verified, root, case, streams, design):
    target = execution.case_dir(root, case)
    dimension = execution.embedding_spec(verified["inputs"])["dimension"]
    documents = replay.load_jsonl(target / "embedded-corpus.jsonl")
    inv = inventory(documents, case, dimension)
    for row in inv.values():
        emit(streams["vector-inventory"], dict(row,
            source_embedded_corpus_sha256=replay.sha(target / "embedded-corpus.jsonl"),
            independently_closed_manifest_sha256=verified["inputs"]["source_sha256"][verified["inputs"]["new_validation_manifest"]]))
    tasks = scored_queries(replay.load_jsonl(target / "embedded-queries.jsonl"), design)
    exports = {label: execution.unique_rows(replay.load_jsonl(target / "exports" / label / "requests.jsonl"), "query_id")
               for label in (*contract.THRESHOLD_LABELS, "keyword")}
    primary = primary_rows(target)
    count, discrepancies = 0, []
    for query in tasks:
        qid = query["id"]
        execution.vector(query["vector"], dimension)
        source = exports["ms_050"][qid]["request"]
        wrappers = source_wrappers(source, .5)
        execution.require(all(payload["vector"] == query["vector"]
                              for _, _, payload in contract.knn_copies(source["body"])),
                          "Native query vector differs from actual Scala source")
        parent_filter = {"bool": {"filter": wrappers["parent_filters"]}}
        child_filter = {"bool": {"filter": wrappers["child_filters"]}}
        root_scores = diag.fetch_native(a.engine_url, case["index"], query["vector"], case["catalog_size"],
            eligible_parent_filter=parent_filter,
            receipt_sink=sink(streams["receipts"], case, "native_root", qid,
                              source_request_sha256=execution.digest(source)))
        child_scores = diag.fetch_native(a.engine_url, case["index"], query["vector"], case["catalog_size"], nested=True,
            eligible_parent_filter=parent_filter, eligible_child_filter=child_filter,
            receipt_sink=sink(streams["receipts"], case, "native_nested", qid,
                              source_request_sha256=execution.digest(source)))
        for row in native_rows(case, query, inv, root_scores, child_scores):
            emit(streams["native"], row)
            count += 1
        keyword = exports["keyword"][qid]["request"]
        kw = diag.fetch_exhaustive(a.engine_url, case["index"], keyword, case["catalog_size"], primary_ids=[],
            receipt_sink=sink(streams["receipts"], case, "actual_Scala_keyword_full", qid,
                              source_request_sha256=execution.digest(keyword)))
        for label, threshold in contract.THRESHOLD_LABELS.items():
            actual = exports[label][qid]["request"]
            top10 = [hit["id"] for hit in primary[qid, label]["hits"] if hit["rank"] <= 10]
            hybrid = diag.fetch_exhaustive(a.engine_url, case["index"], actual, case["catalog_size"], primary_ids=top10,
                receipt_sink=sink(streams["receipts"], case, "actual_hybrid_full_" + label, qid,
                                  source_request_sha256=execution.digest(actual)))
            branches, proofs = {}, {}
            for role in ("root", "nested"):
                isolated, proof = isolated_request(actual, threshold, role)
                branches[role] = diag.fetch_exhaustive(a.engine_url, case["index"], isolated, case["catalog_size"], primary_ids=[],
                    receipt_sink=sink(streams["receipts"], case, "actual_" + role + "_knn_full_" + label, qid, **proof))
                proofs[role] = proof
            missing = hybrid["primary_ids_missing_from_collector"]
            if missing:
                discrepancies.append({"query_id": qid, "system": label, "missing_primary_ids": missing})
            emit(streams["eligibility"], identity(case, query_id=qid, system=label, complete=True,
                keyword_ids=kw["ids"], hybrid_ids=hybrid["ids"], root_vector_ids=branches["root"]["ids"],
                nested_vector_ids=branches["nested"]["ids"], source_primary_top10_subset=not missing,
                primary_ids_missing_from_full_collector=missing, request_sha256=hybrid["request_sha256"],
                source_request_sha256=execution.digest(actual), keyword_source_request_sha256=execution.digest(keyword),
                branch_source_proofs=proofs,
                retrieved_Faiss_score_observations={
                    "root": faiss_observations(branches["root"], root_scores, 50, "root"),
                    "nested": faiss_observations(branches["nested"], child_scores, 1, "nested")},
                membership_source="actual_engine_full_window_not_exact_HNSW_oracle",
                native_scores_are_not_radial_membership=True))
    execution.require(count == 48 * case["catalog_size"], "Native score rows silently skipped")
    return identity(case, numeric_query_count=48, native_rows=count, eligibility_rows=48 * 7,
                    window_discrepancies=discrepancies)


def collect(a, verified):
    root = preconditions(a, verified)
    output = execution.artifact_root(a.output)
    execution.require(output != root and output.is_relative_to(root), "Collector output must be a distinct execution subdirectory")
    output.mkdir(parents=True, exist_ok=True)
    paths = {name: output / (name + ".jsonl") for name in ("native", "eligibility", "vector-inventory", "receipts", "calibration")}
    execution.require(not any(path.exists() for path in paths.values()) and not (output / "release.json").exists(),
                      "No collector overwrite/retry; retain incomplete artifacts")
    design = replay.load_jsonl(execution.bound_file(verified["inputs"], execution.relative(ROOT / "query-spec.jsonl")))
    cases = [case for case in verified["inputs"]["cases"] if case["cohort"] == "NEW"]
    execution.require(len(cases) == 9, "All9 NEW cases required")
    execution.exclusive_json(output / "release.json", {"created_utc": execution.utc(), "diagnostic_only": True,
        "forced_recommendation": "D", "promotion_allowed": False, "inputs_sha256": verified["inputs_sha256"],
        "approval_sha256": verified["approval_sha256"], "development_record_sha256": replay.sha(a.development_record),
        "primary_and_roles_completed_before_any_geometry": True,
        "complete_roles_sha256": replay.sha(root / "complete-roles.json"),
        "calibration_epsilon_preregistered": EPSILON, "collector_source_sha256": replay.sha(Path(__file__))})
    streams = {}
    try:
        for name, path in paths.items():
            streams[name] = path.open("x", encoding="utf8")
        calibrated = calibrate(a, verified, root, cases, streams["receipts"], streams["calibration"])
        rows = [collect_case(a, verified, root, case, streams, design) for case in cases]
    finally:
        for stream in streams.values():
            stream.close()
    execution.exclusive_json(output / "complete.json", {"completed_utc": execution.utc(), "diagnostic_only": True,
        "promotion_allowed": False, "inputs_sha256": verified["inputs_sha256"], "cases": rows,
        "native_engine_calibration_passed": all(row["passed"] for row in calibrated),
        "full_window_is_not_exact_HNSW_oracle": True, "release_sha256": replay.sha(output / "release.json"),
        "files_sha256": {execution.relative(path): replay.sha(path) for path in paths.values()}})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--approval", type=Path, required=True)
    parser.add_argument("--inputs", type=Path, required=True)
    parser.add_argument("--artifact-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--development-record", type=Path, required=True)
    parser.add_argument("--engine-url", default="http://127.0.0.1:19200")
    a = parser.parse_args()
    replay.local_url(a.engine_url)
    verified = execution.gate(a.approval, a.inputs)
    collect(a, verified)


if __name__ == "__main__":
    main()
