#!/usr/bin/env python3
"""Raw-only #3887 closed controls. Execution requires the parent's prior release.

No exporter, experimental normalization, embedding or pipeline installation here.
Structural export validation is not independent proof of source provenance.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
import math
import pathlib
import re
import urllib.parse
import uuid

ROOT = pathlib.Path(__file__).resolve().parent


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


verify = module("threshold_raw_existing_verify", ROOT.parent / "verify.py")
replay = verify.replay
contract = module("threshold_raw_export_contract", ROOT / "export_contract.py")
require = verify.require
PREFIX = "magda-relevance-eval-threshold3887-control-"
RESOURCE = re.compile(re.escape(PREFIX) + r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-(eligibility|legacy|prefilter-root|prefilter-child)\Z")
LABELS = tuple(contract.THRESHOLD_LABELS) + (contract.DIAGNOSTIC_LABEL,)
PIPELINE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]*\Z")


def owned(name):
    replay.owned(name)
    require(bool(RESOURCE.fullmatch(name)), "Expected exact threshold-control UUIDv4 resource")
    return name


def local_url(value):
    # Replay transport is reused; stricter existing controls disallow docker host.
    return replay.local_url(verify.local_url(value))


def strip_vectors(value):
    if isinstance(value, list):
        return [strip_vectors(item) for item in value]
    if isinstance(value, dict):
        return {key: strip_vectors(item) for key, item in value.items()
                if key not in ("vector", "queryContextVector", "distributions.queryContextVector")}
    return value


def json_safe(value):
    """Keep an invalid engine score in failure evidence without invalid JSON."""
    if isinstance(value, float) and not math.isfinite(value):
        return {"invalid_nonfinite_number": repr(value)}
    if isinstance(value, list):
        return [json_safe(item) for item in value]
    if isinstance(value, dict):
        return {key: json_safe(item) for key, item in value.items()}
    return value


def digest(value):
    return hashlib.sha256(contract.canonical(value)).hexdigest()


def complete(response):
    require(response.get("timed_out") is False and response.get("_shards", {}).get("failed") == 0,
            "Response lacks explicit successful timeout/shard evidence")


def total(response, expected):
    complete(response)
    actual = response["hits"]["total"]
    require(actual == {"value": expected, "relation": "eq"}, "Exact total hit count mismatch")
    require(len(response["hits"]["hits"]) == expected, "Closed fixture result window truncated")
    require(all(type(hit.get("_score")) in (int, float) and math.isfinite(hit["_score"])
                for hit in response["hits"]["hits"]), "Invalid raw hit score")


def projection_identity(response, docs):
    """Assert actual child identity + offset, not merely the parent's _id."""
    documents = {doc["identifier"]: doc for doc in docs}
    for hit in response["hits"]["hits"]:
        children = documents[hit["_id"]]["distributions"]
        seen = set()
        for group in hit.get("inner_hits", {}).values():
            hits = group["hits"]
            require(hits["total"] == {"value": len(hits["hits"]), "relation": "eq"}, "Truncated inner_hits")
            for item in hits["hits"]:
                nested = item.get("_nested", {})
                offset = nested.get("offset")
                require(nested.get("field") == "distributions" and type(offset) is int
                        and 0 <= offset < len(children), "Missing actual distribution nested identity/offset")
                require(item["_source"]["identifier"] == children[offset]["identifier"],
                        "Distribution identifier does not match actual nested offset")
                require(offset not in seen, "Duplicate projected distribution identity")
                seen.add(offset)


def facet_counts(response, docs, format_roots, publisher_roots):
    """Existing facets intentionally include every raw child of eligible parents."""
    fmt = response["aggregations"]["Format-global"]["filter"]
    require(fmt["doc_count"] == len(format_roots), "Format root facet count mismatch")
    children = [child for doc in docs if doc["identifier"] in format_roots for child in doc["distributions"]]
    nested = fmt["nested-distributions"]
    require(nested["doc_count"] == len(children), "Nested format facet child count mismatch")
    buckets = [bucket for name in ("terms-other-options", "terms-selected-options")
               for bucket in nested.get(name, {}).get("buckets", [])]
    child_parents = {doc["identifier"] for doc in docs if doc["identifier"] in format_roots and doc["distributions"]}
    expected = {"csv": (len(children), len(child_parents))} if children else {}
    require(len(buckets) == len(expected), "Unexpected duplicate/extra format buckets")
    require({bucket["key"].lower(): (bucket["doc_count"], bucket["reverse"]["doc_count"])
             for bucket in buckets} == expected, "Format nested/reverse count mismatch")
    pub = response["aggregations"]["Publisher-global"]["filter"]
    require(pub["doc_count"] == len(publisher_roots), "Publisher root count mismatch")
    return {"nested_children": len(children), "reverse_parent_count": len(child_parents)}


