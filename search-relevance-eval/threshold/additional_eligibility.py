#!/usr/bin/env python3
"""Separately approved, post-registration inherited-cohort ID diagnostics.

All frozen LEGACY/REAL tasks, actual Scala keyword plus seven uniform exports.
No qrels, grades, native-score/branch probes, embeddings, primary reruns or tuning.
Full-window hybrid observations are NOT an exact HNSW eligibility oracle.
"""
import argparse
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("threshold_additional_execute", ROOT / "execute.py")
execution = importlib.util.module_from_spec(spec)
spec.loader.exec_module(execution)
replay = execution.replay
contract = execution.contract
diag = execution.diagnostics
PROFILES = [0.50, 0.48, 0.46, 0.45, 0.44, 0.42, 0.40]
SYSTEMS = ["ms_050", "ms_048", "ms_046", "ms_045", "ms_044", "ms_042", "ms_040"]
CASE_IDENTITIES = [("LEGACY", 39031, 180), ("LEGACY", 39032, 180),
                   ("LEGACY", 39033, 180), ("REAL", 3901, 494)]
MARKER = "additional_postregistration_diagnostic_not_frozen_ABC_gate"


def require(condition, message):
    execution.require(condition, message)


def emit(stream, row):
    stream.write(json.dumps(row, ensure_ascii=False, sort_keys=True, allow_nan=False) + "\n")
    stream.flush()


def identity(case, **extra):
    return dict(cohort=case["cohort"], seed=case["seed"], size=case["catalog_size"], **extra)


def fixed_cases(inputs):
    cases = [c for c in inputs["cases"] if c["cohort"] in ("LEGACY", "REAL")]
    by_key = {(c["cohort"], c["seed"], c["catalog_size"]): c for c in cases}
    require(len(cases) == len(by_key) == 4 and set(by_key) == set(CASE_IDENTITIES),
            "Require exactly fixed three LEGACY180 and REAL3901/494 cases")
    require(list(contract.THRESHOLD_LABELS) == SYSTEMS
            and list(contract.THRESHOLD_LABELS.values()) == PROFILES, "Frozen seven profiles changed")
    return [by_key[key] for key in CASE_IDENTITIES]


def supplemental_gate(a, verified, root):
    """Read-only supplemental approval: never mutate the original source closure."""
    approval = execution.read_json(a.diagnostic_approval)
    expected = {"approved_by": "parent-agent", "action": "collect_all_inherited_eligibility",
        "execution_inputs_sha256": verified["inputs_sha256"],
        "execution_approval_sha256": verified["approval_sha256"],
        "code_sha256": replay.sha(Path(__file__)), "diagnostic_only": True,
        "promotion_allowed": False, "forced_recommendation": "D",
        "fixed_cohorts": ["LEGACY", "REAL"], "profiles": PROFILES,
        "query_selection": "all_frozen_queries"}
    for key, value in expected.items():
        require(approval.get(key) == value and type(approval.get(key)) is type(value),
                "Supplemental diagnostic approval mismatch: " + key)
    # An explicit path can name the parent's actual NEW collector output; the
    # default is only a location, never a synthetic completion attestation.
    geometry = Path(approval.get("original_geometry_completion_path", str(root / "geometry/complete.json"))).resolve()
    require(geometry.is_relative_to(root) and geometry.name == "complete.json" and geometry.is_file(),
            "Require actual completed original NEW geometry inside execution root")
    require(approval.get("original_geometry_completion_sha256") == replay.sha(geometry),
            "Original NEW geometry completion approval mismatch")
    value = execution.read_json(geometry)
    require(value.get("inputs_sha256") == verified["inputs_sha256"]
            and value.get("diagnostic_only") is True and value.get("promotion_allowed") is False
            and value.get("native_engine_calibration_passed") is True,
            "Original NEW geometry must actually finish with its native calibration")
    cases = value.get("cases", [])
    expected_new = {(s, n) for s in (38871, 38872, 38873) for n in (60, 1000, 2000)}
    require(len(cases) == 9 and {(c["seed"], c["size"]) for c in cases} == expected_new
            and all(c.get("cohort") == "NEW" and c.get("numeric_query_count") == 48
                    and c.get("eligibility_rows") == 336 and c.get("native_rows") == 48 * c["size"] for c in cases),
            "Original geometry skipped a fixed NEW case/task/profile")
    release = geometry.parent / "release.json"
    require(value.get("release_sha256") == replay.sha(release), "Original geometry release changed")
    original_release = execution.read_json(release)
    require(original_release.get("inputs_sha256") == verified["inputs_sha256"]
            and original_release.get("approval_sha256") == verified["approval_sha256"]
            and original_release.get("development_record_sha256") == replay.sha(a.development_record)
            and original_release.get("complete_roles_sha256") == replay.sha(root / "complete-roles.json"),
            "Original geometry used a different execution/release")
    files = value.get("files_sha256", {})
    expected_files = {execution.relative(geometry.parent / (name + ".jsonl"))
                      for name in ("native", "eligibility", "vector-inventory", "receipts", "calibration")}
    require(set(files) == expected_files, "Original geometry raw closure incomplete")
    for name, sha in files.items():
        require(replay.sha(execution.repo_file(name)) == sha, "Original geometry raw artifact changed")
    return approval, geometry


