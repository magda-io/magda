#!/usr/bin/env python3
"""Authorized old-smoke geometry admission control, not model/relevance evidence."""
import argparse
import copy
import datetime
import json
import math
import pathlib
import re
import struct
import uuid

# Reuse frozen framework helpers without modifying them.
import importlib.util
ROOT = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("cutoff_existing_controls", ROOT / "correctness.py")
controls = importlib.util.module_from_spec(spec)
spec.loader.exec_module(controls)
verify, replay, contract = controls.verify, controls.replay, controls.contract
require = verify.require
SCORES = (.52, .50, .49, .47, .455, .445, .43, .41, .39)
PREFIX = "magda-relevance-eval-threshold3887-control-"
RESOURCE = re.compile(re.escape(PREFIX) + r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-boundary-(root|child)\Z")


def owned(name):
    replay.owned(name)
    require(bool(RESOURCE.fullmatch(name)), "Require exact boundary UUIDv4 root/child resource")
    return name


def geometry():
    result = []
    for position, score in enumerate(SCORES):
        x = struct.unpack("f", struct.pack("f", math.sqrt(1 / score - 1)))[0]
        native = 1 / (1 + x * x)
        require(all((score >= cutoff) == (native >= cutoff) for cutoff in contract.THRESHOLD_LABELS.values()),
                "Fixed float32 geometry crosses a registered cutoff; do not tune it")
        result.append({"identifier": "geometry-" + str(position), "planned_native_score": score,
                       "float32_vector": [x, 0.0, 0.0], "geometry_native_score": native})
    return result


def documents(role):
    docs = []
    for item in geometry():
        doc = verify.dataset(item["identifier"], title="marmalade", vector=item["float32_vector"])
        if role == "child":
            doc.pop("queryContextVector")
            doc["distributions"] = [verify.child(item["identifier"] + "-distribution", title="marmalade", vector=item["float32_vector"])]
        docs.append(doc)
    return docs


def expected(cutoff):
    return {item["identifier"] for item in geometry() if item["planned_native_score"] >= cutoff}


def inspect_response(response, role, cutoff, *, assert_full=True):
    planned = expected(cutoff)
    ids = verify.hit_ids(response)
    controls.total(response, len(ids))
    if assert_full:
        require(ids == planned, "Native cutoff admission mismatch: " + role + "/" + str(cutoff))
    for hit in response["hits"]["hits"]:
        projected = {hit["_id"] + "-distribution"} if role == "child" else set()
        require(verify.projected_ids(hit) == projected, "Unexpected child projection")
    controls.projection_identity(response, documents(role))
    counts = controls.facet_counts(response, documents(role), ids, ids)
    publisher = response["aggregations"]["Publisher-global"]["filter"]
    buckets = [b for key in ("terms-other-options", "terms-selected-options") for b in publisher.get(key, {}).get("buckets", [])]
    require({b["key"]: b["doc_count"] for b in buckets} == {i: 1 for i in ids}, "Publisher counts mismatch")
    equality = {"geometry-1"} if cutoff == .5 else set()
    return {"expected_ids": sorted(planned), "actual_ids": sorted(ids), "total": len(ids),
            "missing_ids": sorted(planned - ids), "unexpected_ids": sorted(ids - planned),
            "full_inclusive_admission_status": "passed" if ids == planned else "failed",
            "interior_admission_status": "passed" if ids - equality == planned - equality else "failed",
            "exact_half_boundary_included": "geometry-1" in ids if cutoff == .5 else None,
            "observed_source_combined_scores_not_native": verify.score_map(response), **counts}


def run(args):
    require(args.allow_local_writes, "Explicit --allow-local-writes required")
    engine = controls.local_url(args.engine_url)
    output = pathlib.Path(args.output)
    require(not output.exists(), "Never overwrite boundary evidence")
    output.parent.mkdir(parents=True, exist_ok=True)
    report = {"issue": 3887, "status": "running", "scope": "Fixed 3d old-smoke geometry admission only; NOT relevance/model inference/latency",
              "engine_url": engine, "geometry": geometry(), "native_score_formula": "1/(1+squared_l2_distance)",
              "continue_independent_cells": getattr(args, "continue_cells", False), "errors": [], "native_calibration": {},
              "exact_inclusive_boundary": {"native_score": .5, "distance_squared": 1, "float32_x": 1},
              "source_combined_response_scores_are_not_native_scores": True,
              "authorization": "Public tenant0/published translated visible owner marker; NOT actual OPA",
              "pipeline": "_none", "resources": [], "responses": [], "requests": [],
              "controls": {label: {role: {"status": "not_run"} for role in ("root", "child")} for label in contract.THRESHOLD_LABELS},
              "started_utc": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    resources, failure = [], None
    try:
        manifest_path = ROOT.parent / "synthetic/production-baseline-source.json"
        manifest = json.loads(manifest_path.read_text())
        for name, wanted in manifest["sha256"].items():
            require(replay.sha(ROOT.parent.parent / name) == wanted, "Production source drift: " + name)
        report["production_sources"] = {"manifest_sha256": replay.sha(manifest_path), "sha256": manifest["sha256"]}
        base = pathlib.Path(args.exports)
        sets = {label: replay.load_jsonl(base / label / "requests.jsonl") for label in contract.THRESHOLD_LABELS}
        configs = {label: base / label / "config.json" for label in sets}
        report["export_contract"] = contract.validate_request_sets(sets, configs)
        mapping_path = base / "ms_050/mapping.json"
        mapping = json.loads(mapping_path.read_text())
        require(all(replay.sha(base / label / "mapping.json") == replay.sha(mapping_path) for label in sets), "Mode mappings differ")
        props = mapping["mappings"]["properties"]
        require(props["queryContextVector"]["dimension"] == 3 and props["distributions"]["properties"]["queryContextVector"]["dimension"] == 3, "Require actual3d mapping")
        report["mapping_sha256"] = replay.sha(mapping_path)
        bodies = {}
        for label, rows in sets.items():
            original = verify.select_export(rows)
            body, injections = verify.fixture_body(original)
            body["size"] = original["request"]["body"]["size"]
            require(body["size"] == 10, "Retain original smoke size10 for9 documents")
            require(len(contract.knn_copies(body)) == 6, "Require all6 copies")
            for (_, field, before), (_, after_field, after) in zip(contract.knn_copies(original["request"]["body"]), contract.knn_copies(body)):
                require(field == after_field and after["min_score"] == before["min_score"] and after.get("boost") == before.get("boost"), "Threshold/boost changed")
            bodies[label] = body
            report["requests"].append({"label": label, "source_export_sha256": replay.sha(base / label / "requests.jsonl"),
                "source_request_sha256": controls.digest(original["request"]), "adapted_body_sha256": controls.digest(body),
                "size": body["size"], "auth_injections": injections, "body": body})
        info = replay.request(engine, "GET", "/")
        require(info["version"]["number"] == "2.19.1", "Pinned engine version differs")
        prior = json.loads((ROOT / ".local/correctness-runtime-provenance.json").read_text())
        require(info["cluster_uuid"] == prior["engine"]["cluster_uuid"], "Engine cluster identity differs from pinned runtime receipt")
        report["runtime"] = {"current_root": info, "prior_runtime_receipt_sha256": replay.sha(ROOT / ".local/correctness-runtime-provenance.json"),
                             "authorized_invoker_current_image_metadata": getattr(args, "runtime_metadata", None)}
        stem = PREFIX + str(uuid.uuid4())
        for role in ("root", "child"):
            name = owned(stem + "-boundary-" + role)
            resource = {"name": name, "path": "/" + name, "absolute_url": engine + "/" + name, "cleanup": "pending", "role": role}
            report["resources"].append(resource)
            resources.append(resource)
            require(replay.request(engine, "PUT", resource["path"], mapping).get("acknowledged") is True, "Index creation not acknowledged")
            docs = documents(role)
            lines = [line for doc in docs for line in (json.dumps({"index": {"_id": doc["identifier"]}}), json.dumps(doc))]
            bulk = replay.request(engine, "POST", resource["path"] + "/_bulk?refresh=true", "\n".join(lines) + "\n", "application/x-ndjson")
            require(bulk.get("errors") is False and len(bulk.get("items", [])) == 9 and all(200 <= item["index"]["status"] < 300 for item in bulk["items"]), "Bulk failed/incomplete")
        for label, cutoff in contract.THRESHOLD_LABELS.items():
            for resource in resources:
                role = resource["role"]
                record = report["controls"][label][role]
                try:
                    path = resource["path"] + "/_search?search_pipeline=_none"
                    response = replay.request(engine, "POST", path, bodies[label])
                    report["responses"].append({"label": label, "role": role, "absolute_url": engine + path,
                        "body_sha256": controls.digest(bodies[label]), "response": controls.strip_vectors(response)})
                    details = inspect_response(response, role, cutoff, assert_full=False)
                    record["details"] = details
                    require(details["full_inclusive_admission_status"] == "passed", "Native inclusive cutoff admission mismatch: " + role + "/" + str(cutoff))
                    record.update(status="passed")
                except Exception as error:
                    record.update(status="failed", error=type(error).__name__ + ": " + str(error))
                    report["errors"].append({"label": label, "role": role, "error": record["error"]})
                    print("FAILED " + label + "/" + role + ": " + record["error"], flush=True)
                    if not getattr(args, "continue_cells", False):
                        raise
        if getattr(args, "native_calibration", False):
            diagnostic_spec = importlib.util.spec_from_file_location("boundary_native_existing", ROOT / "diagnostics.py")
            diagnostics = importlib.util.module_from_spec(diagnostic_spec)
            diagnostic_spec.loader.exec_module(diagnostics)
            report["native_probe_helper_sha256"] = replay.sha(ROOT / "diagnostics.py")
            for resource in resources:
                role = resource["role"]
                body = diagnostics.native_request([0.0, 0.0, 0.0], 9, nested=role == "child", child_window=1)
                path = resource["path"] + "/_search?search_pipeline=_none"
                response = replay.request(engine, "POST", path, body)
                controls.total(response, 9)
                require(verify.hit_ids(response) == {item["identifier"] for item in geometry()}, "Native calibration did not sample all fixed9 documents")
                scores = verify.score_map(response)
                report["native_calibration"][role] = {"request": body, "absolute_url": engine + path,
                    "response": controls.strip_vectors(response), "actual_unboosted_script_scores": scores,
                    "exact_half_actual_script_score": scores["geometry-1"],
                    "exact_half_script_score_equals_half": scores["geometry-1"] == .5,
                    "all_fixed_documents_sampled_without_score_selection": True}
        cells = [record for roles in report["controls"].values() for record in roles.values()]
        report["interior_admission_status"] = "passed" if all(r.get("details", {}).get("interior_admission_status") == "passed" for r in cells) else "failed"
        if report["errors"]:
            raise AssertionError("Inclusive cutoff cells failed: " + str(len(report["errors"])))
        report["status"] = "passed"
    except Exception as error:
        failure = error
        report.update(status="failed", error=type(error).__name__ + ": " + str(error))
    finally:
        for resource in reversed(resources):
            try:
                name = owned(resource["name"])
                require(resource["path"] == "/" + name and resource["absolute_url"] == engine + "/" + name, "Cleanup URL differs")
                print("DELETE " + resource["absolute_url"], flush=True)
                require(replay.request(engine, "DELETE", resource["path"]).get("acknowledged") is True, "Cleanup not acknowledged")
                resource.update(cleanup="deleted", cleanup_acknowledged=True)
            except Exception as error:
                resource.update(cleanup="failed", cleanup_error=str(error))
                report["status"] = "failed"
                if failure is None:
                    failure = error
                    report["error"] = type(error).__name__ + ": " + str(error)
        report["cleanup_all_acknowledged"] = all(r["cleanup"] == "deleted" for r in resources)
        report["finished_utc"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with output.open("x", encoding="utf8") as stream:
            json.dump(controls.json_safe(report), stream, indent=2, sort_keys=True, allow_nan=False)
            stream.write("\n")
    if failure:
        raise failure
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine-url", default="http://127.0.0.1:19200")
    parser.add_argument("--exports", default=str(ROOT / ".local/correctness-exports"))
    parser.add_argument("--output", default=str(ROOT / "results/cutoff-boundary.json"))
    parser.add_argument("--allow-local-writes", action="store_true")
    parser.add_argument("--continue-cells", action="store_true", help="Explicit diagnostic: preserve failure while collecting independent cells")
    parser.add_argument("--native-calibration", action="store_true", help="Exact unboosted existing knn_score helper over all9 fixed vectors per role")
    report = run(parser.parse_args())
    print(json.dumps({"status": report["status"], "responses": len(report["responses"]), "cleanup_all_acknowledged": report["cleanup_all_acknowledged"]}))
