#!/usr/bin/env python3
"""Explicit pre-retrieval installation observation repair; original failure retained.

No source mapping, prepared document/vector, export, approval, timing runner or
production file is changed. This is NOT a generic dynamic-mapping exception.
"""
import argparse
import copy
import datetime
import importlib.util
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("threshold_installation_recovery_execute", ROOT / "execute.py")
ex = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ex)
FIRST_INDEX = "magda-relevance-eval-threshold3887-new-38871-n60"
LANDING_PAGE = {"type": "text", "fields": {"keyword": {"type": "keyword", "ignore_above": 256}}}


def normalize_objects(value, path=(), omissions=None):
    """Only redundant explicit object type alongside a properties dict."""
    if isinstance(value, list):
        return [normalize_objects(item, path + (n,), omissions) for n, item in enumerate(value)]
    if not isinstance(value, dict):
        return value
    result = {key: normalize_objects(item, path + (key,), omissions) for key, item in value.items()}
    if result.get("type") == "object" and isinstance(result.get("properties"), dict):
        result.pop("type")
        if omissions is not None:
            omissions.append(list(path + ("type",)))
    return result


SOURCE_FIELDS = {
    "NEW": {"landingPage": "string"},
    "LEGACY": {"contactPoint.email": "string", "contactPoint.name": "string", "issued": "date",
               "languages": "string_list", "spatial.text": "string"},
    "REAL": {"distributions.issued": "date", "distributions.modified": "date", "issued": "date",
             "modified": "date", "landingPage": "string", "languages": "string_list",
             "publisher.source": "source_object", "spatial.text": "string"}}


def source_values(value, parts):
    # OpenSearch ignores explicit nulls for dynamic type inference; source bytes
    # remain unchanged and explicit typed_source([None], ...) still fails closed.
    if value is None:
        return []
    if not parts:
        return [value]
    if isinstance(value, list):
        return [result for item in value for result in source_values(item, parts)]
    if not isinstance(value, dict) or parts[0] not in value:
        return []
    return source_values(value[parts[0]], parts[1:])


def typed_source(values, kind):
    ex.require(values, "Dynamic mapping has no actual source values")
    for value in values:
        if kind == "string_list":
            ex.require(type(value) is list and all(item is None or type(item) is str for item in value), "Expected source string array")
        elif kind == "source_object":
            ex.require(type(value) is dict and set(value) <= {"id", "name", "url"}
                       and all(item is None or type(item) is str for item in value.values()), "Unexpected publisher.source shape")
        else:
            ex.require(type(value) is str, "Expected source string, never null/numeric")
            if kind == "date":
                parsed = datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
                ex.require(parsed.tzinfo is not None, "Expected explicit ISO date timezone")


def unused_field(exports, field):
    def forbidden(value):
        return isinstance(value, str) and (value.split("^")[0] == field or value.startswith(field + "."))
    for row in exports:
        for _, node in ex.contract.walk(row["request"]["body"]):
            if not isinstance(node, dict):
                continue
            ex.require("query_string" not in node and node.get("default_field") not in ("*", "_all"),
                       "Broad query field scope prevents unused-field waiver")
            ex.require(not any(forbidden(key) for key in node), "Approved dynamic metadata field is queried")
            for key in ("field", "default_field"):
                ex.require(not forbidden(node.get(key)), "Approved dynamic metadata field is queried")
            if "script" in node:
                ex.require(field not in ex.contract.canonical(node["script"]).decode("utf8"),
                           "Script references approved dynamic metadata field")
            fields = node.get("fields", [])
            if isinstance(fields, dict):
                ex.require(not any(forbidden(item) for item in fields), "Queried dynamic field mapping")
            if isinstance(fields, list):
                ex.require(all(not forbidden(item) and (not isinstance(item, str) or
                           not any(c in item for c in ("*", "?"))) for item in fields),
                           "Queried/wildcard field scope prevents unused-field waiver")