def omit_far_vectors(docs):
    """Uniform, parent-approved fixture-only nonmatching modality adaptation.

    Top-k has no radial cutoff: a FAR vector is a legitimate candidate, not an
    authorization failure. Missing vectors express 'no match in this modality'
    consistently in all eight arms. Never applied to the benchmark corpus.
    """
    adapted = copy.deepcopy(docs)
    removals = []
    for doc in adapted:
        for scope, item in [("root", doc)] + [("child", child) for child in doc["distributions"]]:
            if item.get("queryContextVector") == verify.FAR:
                item.pop("queryContextVector")
                removals.append({"dataset_id": doc["identifier"], "scope": scope,
                                 "identifier": item["identifier"], "field": "queryContextVector"})
    return adapted, {"source_fixture_sha256": digest(docs), "adapted_fixture_sha256": digest(adapted),
                     "missing_vector_fields": removals}


def closed_fixtures():
    return omit_far_vectors(verify.fixtures())[0]


def legacy_fixtures():
    unrelated = dict(title="marmalade", vector=verify.FAR)
    legacy = verify.child("legacy-visible", title="marmalade")
    legacy.pop("publishingState")
    missing_root = verify.dataset("missing-root-state")
    missing_root.pop("publishingState")
    return omit_far_vectors([verify.dataset("legacy", **unrelated, children=[legacy]),
            verify.dataset("legacy-hidden", **unrelated, children=[dict(legacy, identifier="legacy-hidden-child", accessControl={"ownerId": "hidden"})]),
            verify.dataset("legacy-draft", **unrelated, children=[verify.child("legacy-draft-child", state="draft")]),
            verify.dataset("legacy-foreign", **unrelated, children=[verify.child("legacy-foreign-child", tenant=1)]),
            missing_root])[0]


def assert_legacy(response, docs):
    total(response, 1)
    require(verify.hit_ids(response) == {"legacy"}, "Legacy eligibility mismatch")
    require(verify.projected_ids(response["hits"]["hits"][0]) == {"legacy-visible"}, "Legacy projection mismatch")
    projection_identity(response, docs)
    counts = facet_counts(response, docs, {"legacy"}, {"legacy"})
    publisher = response["aggregations"]["Publisher-global"]["filter"]
    require({b["key"]: b["doc_count"] for b in publisher["terms-other-options"]["buckets"]} == {"legacy": 1},
            "Legacy publisher buckets mismatch")
    return {"root_ids": ["legacy"], **counts}


def prefilter_fixtures(kind):
    unrelated = dict(title="marmalade", vector=verify.FAR)
    further = [.25, 0.0, 0.0]  # l2 score 1/(1+.0625) = .941176, above every cutoff.
    if kind == "root":
        return [verify.dataset("restricted", title="marmalade", owner="hidden"),
                verify.dataset("eligible", title="marmalade", vector=further)]
    return [verify.dataset("mixed", **unrelated, children=[verify.child("unrelated", **unrelated),
                verify.child("restricted-perfect", title="marmalade", owner="hidden")]),
            verify.dataset("eligible", **unrelated, children=[verify.child("eligible-further", title="marmalade", vector=further)])]


