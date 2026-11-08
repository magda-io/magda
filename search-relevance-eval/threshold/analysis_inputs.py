#!/usr/bin/env python3
"""Typed, source-bound artifact adapter for #3887. No metrics or service calls.

Run ONLY after main releases the completed artifacts. Source bytes are loaded
from explicit SHA-bound references, never discovered by searching directories.
Consolidated JSON arguments preserve raw source closure in source_transforms.
"""
import argparse
import copy
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("threshold_input_analysis_core", HERE / "analyze.py")
analysis = importlib.util.module_from_spec(spec)
spec.loader.exec_module(analysis)
MAPPING = {"topk10diag": "topk10"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha_bytes(raw):
    return hashlib.sha256(raw).hexdigest()


def file_sha(path):
    value = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def read_bound(ref, base=Path(".")):
    path = (Path(base) / ref["path"]).resolve()
    require(file_sha(path) == ref["sha256"], "Source SHA mismatch: " + str(path))
    fmt = ref.get("format", "jsonl" if path.suffix == ".jsonl" else "json")
    require(fmt in ("json", "jsonl"), "Only typed JSON/JSONL sources allowed")
    with path.open(encoding="utf8") as stream:
        value = [json.loads(line) for line in stream if line.strip()] if fmt == "jsonl" else json.load(stream)
    return value, dict(path=str(path), sha256=ref["sha256"], format=fmt)


def canonical_digest(value):
    """Identical canonical SHA to analyzer.digest without a giant JSON string."""
    hasher = hashlib.sha256()
    encoder = json.JSONEncoder(sort_keys=True, separators=(",", ":"), allow_nan=False)
    for chunk in encoder.iterencode(value):
        hasher.update(chunk.encode())
    return hasher.hexdigest()


def canonical_labels(rows):
    labels = {r.get("system") for r in rows}
    require(not {"topk10diag", "topk10"} <= labels, "Duplicate topk source/canonical aliases")
    return [dict(row, system=MAPPING.get(row["system"], row["system"])) for row in rows]


def source_binding(ref):
    return dict(path=ref["path"], expected_sha256=ref["sha256"], observed_sha256=ref["sha256"])


def case_key(case):
    return case["cohort"], case["seed"], case["catalog_size"]


def inject_case(rows, case, receipt=False, copy_rows=True):
    """Inject ONLY identity fixed by the signed execution manifest/index binding."""
    out = []
    for row in rows:
        current = copy.deepcopy(row) if copy_rows else row
        expected = dict(cohort=case["cohort"], seed=case["seed"], size=case["catalog_size"])
        for key, value in expected.items():
            require(key not in current or current[key] == value, "Artifact case identity contradicts execution manifest")
        index = current.get("index", current.get("config", {}).get("index"))
        require(index == case["index"], "Artifact index does not match manifest case")
        current.update(expected)
        if receipt:
            require(all(field in current for field in ("hits", "aggregations", "total_hits", "all_hit_signatures",
                    "request_started_utc", "request_completed_utc", "parsed_json_sha256")), "Incomplete source receipt surfaces/UTC")
            roots = [s for s in current["all_hit_signatures"] if s.get("path") == ["hits", "hits"]]
            require(len(roots) == 1, "Exactly one actual root hit signature required")
            project = lambda hit: {key: hit.get(key) for key in ("id", "rank", "score")}
            require([project(h) for h in roots[0]["hits"]] == [project(h) for h in current["hits"]], "Root receipt signatures disagree")
            # Keep every original nested/source identity; only the duplicated root
            # comparison view is projected to evaluator's existing three fields.
            current["source_all_hit_signatures"] = current["all_hit_signatures"]
            current["all_hit_signatures"] = [dict(signature, hits=[project(h) for h in signature["hits"]])
                if signature.get("path") == ["hits", "hits"] else signature for signature in current["all_hit_signatures"]]
            current["hits"] = [project(h) for h in current["hits"]]
        out.append(current)
    require(not {"topk10diag", "topk10"} <= {r.get("system") for r in out}, "Duplicate topk aliases")
    return out


def corpus_descriptors(cases, documents):
    result = []
    cores = {}
    for case in cases:
        rows = documents[case_key(case)]
        ids = [r["identifier"] for r in rows]
        require(len(ids) == len(set(ids)) == case["catalog_size"], "Actual corpus ID count/uniqueness mismatch")
        if case["cohort"] == "NEW" and case["catalog_size"] == 60:
            cores[case["seed"]] = ids
    for case in cases:
        ids = [r["identifier"] for r in documents[case_key(case)]]
        core = cores.get(case["seed"], ids) if case["cohort"] == "NEW" else ids
        require(set(core) <= set(ids), "Core IDs absent from larger corpus")
        result.append(dict(cohort=case["cohort"], seed=case["seed"], size=case["catalog_size"], ids=ids, core_ids=core))
    return result


def legacy_qrels(rows):
    result = []
    for row in rows:
        require("seed" in row, "Original diagnostic qrels must remain seed-specific")
        require("cohort" not in row or row["cohort"] == "LEGACY", "Wrong legacy qrel cohort")
        require("size" not in row or row["size"] == 180, "Wrong legacy qrel size")
        result.append(dict(row, cohort="LEGACY", size=180))
    return result


def branch_evidence(rows, queries, qrels, source_sha256):
    """Join C's scope-level facts/quotes to audited useful grades, never new qrels."""
    grades = {(r["seed"], r["size"], r["query_id"], r["dataset_id"]): r["grade"] for r in qrels}
    result, seen = [], set()
    for row in rows:
        if row["size"] != 60:
            continue  # Immutable byte-identical core support reused at larger levels.
        for query in queries:
            if query["kind"] != "semantic":
                continue
            grade = grades.get((row["seed"], 60, query["id"], row["dataset_id"]))
            if type(grade) is not int or grade < 2:
                continue
            scopes = row["branch_measurement_support"].get(query["intent_id"], {})
            accepted = {}
            for scope, support in sorted(scopes.items()):
                if support.get("useful_measurement_complete") is not True or len(support.get("facts", [])) < grade:
                    continue
                facts = set(support["facts"])
                citations = []
                for ci, context in enumerate(row["actual_contexts_with_literal_quotes"]):
                    for fact, quotes in context.get("facts", {}).items():
                        if fact not in facts:
                            continue
                        for quote in quotes:
                            field = quote["field"]
                            matches = field in ("title", "description", "queryContext") if scope == "root" else field.startswith("distributions." + scope.split(".")[1] + ".")
                            if matches:
                                citations.append(dict(source_sha256=source_sha256,
                                    actual_raw_record_sha256=row["actual_raw_record_sha256"], context_index=ci,
                                    fact=fact, field=field, quote=quote["quote"]))
                if len({c["fact"] for c in citations}) < grade:
                    continue
                role = "root" if scope == "root" else "nested"
                # Never combine facts from different children into one complete child.
                accepted.setdefault(role, (scope, citations))
            for role, (scope, refs) in accepted.items():
                key = row["seed"], query["id"], row["dataset_id"], role
                require(key not in seen, "Duplicate C branch evidence")
                seen.add(key)
                result.append(dict(cohort="NEW", seed=row["seed"], query_id=query["id"], dataset_id=row["dataset_id"],
                                   branch=role, source_scope=scope, supports_dataset_grade=True,
                                   dataset_grade=grade, evidence_refs=refs))
    return result


def make_decision(policy, inputs_ref, development_completion_ref, *, timestamp_utc, parent_acknowledgment, base=Path(".")):
    """ONE immutable NONE record satisfying analyzer AND execution gate schemas."""
    inputs, ir = read_bound(inputs_ref, base)
    complete, cr = read_bound(development_completion_ref, base)
    require(complete.get("split") == "development" and complete.get("inputs_sha256") == ir["sha256"], "DEV completion belongs to different inputs")
    require(analysis._utc(timestamp_utc) >= analysis._utc(complete["completed_utc"]), "NONE decision predates completed DEV")
    expected = {case_key(c) for c in inputs["cases"] if c["cohort"] == "NEW"}
    actual = {(c["cohort"], c["seed"], c["catalog_size"]) for c in complete["cases"]}
    require(actual == expected and len(complete["cases"]) == len(expected), "DEV completion missing/duplicate NEW case")
    record = analysis.nonpromotional_no_selection(policy, timestamp_utc=timestamp_utc, parent_acknowledgment=parent_acknowledgment)
    record.update(created_utc=timestamp_utc, immutable_before_heldout=True, selected_threshold=None,
                  inputs_sha256=ir["sha256"], development_completion_sha256=cr["sha256"])
    record["record_sha256"] = canonical_digest({k: v for k, v in record.items() if k != "record_sha256"})
    return record


class Sources:
    def __init__(self, workspace, execution_ref, completion_refs):
        self.workspace = Path(workspace).resolve()
        self.inputs, self.execution_ref = read_bound(execution_ref, self.workspace)
        self.expected = dict(self.inputs["source_sha256"])
        self.reads = [self.execution_ref]
        self.completions = []
        for ref in completion_refs:
            doc, actual = read_bound(ref, self.workspace)
            require(doc.get("inputs_sha256") == self.execution_ref["sha256"], "Completion belongs to different execution manifest")
            self.reads.append(actual)
            self.completions.append(doc)
            maps = [doc.get("files_sha256", {})] + [c.get("files_sha256", {}) for c in doc.get("cases", [])]
            for values in maps:
                for path, digest in values.items():
                    require(path not in self.expected or self.expected[path] == digest, "Conflicting source hash closure")
                    self.expected[path] = digest

    def read(self, path, fmt=None):
        path = Path(path)
        absolute = path.resolve() if path.is_absolute() else (self.workspace / path).resolve()
        relative = str(absolute.relative_to(self.workspace))
        require(relative in self.expected, "Artifact absent from signed input/completion closure: " + relative)
        value, ref = read_bound(dict(path=str(absolute), sha256=self.expected[relative], **({"format": fmt} if fmt else {})))
        self.reads.append(ref)
        return value


def _write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf8") as stream:
        json.dump(value, stream, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
        stream.write("\n")
    return dict(path=str(path.resolve()), sha256=file_sha(path), format="json")


def prepare_inputs(*, workspace, execution_inputs, execution_root, completion_refs, source_refs, output_dir):
    """Actual main-only adapter. Tests use tiny mocks; no scoring occurs here.

    source_refs names: queries,intents,gates,generation_spec,new_qrels,
    expanded_evidence,diagnostic_policy,selection,analysis_bindings; optional
    legacy_queries/legacy_intents/legacy_qrels and real_anchors; evidence role
    references use names `binding_<role>`. Geometry paths are passed through
    source_refs native_scores/eligibility/vector_inventory and must also occur
    in a source-bound completion file. All references are explicit SHA256s.
    """
    sources = Sources(workspace, execution_inputs, completion_refs)
    root = Path(execution_root).resolve()
    output = Path(output_dir).resolve()
    allowed = Path(workspace).resolve() / "search-relevance-eval/threshold/.local/analysis-inputs"
    require(output == allowed or allowed in output.parents, "Adapter writes only .local/analysis-inputs")
    require(not output.exists(), "No overwrite of an analysis-input artifact directory")
    refs, values, cache = {}, {}, {}
    for name, ref in source_refs.items():
        key = (str((Path(workspace) / ref["path"]).resolve()), ref["sha256"], ref.get("format"))
        if key not in cache:
            cache[key] = read_bound(ref, workspace)
        values[name], refs[name] = cache[key]
    for name in ("native_scores", "eligibility", "vector_inventory"):
        # Already read/hashed above: verify the same raw bytes are independently
        # named in collector completion without allocating a duplicate huge list.
        relative = str(Path(refs[name]["path"]).relative_to(sources.workspace))
        require(sources.expected.get(relative) == refs[name]["sha256"], "Geometry source absent from completion closure")
    cache.clear()
    require(values["analysis_bindings"].get("raw_to_analysis_system_mapping") == MAPPING, "Pre-execution label mapping differs")
    cases = sources.inputs["cases"]
    require(len({case_key(c) for c in cases}) == len(cases), "Duplicate signed case keys")
    documents = {case_key(c): sources.read(c["corpus"]) for c in cases}
    descriptors = corpus_descriptors(cases, documents)
    runs, receipts, real = [], [], []
    for case in cases:
        target = root / case["cohort"] / str(case["seed"]) / str(case["catalog_size"])
        phases = ("development", "heldout", "roles") if case["cohort"] == "NEW" else ("heldout",)
        for phase in phases:
            rs = inject_case(sources.read(target / (phase + "-runs.jsonl")), case, copy_rows=False)
            rr = inject_case(sources.read(target / (phase + "-receipts.jsonl")), case, receipt=True, copy_rows=False)
            if case["cohort"] == "REAL":
                real.append(dict(case=list(case_key(case)), runs=rs, receipts=rr,
                                 label_policy="Unjudged, never0; raw observations only, excluded from primary metrics"))
            else:
                runs.extend(rs)
                receipts.extend(rr)
    # No query, qrel, score, membership or response content is manufactured.
    payload = dict(queries=values["queries"], intents=values["intents"], gates=values["gates"],
        qrels=values["new_qrels"], corpora=[c for c in descriptors if c["cohort"] == "NEW"],
        runs=[r for r in runs if r["cohort"] == "NEW"], receipts=[r for r in receipts if r["cohort"] == "NEW"],
        native_scores=values["native_scores"], eligibility=values["eligibility"], vector_inventory=values["vector_inventory"],
        selection=values["selection"], diagnostic_policy=values["diagnostic_policy"], label_mapping=MAPPING,
        fixed_pairs=values["generation_spec"]["fixed_score_diagnostic_pairs"])
    payload["branch_evidence"] = branch_evidence(values["expanded_evidence"], payload["queries"], payload["qrels"], refs["expanded_evidence"]["sha256"])
    if any(c["cohort"] == "LEGACY" for c in cases):
        binding = values["analysis_bindings"]["legacy"]
        payload["legacy"] = dict(queries=values["legacy_queries"], intents=values.get("legacy_intents", []),
            qrels=legacy_qrels(values["legacy_qrels"]), corpora=[c for c in descriptors if c["cohort"] == "LEGACY"],
            runs=canonical_labels([r for r in runs if r["cohort"] == "LEGACY"]),
            receipts=canonical_labels([r for r in receipts if r["cohort"] == "LEGACY"]),
            resolved_positive_intent_ids=binding["resolved_positive_intent_ids"],
            uncertainty_pairs=[[r["seed"], r["query_id"], r["dataset_id"]] for r in binding["uncertainty_pairs"]])
    evidence = dict(supplementary_validation_passed=False,
                    original_conformance_passed=False, source_base=str(Path(workspace).resolve()),
                    bindings={name[len("binding_"):]: source_binding(refs[name]) for name in refs if name.startswith("binding_")},
                    argument_files={}, input_sha256={}, adapter_source_sha256=sha_bytes(Path(__file__).read_bytes()))
    # Derive factual flags only from bound reports, never turn the failed study green.
    controls = values.get("binding_correctness", {})
    evidence["all_threshold_correctness_passed"] = controls.get("status") == "passed" and controls.get("all_eight_raw_mode_controls_passed") is True
    evidence["correctness_case_ids"] = [label + ":" + name for label, mode in controls.get("modes", {}).items() for name in mode.get("controls", {})]
    evidence["runtime_and_DSL_verified"] = values.get("binding_runtime", {}).get("status") == "passed" and values.get("binding_dsl", {}).get("status") == "passed"
    evidence["native_engine_calibration_passed"] = values.get("geometry_completion", {}).get("native_engine_calibration_passed") is True
    primary_systems = [s["id"] for s in payload["gates"]["registered_systems"]] + [payload["gates"]["diagnostic_ids"]["topk"]]
    normalized = canonical_labels(payload["runs"])
    normalized_receipts = canonical_labels(payload["receipts"])
    qm, _, grades, indexed = analysis._prepare(payload["queries"], payload["qrels"], normalized, payload["corpora"], intents=payload["intents"])
    mixed = [payload["gates"]["diagnostic_ids"][n] for n in ("dataset045_nested050", "dataset050_nested045")]
    expected = {(*key, system) for key in grades for system in primary_systems + mixed}
    evidence["all_repetition_surface_checks_passed"] = not analysis.receipt_problems(normalized_receipts, indexed, expected, payload["gates"])
    evidence["mandatory_branch_diagnostics_complete"] = expected <= set(indexed)
    first_held = [r["request_started_utc"] for r in receipts if r["cohort"] != "NEW" or qm[r["query_id"]]["split"] != "development" or r["system"] in mixed]
    require(first_held, "Actual held event timestamps unavailable")
    evidence.update(first_heldout_event_utc=min(first_held, key=analysis._utc),
        dev_record_sha256_before_heldout=payload["selection"]["record_sha256"],
        diagnostic_policy_sha256_before_embedding=canonical_digest(payload["diagnostic_policy"]))
    preparation = values.get("preparation", {})
    require(preparation.get("started_utc"), "Source-bound preparation start chronology required")
    evidence["first_target_embedding_utc"] = preparation["started_utc"]
    output.mkdir(parents=True)
    # Each consolidated argument is itself typed and hash-bound. Raw hashes and
    # deterministic projection names remain separately reproducible below.
    for name, value in list(payload.items()):
        ref = _write(output / (name + ".json"), value)
        evidence["argument_files"][name] = ref
        evidence["input_sha256"][name] = canonical_digest(value)
    mask = payload["diagnostic_policy"]["uncertainty_pairs"]
    evidence["argument_files"]["uncertainty_pairs"] = _write(output / "uncertainty_pairs.json", mask)
    evidence["input_sha256"]["uncertainty_pairs"] = canonical_digest(mask)
    if payload.get("legacy") is not None:
        legacy = payload["legacy"]
        legacy["bindings"] = {role: source_binding(refs["legacy_binding_" + role]) for role in ("queries", "qrels", "corpora", "uncertainty_mask", "validation")}
        legacy.update(source_base=str(output), argument_files={}, input_sha256={})
        for name in ("queries", "qrels", "runs", "corpora"):
            legacy["argument_files"][name] = _write(output / ("legacy_" + name + ".json"), legacy[name])
            legacy["input_sha256"][name] = canonical_digest(legacy[name])
        # Rewrite is forbidden: legacy's complete bundle is sealed only now.
        # Earlier generic legacy.json is a retained pre-closure intermediate.
        evidence["argument_files"]["legacy"] = _write(output / "legacy_closed.json", legacy)
        evidence["input_sha256"]["legacy"] = canonical_digest(legacy)
    payload["evidence"] = evidence
    manifest = dict(schema_version=1, adapter="threshold_analysis_inputs_v1", created_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        execution_inputs=sources.execution_ref, source_refs=refs, execution_source_files=sources.reads,
        adapter_source_sha256=sha_bytes(Path(__file__).read_bytes()),
        reproduction_inputs=dict(workspace=str(Path(workspace).resolve()), execution_inputs=execution_inputs,
            execution_root=str(root), completion_refs=completion_refs, source_refs=source_refs),
        safe_projections=["identity_v1", "signed_case_identity_v1", "receipt_root_comparison_preserve_original_v1", "corpus_ids_v1", "C_branch_fact_quote_join_v1", "legacy_qrels_v1", "explicit_topk_label_v1"],
        outputs={name: ref for name, ref in evidence["argument_files"].items()},
        no_new_metrics=True, no_service_calls=True, original_conformance_passed=False, promotion_allowed=False, forced_recommendation="D")
    _write(output / "source_transforms.json", manifest)
    _write(output / "real_observations.json", real)
    return _write(output / "inputs.json", payload)


def verify_source_transforms(ref, expected_adapter_sha256, base=Path(".")):
    """Check adapter source pin and every explicit raw/projected byte source."""
    manifest, _ = read_bound(ref, base)
    require(manifest.get("adapter_source_sha256") == expected_adapter_sha256 == sha_bytes(Path(__file__).read_bytes()), "Projection adapter source pin differs")
    allowed = {"identity_v1", "signed_case_identity_v1", "receipt_root_comparison_preserve_original_v1", "corpus_ids_v1", "C_branch_fact_quote_join_v1", "legacy_qrels_v1", "explicit_topk_label_v1"}
    require(set(manifest["safe_projections"]) == allowed, "Unregistered source projection")
    for source in [manifest["execution_inputs"], *manifest["source_refs"].values(), *manifest["execution_source_files"], *manifest["outputs"].values()]:
        read_bound(source, base)
    return manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True, help="Explicit source-bound adapter arguments")
    args = parser.parse_args(argv)
    print(json.dumps(prepare_inputs(**json.loads(Path(args.config).read_text())), sort_keys=True))


if __name__ == "__main__":
    main()