def semantic_mapping(expected, actual, documents, exports, cohort="NEW"):
    actual_sha = ex.digest(actual)
    actual = copy.deepcopy(actual)
    allowed = []
    ex.require(cohort in SOURCE_FIELDS, "Unknown cohort mapping policy")
    for field, kind in SOURCE_FIELDS[cohort].items():
        expected_parent, actual_parent = expected, actual
        parts = field.split(".")
        for part in parts[:-1]:
            expected_parent = expected_parent.get("properties", {}).get(part, {})
            actual_parent = actual_parent.get("properties", {}).get(part, {})
        name = parts[-1]
        if name in expected_parent.get("properties", {}) or name not in actual_parent.get("properties", {}):
            continue
        observed = actual_parent["properties"][name]
        values = [value for doc in documents for value in source_values(doc, parts)]
        typed_source(values, kind)
        if kind == "string_list":
            ex.require(any(item is not None for value in values for item in value),
                       "All-null/empty arrays cannot authorize a dynamic field mapping")
        object_keys = {key for value in values if isinstance(value, dict)
                       for key, item in value.items() if item is not None}
        if kind == "source_object":
            ex.require(object_keys, "All-null source object cannot authorize dynamic child mappings")
        schema = ({"properties": {key: LANDING_PAGE for key in sorted(object_keys)}}
                  if kind == "source_object" else {"type": "date"} if kind == "date" else LANDING_PAGE)
        normalized_observed = normalize_objects(observed)
        if kind == "date" and normalized_observed == {"type": "date", "format": "strict_date_optional_time||epoch_millis"}:
            normalized_observed = {"type": "date"}
        ex.require(ex.contract.canonical(normalized_observed) == ex.contract.canonical(schema),
                   "Unexpected exact mapping for licensed source field: " + field)
        unused_field(exports, field)
        actual_parent["properties"].pop(name)
        allowed.append({"source_path": field, "source_type": kind, "actual": observed,
                        "source_value_count": len(values), "source_values_sha256": ex.digest(values),
                        "basis": "frozen_source_typed_metadata_unused_by_actual_export_DSL"})
    explicit = []
    normalized = normalize_objects(expected, omissions=explicit)
    ex.require(ex.contract.canonical(normalized) == ex.contract.canonical(normalize_objects(actual)),
               "Mapping differs beyond exact redundant-object/licensed-source-field observation guard")
    return {"strict_mapping_byte_equality_passed": ex.digest(expected) == actual_sha,
            "semantic_mapping_observation_passed": True, "source_mapping_sha256": ex.digest(expected),
            "actual_mapping_sha256": actual_sha, "normalized_mapping_sha256": ex.digest(normalized),
            "redundant_explicit_object_paths": explicit, "licensed_dynamic_extensions": allowed}


def exists(engine, index):
    """HEAD only; never dispatch a search or parse an empty HEAD body as JSON."""
    ex.replay.local_url(engine)
    ex.replay.owned(index)
    request = ex.replay.urllib.request.Request(engine + "/" + index, method="HEAD")
    opener = ex.replay.urllib.request.build_opener(ex.replay.urllib.request.ProxyHandler({}), ex.replay.NoRedirect())
    try:
        with opener.open(request, timeout=180) as response:
            ex.require(response.status == 200, "Unexpected index existence response")
            return True
    except ex.replay.urllib.error.HTTPError as error:
        if error.code == 404:
            return False
        raise


def verify_existing_source(engine, index, documents):
    wanted = ex.unique_rows(documents, "identifier")
    seen = set()
    for start in range(0, len(documents), 50):
        ids = [doc["identifier"] for doc in documents[start:start + 50]]
        response = ex.replay.request(engine, "POST", "/" + index + "/_mget", {"ids": ids})
        rows = response.get("docs", [])
        ex.require(len(rows) == len(ids), "Existing index mget count differs")
        for row in rows:
            identifier = row.get("_id")
            ex.require(row.get("found") is True and row.get("_index") == index and identifier in ids
                       and identifier not in seen and "error" not in row,
                       "Existing index missing/duplicate/foreign document")
            ex.require(ex.contract.canonical(row.get("_source")) == ex.contract.canonical(wanted[identifier]),
                       "Existing engine source metadata/vector differs: " + identifier)
            seen.add(identifier)
    ex.require(seen == set(wanted), "Existing index source coverage incomplete")
    return {"all_source_documents_verified_by_mget": len(seen),
            "source_and_vectors_exact_canonical_json_equal": True, "searches_executed": 0}