def validate_inputs(args, report):
    paths = args.requests
    configs = args.configs
    require(isinstance(paths, dict) and set(paths) == set(LABELS), "Require all seven thresholds and topk10diag")
    require(isinstance(configs, dict) and set(configs) == set(LABELS), "Require exported configs for every arm")
    sets = {label: replay.load_jsonl(paths[label]) for label in LABELS}
    report["export_contract"] = contract.validate_request_sets(sets, configs)
    bodies, formats = {}, {}
    for label, rows in sets.items():
        require({row["query_id"] for row in rows} == {"smoke-unfiltered", "smoke-filtered"}, "Require original two-query closed-fixture export")
        exported = verify.select_export(rows)
        bodies[label], counts = verify.fixture_body(exported)
        formats[label] = {}
        adaptations = {}
        for selected in verify.FORMATS:
            formats[label][selected], adaptations[selected] = verify.format_fixture_body(rows, selected)
        report["modes"][label].update(exported_mode=report["export_contract"]["request_sets"][label],
            requests_sha256=replay.sha(paths[label]), exported_query_params=exported["request"]["query_params"],
            auth_injections=counts, format_adaptations=adaptations)
    mapping = json.loads(pathlib.Path(args.mapping).read_text(encoding="utf8"))
    props = mapping["mappings"]["properties"]
    require(props["queryContextVector"]["dimension"] == 3 and
            props["distributions"]["properties"]["queryContextVector"]["dimension"] == 3,
            "Require actual dimension-3 Scala mapping")
    report["mapping_sha256"] = replay.sha(args.mapping)
    topk1_path, topk1_config = getattr(args, "topk1_requests", None), getattr(args, "topk1_config", None)
    require(bool(topk1_path) == bool(topk1_config), "Supply both actual topk1 requests and config")
    k1body = None
    if topk1_path:
        rows = replay.load_jsonl(topk1_path)
        contract.validate_exports(rows, k=1)
        require({row["query_id"] for row in rows} == {"smoke-unfiltered", "smoke-filtered"}, "Require original two-query k1 export")
        cfg = json.loads(pathlib.Path(topk1_config).read_text(encoding="utf8"))
        kval = cfg["elasticSearch"]["indices"]["datasets"]["hybridSearch"]["k"]
        require(type(kval) is int and kval == 1 and isinstance(cfg.get("config_sha"), str) and len(cfg["config_sha"]) == 64
                and all(row["config_sha"] == cfg["config_sha"] for row in rows), "k1 config provenance mismatch")
        k1body, _ = verify.fixture_body(verify.select_export(rows))
        report["prefilter_topk1"].update(requests_sha256=replay.sha(topk1_path), config_sha256=replay.sha(topk1_config))
    return mapping, bodies, formats, k1body