def preconditions(a, verified):
    """All offline release/source/identity checks precede outputs and any HTTP."""
    require(verified["approval"].get("diagnostic_only") is True
            and verified["approval"].get("forced_recommendation") == "D"
            and verified["approval"].get("promotion_allowed") is False,
            "Original immutable execution must remain forced-D diagnostic only")
    root = execution.artifact_root(a.artifact_root)
    output = execution.artifact_root(a.output)
    require(output == root / "additional-eligibility" and not output.exists(),
            "Require fresh exclusive root/additional-eligibility; no overwrite/retry")
    decision = execution.development_decision(a.development_record, verified)
    require(decision["selected_threshold"] in (None, "NONE"), "Original DEV decision must remain NONE")
    for split in ("development", "heldout", "roles"):
        execution.verify_complete(root, split, verified)
    require(decision.get("development_completion_sha256") == replay.sha(root / "complete-development.json"),
            "Original DEV completion changed")
    for name in ("release-heldout.json", "release-roles.json"):
        require(execution.read_json(root / name)["development_record_sha256"] == replay.sha(a.development_record),
                "Original immutable DEV record changed")
    approval, geometry = supplemental_gate(a, verified, root)
    require(not geometry.is_relative_to(output), "Original and additional collectors must be separate")
    cases = fixed_cases(verified["inputs"])
    # Full preflight catches missing tasks/exports/primary arms BEFORE any output
    # or diagnostic request. Source tasks are static; no rank-dependent selection.
    prepared = [load_case(root, case, verified) for case in cases]
    require(sum(len(item["query_ids"]) for item in prepared) == 240, "Exactly240 inherited task cases required")
    return root, output, approval, geometry, prepared


def primary_ids(row):
    hits = row["hits"]
    require(isinstance(hits, list) and len(hits) <= 10, "Expected actual primary top10 only")
    require([h["rank"] for h in hits] == list(range(1, len(hits) + 1)), "Invalid primary hit ranks")
    ids = [h["id"] for h in hits]
    require(all(isinstance(i, str) and i for i in ids) and len(ids) == len(set(ids)),
            "Invalid/duplicate primary hit identity")
    return ids