def recovery_gate(a, verified):
    value = ex.read_json(a.recovery_approval)
    ex.require(value.get("approved_by") == "parent-agent" and value.get("action") == "repair_mapping_observation_guard"
               and value.get("diagnostic_only") is True and value.get("forced_recommendation") == "D"
               and value.get("promotion_allowed") is False and value.get("production_mapping_unchanged") is True,
               "Explicit forced-D mapping observation repair approval required")
    for key, expected in (("original_inputs_sha256", verified["inputs_sha256"]),
                          ("original_approval_sha256", verified["approval_sha256"]),
                          ("recovery_code_sha256", ex.replay.sha(Path(__file__)))):
        ex.require(value.get(key) == expected, "Recovery approval source/hash mismatch: " + key)
    ex.require(value.get("reuse_existing_index") == FIRST_INDEX, "Only the exact first index may be reused")
    ex.require(value.get("allow_expected_source_dynamic_fields") == SOURCE_FIELDS,
               "Explicit exact cohort-specific typed source-field policy required")
    for key in ("installation_failed_log", "mapping_diff_source", "source_extension_inventory"):
        reference = value[key]
        ex.require(ex.replay.sha(ex.repo_file(reference["path"])) == reference["sha256"], "Failed observation evidence changed")
    inventory = ex.read_json(ex.repo_file(value["source_extension_inventory"]["path"]))
    ex.require(inventory.get("source_only_no_retrieval") is True, "Require pre-install source-only extension inventory")
    expected_cases = {(c["cohort"], c["seed"], c["catalog_size"]) for c in verified["inputs"]["cases"]}
    observed_cases = [(c["cohort"], c["seed"], c["size"]) for c in inventory["cases"]]
    ex.require(len(observed_cases) == len(expected_cases) and set(observed_cases) == expected_cases,
               "Source extension inventory must cover exactly all original cases")
    for case in inventory["cases"]:
        ex.require(set(case["unmapped_prepared_fields"]) == {"$." + field for field in SOURCE_FIELDS[case["cohort"]]},
                   "Prepared inventory differs from exact approved cohort-specific extension policy")
    difference = ex.read_json(ex.repo_file(value["mapping_diff_source"]["path"]))
    ex.require(difference["index"] == FIRST_INDEX, "Failure evidence belongs to another index")
    return value