def verify_raw(args):
    """Run only after parent release; never silently normalize or patch thresholds."""
    require(args.allow_local_writes, "Pass --allow-local-writes for disposable local controls")
    engine = local_url(args.engine_url)
    output = pathlib.Path(args.output)
    require(not output.exists(), "Do not overwrite correctness evidence")
    output.parent.mkdir(parents=True, exist_ok=True)
    parity_id = getattr(args, "production_pipeline_id", None)
    require(parity_id is None or (PIPELINE.fullmatch(parity_id) and parity_id != "_none"), "Expected one literal existing production pipeline ID")
    stem = PREFIX + str(uuid.uuid4())
    indexes = {kind: owned(stem + "-" + kind) for kind in ("eligibility", "legacy", "prefilter-root", "prefilter-child")}
    report = {"issue": 3887, "status": "running", "engine_url": engine,
        "authorization": "Translated synthetic ownerId != hidden; NOT actual OPA evaluation",
        "scope": "Raw production-exported DSL closed fixtures only; no normalization or boost changes",
        "all_threshold_full_opa_service_coverage": False, "all_mode_claim": False,
        "structural_validation_is_source_provenance": False,
        "semantics": {"projection": "Tenant/auth projection includes visible draft and unrelated siblings",
            "format": "Independent any-sibling format semantics, not same-child auth; nested facets include raw hidden/draft/foreign children of eligible parents; publisher topHits may retain raw child source"},
        "raw_search_pipeline_override": "_none",
        "fixture_source_sha256": replay.sha(ROOT.parent / "verify.py"),
        "fixture_overrides": ["water quality query", "three-zero query vector", "size100/from0/track_total_hits",
            "translated owner marker", "uniform omission of FAR nonmatching-modality vector fields in fixture documents only; all metadata/security/relationships retained",
            "format only: known publisher/date/region wrappers removed; CSV/impossible literal"],
        "modes": {label: {"status": "not_run", "controls": {name: {"status": "not_run"} for name in
            ("eligibility", "format/CSV", "format/" + verify.FORMATS[1], "legacy")}} for label in LABELS},
        "inputs": {"status": "not_run"}, "resources": [], "responses": [], "executed_requests": [],
        "prefilter_topk1": {"status": "not_run", "reason": "Actual separate topk1 export/config not supplied"},
        "production_pipeline_parity": {"status": "not_run", "reason": "No explicit existing production pipeline ID"}}
    attempted, failure = [], None

    def create(kind, mapping, docs):
        name = owned(indexes[kind])
        path = "/" + name
        resource = {"name": name, "path": path, "absolute_url": engine + path, "created": False, "cleanup": "pending"}
        report["resources"].append(resource)
        attempted.append(resource)  # An uncertain PUT still requires exact cleanup.
        result = replay.request(engine, "PUT", path, mapping)
        require(result.get("acknowledged") is True, "Index creation not acknowledged")
        resource["created"] = True
        lines = [line for doc in docs for line in (json.dumps({"index": {"_id": doc["identifier"]}}), json.dumps(doc))]
        bulk = replay.request(engine, "POST", path + "/_bulk?refresh=true", "\n".join(lines) + "\n", "application/x-ndjson")
        require(bulk.get("errors") is False and len(bulk.get("items", [])) == len(docs)
                and all(200 <= item["index"]["status"] < 300 for item in bulk["items"]), "Fixture bulk indexing incomplete/failed")

    def search(kind, body, label, control, pipeline="_none"):
        path = "/" + owned(indexes[kind]) + "/_search?search_pipeline=" + urllib.parse.quote(pipeline, safe="")
        identity = {"mode": label, "control": control, "pipeline": pipeline, "request_sha256": digest(body)}
        report["executed_requests"].append({**identity, "absolute_url": engine + path, "body": body})
        response = replay.request(engine, "POST", path, body)
        report["responses"].append({**identity, "response": strip_vectors(response)})
        return response

    def check(record, action):
        try:
            record.update(status="running")
            result = action()
            record.update(status="passed", details=result)
            return result
        except Exception as error:
            record.update(status="failed", error=f"{type(error).__name__}: {error}")
            raise

    try:
        mapping, bodies, formats, k1body = check(report["inputs"], lambda: validate_inputs(args, report))
        report["inputs"]["details"] = {"full_frozen_label_set": True, "query_count_per_arm": 2}
        docs, fixture_adaptation = omit_far_vectors(verify.fixtures())
        legacy = legacy_fixtures()
        report["fixture_adaptation"] = {**fixture_adaptation, "uniform_across_all_eight_arms": True,
            "benchmark_corpus_or_embeddings_changed": False, "legacy_fixture_sha256": digest(legacy),
            "topk_far_results_are_not_security_leaks": True}
        create("eligibility", mapping, docs)
        create("legacy", mapping, legacy)
        baseline_responses = {}
        for label in LABELS:
            mode = report["modes"][label]
            mode["status"] = "running"
            try:
                def eligibility():
                    response = search("eligibility", bodies[label], label, "eligibility")
                    baseline_responses[label] = response
                    result = verify.assert_eligibility(response, "baseline")
                    total(response, len(verify.expected_roots("baseline")))
                    projection_identity(response, docs)
                    return {**result, **facet_counts(response, docs, verify.expected_roots("baseline"), verify.expected_roots("baseline"))}
                check(mode["controls"]["eligibility"], eligibility)
                for selected in verify.FORMATS:
                    def formatted(selected=selected):
                        response = search("eligibility", formats[label][selected], label, "format/" + selected)
                        result = verify.assert_format(response, "baseline", selected)
                        roots = verify.FORMAT_ROOTS if selected == "CSV" else set()
                        total(response, len(roots))
                        projection_identity(response, docs)
                        return {**result, **facet_counts(response, docs, verify.expected_roots("baseline"), roots)}
                    check(mode["controls"]["format/" + selected], formatted)
                check(mode["controls"]["legacy"], lambda: assert_legacy(search("legacy", bodies[label], label, "legacy"), legacy))
                mode["status"] = "passed"
            except Exception:
                mode["status"] = "failed"
                raise
        if k1body is not None:
            def prefilter():
                details = {}
                for kind in ("root", "child"):
                    create("prefilter-" + kind, mapping, prefilter_fixtures(kind))
                    response = search("prefilter-" + kind, k1body, "topk1-counterexample", kind)
                    total(response, 1)
                    require(verify.hit_ids(response) == {"eligible"}, "Nearest unauthorized candidate occupied k1 slot")
                    unsafe = copy.deepcopy(k1body)
                    for _, _, payload in contract.knn_copies(unsafe):
                        payload.pop("filter")  # Negative control only, never used as candidate DSL.
                    negative = search("prefilter-" + kind, unsafe, "topk1-counterexample", kind + "/negative-unfiltered-knn")
                    expected = set() if kind == "root" else {"mixed"}
                    total(negative, len(expected))
                    require(verify.hit_ids(negative) == expected, "Negative prefilter counterexample did not discriminate")
                    details[kind] = {"eligible_ids": ["eligible"], "negative_ids": sorted(expected)}
                return details
            check(report["prefilter_topk1"], prefilter)
            report["prefilter_topk1"].pop("reason", None)
        if parity_id:
            def parity():
                path = "/_search/pipeline/" + urllib.parse.quote(parity_id, safe="")
                definition = replay.request(engine, "GET", path)
                report["production_pipeline_parity"].update(pipeline_id=parity_id,
                    definition_sha256=digest(definition), definition=definition)
                require(set(definition) == {parity_id}, "Existing pipeline lookup returned unexpected IDs")
                pipeline = definition[parity_id]
                require(isinstance(pipeline, dict) and
                        set(pipeline) <= {"description", "version", "request_processors", "response_processors", "phase_results_processors"},
                        "Existing parity pipeline has unsupported definition fields")
                require(not pipeline.get("request_processors") and not pipeline.get("response_processors"),
                        "Parity forbids request/response processors and possible external I/O")
                phases = pipeline.get("phase_results_processors")
                require(isinstance(phases, list) and len(phases) == 1 and isinstance(phases[0], dict)
                        and set(phases[0]) == {"normalization-processor"}
                        and isinstance(phases[0]["normalization-processor"], dict),
                        "Parity requires exactly one existing normalization-only phase processor")
                report["production_pipeline_parity"].update(contains_normalization_processor=True,
                    expected_raw_no_op=True)  # Expectation only; actual parity below must prove it.
                for label in LABELS:
                    response = search("eligibility", bodies[label], label, "production-pipeline-parity", parity_id)
                    baseline_response = baseline_responses[label]
                    total(response, 8)
                    require(verify.hit_ids(response) == verify.hit_ids(baseline_response), "Existing production pipeline changed hit IDs")
                    a, b = verify.score_map(baseline_response), verify.score_map(response)
                    require(all(type(b[key]) in (int, float) and math.isfinite(b[key]) and math.isclose(a[key], b[key], rel_tol=1e-6, abs_tol=1e-6) for key in a), "Production pipeline changed raw scores")
                    require(response["aggregations"] == baseline_response["aggregations"], "Production pipeline changed aggregation evidence/counts")
                    verify.assert_eligibility(response, "baseline")
                    projection_identity(response, docs)
                after = replay.request(engine, "GET", path)
                require(digest(after) == digest(definition), "Existing pipeline definition changed during parity checks")
                return {"pipeline_id": parity_id, "definition_sha256": digest(definition), "definition": definition,
                        "definition_unchanged": True, "contains_normalization_processor": True,
                        "expected_raw_no_op": True, "hit_score_total_aggregation_parity": True,
                        "scope": "Unfiltered closed fixture at all seven radial cutoffs plus topk10", "mode_labels": list(LABELS)}
            check(report["production_pipeline_parity"], parity)
            report["production_pipeline_parity"].pop("reason", None)
        require(all(mode["status"] == "passed" and all(c["status"] == "passed" for c in mode["controls"].values()) for mode in report["modes"].values()), "Not every mandatory raw control passed")
        report.update(status="passed", all_eight_raw_mode_controls_passed=True)
    except Exception as error:
        failure = error
        report.update(status="failed", error=f"{type(error).__name__}: {error}")
    finally:
        for resource in reversed(attempted):
            try:
                name = owned(resource["name"])
                require(resource["path"] == "/" + name and resource["absolute_url"] == engine + "/" + name,
                        "Cleanup URL differs from exact owned resource")
                print("DELETE " + resource["absolute_url"], flush=True)
                result = replay.request(engine, "DELETE", resource["path"])
                require(result.get("acknowledged") is True, "Cleanup not acknowledged")
                resource.update(cleanup="deleted", cleanup_acknowledged=True)
            except Exception as error:
                resource.update(cleanup="failed", cleanup_error=f"{type(error).__name__}: {error}")
                report["status"] = "failed"
                if failure is None:
                    failure = error
                    report["error"] = f"{type(error).__name__}: {error}"
        report["cleanup_all_acknowledged"] = all(r["cleanup"] == "deleted" for r in attempted)
        report["all_eight_raw_mode_controls_passed"] = all(m["status"] == "passed" for m in report["modes"].values())
        output.write_text(json.dumps(json_safe(report), indent=2, sort_keys=True, allow_nan=False) + "\n", encoding="utf8")
    if failure is not None:
        raise failure
    return report


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--requests", type=json.loads, required=True, help="JSON object: mode label to actual export JSONL")
    result.add_argument("--configs", type=json.loads, required=True, help="JSON object: mode label to actual exported config JSON")
    result.add_argument("--mapping", required=True)
    result.add_argument("--output", required=True)
    result.add_argument("--engine-url", type=local_url, required=True)
    result.add_argument("--allow-local-writes", action="store_true")
    result.add_argument("--production-pipeline-id")
    result.add_argument("--topk1-requests")
    result.add_argument("--topk1-config")
    return result


if __name__ == "__main__":
    result = verify_raw(parser().parse_args())
    print(json.dumps({"status": result["status"], "cleanup_all_acknowledged": result["cleanup_all_acknowledged"]}))