def load_case(root, case, verified):
    target = execution.case_dir(root, case)
    frozen_path = execution.bound_file(verified["inputs"], case["queries"])
    frozen = execution.unique_rows(replay.load_jsonl(frozen_path), "id")
    expected_count = 75 if case["cohort"] == "LEGACY" else 15
    require(len(frozen) == expected_count, "All frozen inherited tasks required, including filtered tasks")
    actual = execution.unique_rows(replay.load_jsonl(target / "embedded-queries.jsonl"), "id")
    require(actual.keys() == frozen.keys(), "Prepared inherited task identities differ")
    for qid in frozen:
        require({k: v for k, v in actual[qid].items() if k != "vector"}
                == {k: v for k, v in frozen[qid].items() if k != "vector"},
                "Frozen inherited query/filter metadata changed")
    # Reuse actual Scala contracts/config provenance, including topk source arm
    # validation only. No topk/native/isolated branch request is executed here.
    execution.validate_case_exports(root, case)
    paths = {label: target / "exports" / label / "requests.jsonl" for label in SYSTEMS + ["keyword"]}
    exports = {label: execution.unique_rows(replay.load_jsonl(path), "query_id") for label, path in paths.items()}
    for label, rows in exports.items():
        require(rows.keys() == frozen.keys(), "Export skipped/added an inherited frozen task")
        config = execution.read_json(target / "exports" / label / "config.json")
        config_sha = config.get("config_sha")
        require(isinstance(config_sha, str) and len(config_sha) == 64
                and all(row.get("config_sha") == config_sha for row in rows.values()),
                "Actual source config/export provenance differs")
    primary_path = target / "heldout-runs.jsonl"
    rows = replay.load_jsonl(primary_path)
    expected = {(qid, label) for qid in frozen for label in SYSTEMS + [contract.DIAGNOSTIC_LABEL]}
    indexed = {(r["query_id"], r["system"]): r for r in rows}
    require(len(rows) == len(indexed) == len(expected) and set(indexed) == expected,
            "All inherited primary tasks/eight source profiles must have completed")
    for (qid, label), row in indexed.items():
        require(row.get("seed") == case["seed"] and row.get("config", {}).get("index") == case["index"],
                "Primary case/index identity differs")
        primary_ids(row)
        if label in SYSTEMS:
            require(row["config"].get("export_request_sha256") == execution.digest(exports[label][qid]["request"]),
                    "Primary outcome request differs from actual source export")
    return {"case": case, "query_ids": sorted(frozen), "exports": exports, "primary": indexed,
        "source_files_sha256": {execution.relative(path): replay.sha(path)
                               for path in [frozen_path, target / "embedded-queries.jsonl", primary_path, *paths.values(),
                                            *(target / "exports" / label / "config.json" for label in SYSTEMS + ["keyword"])]},
        "query_ids_sha256": execution.digest(sorted(frozen))}


def receipt_sink(stream, case, qid, system, source, counter):
    def append(receipt):
        counter.append((qid, system))
        emit(stream, dict(receipt, **identity(case, query_id=qid, system=system,
            source_request_sha256=execution.digest(source), registration=MARKER,
            auxiliary_HTTP_timing_not_primary_latency=True)))
    return append