def recover(a, verified):
    approval = recovery_gate(a, verified)  # Offline checks precede any engine operation.
    ex.require(a.allow_local_writes, "Explicit installation writes required")
    root = ex.artifact_root(a.artifact_root)
    ex.require(not (root / "installation.json").exists() and not any(root.glob("release-*.json"))
               and not any(root.rglob("*-runs.jsonl")) and not any(root.rglob("*-receipts.jsonl")),
               "Recovery is permitted only before the first retrieval/timing release")
    ex.verify_exports(root, verified)
    cases = verified["inputs"]["cases"]
    ex.require(cases[0]["index"] == FIRST_INDEX and cases[0]["catalog_size"] == 60,
               "Original failed first case/order differs")
    evidence_path = root / "installation-recovery-observations.jsonl"
    ex.require(not evidence_path.exists(), "Do not overwrite/retry an earlier recovery")
    # Inspect only prepared source metadata and frozen DSL, before any engine calls.
    for case in cases:
        target = ex.case_dir(root, case)
        docs = ex.replay.load_jsonl(target / "embedded-corpus.jsonl")
        exports = [row for label in (*ex.contract.THRESHOLD_LABELS, ex.contract.DIAGNOSTIC_LABEL, "keyword")
                   for row in ex.replay.load_jsonl(target / "exports" / label / "requests.jsonl")]
        for field, kind in SOURCE_FIELDS[case["cohort"]].items():
            values = [value for doc in docs for value in source_values(doc, field.split("."))]
            if values:
                typed_source(values, kind)
                unused_field(exports, field)
    rows, started = [], ex.utc()
    with evidence_path.open("x", encoding="utf8") as evidence:
        evidence.write(ex.contract.canonical({"kind": "recovery_release", "created_utc": started,
            "approval_sha256": ex.replay.sha(a.recovery_approval), "original_failure_preserved": True}).decode() + "\n")
        evidence.flush()
        for number, case in enumerate(cases):
            target = ex.case_dir(root, case)
            mapping, corpus = target / "exports/ms_050/mapping.json", target / "embedded-corpus.jsonl"
            docs = ex.replay.load_jsonl(corpus)
            present = exists(a.engine_url, case["index"])
            ex.require(present if number == 0 else not present, "Unexpected index existence; no overwrite/reinstall")
            source_receipt = verify_existing_source(a.engine_url, case["index"], docs) if number == 0 else None
            if number:
                ex.replay.install(SimpleNamespace(engine_url=a.engine_url, index=case["index"], mapping=mapping,
                                                  corpus=corpus, allow_local_writes=True))
            metadata = ex.index_metadata(a.engine_url, case)
            actual = ex.replay.request(a.engine_url, "GET", "/" + case["index"] + "/_mapping")[case["index"]]["mappings"]
            ex.require(metadata["mapping_sha256"] == ex.digest(actual), "Engine mapping changed during observation")
            expected = ex.read_json(mapping)["mappings"]
            observed = {"index": case["index"], "metadata": metadata, "expected_mapping": expected,
                        "actual_mapping": actual, "existing_source_verification": source_receipt, "created_utc": ex.utc()}
            evidence.write(ex.contract.canonical(observed).decode() + "\n")
            evidence.flush()  # Preserve unexpected concrete mapping even if the strict waiver fails.
            exports = [row for label in (*ex.contract.THRESHOLD_LABELS, ex.contract.DIAGNOSTIC_LABEL, "keyword")
                       for row in ex.replay.load_jsonl(target / "exports" / label / "requests.jsonl")]
            proof = semantic_mapping(expected, actual, docs, exports, case["cohort"])
            vectors = [{"identifier": doc["identifier"], "root": doc["queryContextVector"],
                        "children": [child["queryContextVector"] for child in doc.get("distributions", [])]} for doc in docs]
            rows.append(dict(metadata, cohort=case["cohort"], seed=case["seed"], catalog_size=case["catalog_size"],
                index=case["index"], corpus_sha256=ex.replay.sha(corpus), mapping_file_sha256=ex.replay.sha(mapping),
                source_vectors_sha256=ex.digest(vectors), mapping_observation_recovery=proof))
    ex.exclusive_json(root / "installation.json", {"started_utc": started, "completed_utc": ex.utc(),
        "engine_url": a.engine_url, "inputs_sha256": verified["inputs_sha256"],
        "export_completion_sha256": ex.replay.sha(root / "export-completion.json"),
        "all_cases_installed_before_timings": True, "cases": rows, "initial_strict_installation_failure_preserved": True,
        "recovery_approval_sha256": ex.replay.sha(a.recovery_approval),
        "recovery_observations_sha256": ex.replay.sha(evidence_path), "recovery_source_sha256": ex.replay.sha(Path(__file__)),
        "mapping_difference_source": approval["mapping_diff_source"], "source_mapping_modified": False})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("approval", "inputs", "recovery-approval", "artifact-root"):
        parser.add_argument("--" + name, type=Path, required=True)
    parser.add_argument("--engine-url", default="http://127.0.0.1:19200")
    parser.add_argument("--allow-local-writes", action="store_true")
    a = parser.parse_args()
    ex.replay.local_url(a.engine_url)
    recover(a, ex.gate(a.approval, a.inputs))


if __name__ == "__main__":
    main()