def collect_case(a, item, streams):
    case, exports = item["case"], item["exports"]
    receipts, discrepancies = [], []
    for qid in item["query_ids"]:
        keyword_source = exports["keyword"][qid]["request"]
        keyword = diag.fetch_exhaustive(a.engine_url, case["index"], keyword_source, case["catalog_size"],
            primary_ids=[], receipt_sink=receipt_sink(streams["receipts"], case, qid, "keyword", keyword_source, receipts))
        for label in SYSTEMS:
            source = exports[label][qid]["request"]
            hybrid = diag.fetch_exhaustive(a.engine_url, case["index"], source, case["catalog_size"],
                primary_ids=primary_ids(item["primary"][qid, label]),
                receipt_sink=receipt_sink(streams["receipts"], case, qid, label, source, receipts))
            missing = hybrid["primary_ids_missing_from_collector"]
            if missing:
                discrepancies.append({"query_id": qid, "system": label, "missing_primary_ids": missing})
            emit(streams["additional-eligibility"], identity(case, query_id=qid, system=label,
                complete=True, keyword_ids=keyword["ids"], hybrid_ids=hybrid["ids"],
                source_primary_top10_subset=not missing, primary_ids_missing_from_full_collector=missing,
                source_request_sha256=execution.digest(source), request_sha256=hybrid["request_sha256"],
                keyword_source_request_sha256=execution.digest(keyword_source),
                keyword_request_sha256=keyword["request_sha256"],
                source_config_sha256=exports[label][qid]["config_sha"],
                keyword_source_config_sha256=exports["keyword"][qid]["config_sha"],
                full_window=case["catalog_size"], search_pipeline="_none",
                membership_source="actual_engine_full_window_not_exact_HNSW_oracle",
                keyword_membership_source="actual_Scala_keyword_lexical_query",
                hybrid_membership_is_approximate=True, root_nested_membership_collected=False,
                registration=MARKER, diagnostic_only=True, promotion_allowed=False))
    expected_receipts = {(qid, system) for qid in item["query_ids"] for system in SYSTEMS + ["keyword"]}
    require(len(receipts) == len(expected_receipts) and set(receipts) == expected_receipts,
            "Exactly one keyword and seven hybrid receipts per task required; no retries")
    return identity(case, query_count=len(item["query_ids"]), query_ids=item["query_ids"],
        query_ids_sha256=item["query_ids_sha256"], eligibility_rows=len(item["query_ids"]) * 7,
        diagnostic_requests=len(receipts), complete=not discrepancies,
        capture_status="complete_capture_with_window_discrepancies" if discrepancies else "complete_capture",
        window_discrepancies=discrepancies, source_files_sha256=item["source_files_sha256"])


def observed_membership_attribution(row, baseline_row, dataset_id):
    """Analysis-only set provenance, NOT grades/metrics or exact vector truth.

    Join a separately known grade0 label outside this helper. REAL stays unjudged;
    U labels never become grade0. Baseline full IDs (not baseline top10) are used.
    Missing primary IDs remain explicit and cannot be interpreted as ineligibility.
    """
    require(row.get("complete") is True and baseline_row.get("complete") is True,
            "Require both complete response captures")
    require(baseline_row["system"] == "ms_050" and row["system"] in SYSTEMS, "Require actual full .50 baseline")
    require(all(row[k] == baseline_row[k] for k in ("cohort", "seed", "size", "query_id"))
            and set(row["keyword_ids"]) == set(baseline_row["keyword_ids"]), "Attribution case/keyword mismatch")
    keyword = dataset_id in row["keyword_ids"]
    hybrid = dataset_id in row["hybrid_ids"]
    baseline = dataset_id in baseline_row["hybrid_ids"]
    discrepancy = any(dataset_id in r["primary_ids_missing_from_full_collector"]
                      for r in (row, baseline_row))
    return {"dataset_id": dataset_id, "observed_keyword_member": keyword,
        "observed_hybrid_member": hybrid, "observed_baseline_full_hybrid_member": baseline,
        "observed_vector_introduced": hybrid and not keyword,
        "observed_new_admission_vs_baseline_full": hybrid and not baseline,
        "primary_window_discrepancy_for_id": discrepancy,
        "usable_for_primary_attribution": not discrepancy,
        "new_admission_classification": None if discrepancy else hybrid and not baseline,
        "exact_vector_membership_claimed": False, "root_nested_attribution_available": False,
        "relevance_judgment_derived": False}


def collect(a, verified):
    root, output, approval, geometry, prepared = preconditions(a, verified)
    # Reuses original index UUID/count/mapping and immutable vector-source guard.
    # No new source scans or HTTP are authorized until this explicit invocation.
    execution.verify_installation(a, root, verified)
    output.mkdir(exist_ok=False)
    task_case_ids = [identity(item["case"], query_id=qid)
                     for item in prepared for qid in item["query_ids"]]
    release = {"created_utc": execution.utc(), "registration": MARKER, "diagnostic_only": True,
        "promotion_allowed": False, "forced_recommendation": "D", "profiles": PROFILES, "systems": SYSTEMS,
        "query_selection": "all_frozen_queries", "fixed_cohorts": ["LEGACY", "REAL"],
        "inputs_sha256": verified["inputs_sha256"], "approval_sha256": verified["approval_sha256"],
        "diagnostic_approval_sha256": replay.sha(a.diagnostic_approval),
        "collector_source_sha256": replay.sha(Path(__file__)),
        "development_record_sha256": replay.sha(a.development_record),
        "original_geometry_completion_path": execution.relative(geometry),
        "original_geometry_completion_sha256": approval["original_geometry_completion_sha256"],
        "primary_completions_sha256": {s: replay.sha(root / ("complete-" + s + ".json"))
                                       for s in ("development", "heldout", "roles")},
        "installation_sha256": replay.sha(root / "installation.json"),
        "all_primary_mixed_latencies_and_NEW_geometry_finished_before_additional": True,
        "qrels_consumed": False, "primary_latency_samples_added": 0, "native_or_branch_probes": 0,
        "planned_task_cases": 240, "planned_rows": 1680, "planned_diagnostic_requests": 1920,
        "task_case_ids_sha256": execution.digest(task_case_ids),
        "label_policy": {"LEGACY": "unchanged_known_labels_and_12_U_not_grade0", "REAL": "all_unjudged_no_FP_claim"},
        "source_cases": [dict(identity(i["case"]), query_ids=i["query_ids"],
                              query_ids_sha256=i["query_ids_sha256"], source_files_sha256=i["source_files_sha256"])
                         for i in prepared]}
    execution.exclusive_json(output / "release.json", release)
    paths = {name: output / (name + ".jsonl") for name in ("additional-eligibility", "receipts")}
    streams = {}
    try:
        for name, path in paths.items():
            streams[name] = path.open("x", encoding="utf8")
        cases = [collect_case(a, item, streams) for item in prepared]
    finally:
        for stream in streams.values():
            stream.close()
    require(sum(c["query_count"] for c in cases) == 240
            and sum(c["eligibility_rows"] for c in cases) == 1680
            and sum(c["diagnostic_requests"] for c in cases) == 1920, "Additional capture counts differ")
    consistent = all(c["complete"] for c in cases)
    execution.exclusive_json(output / "complete.json", {"completed_utc": execution.utc(),
        "registration": MARKER, "diagnostic_only": True, "promotion_allowed": False, "forced_recommendation": "D",
        "inputs_sha256": verified["inputs_sha256"], "approval_sha256": verified["approval_sha256"],
        "diagnostic_approval_sha256": replay.sha(a.diagnostic_approval), "profiles": PROFILES, "systems": SYSTEMS,
        "query_selection": "all_frozen_queries", "source_cases": cases, "case_count": 4,
        "task_case_count": 240, "row_count": 1680, "diagnostic_request_count": 1920,
        "task_case_ids_sha256": execution.digest(task_case_ids),
        "collector_source_sha256": release["collector_source_sha256"],
        "label_policy": release["label_policy"],
        "original_geometry_completion_sha256": approval["original_geometry_completion_sha256"],
        "complete": consistent, "capture_complete": True,
        "capture_status": "complete_capture" if consistent else "complete_capture_with_window_discrepancies",
        "full_window_is_not_exact_HNSW_oracle": True,
        "release_sha256": replay.sha(output / "release.json"),
        "files_sha256": {execution.relative(p): replay.sha(p) for p in paths.values()}})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ("approval", "inputs", "artifact-root", "development-record", "output", "diagnostic-approval"):
        parser.add_argument("--" + flag, type=Path, required=True)
    parser.add_argument("--engine-url", default="http://127.0.0.1:19200")
    a = parser.parse_args()
    replay.local_url(a.engine_url)
    verified = execution.gate(a.approval, a.inputs)
    collect(a, verified)


if __name__ == "__main__":
    main()
