#!/usr/bin/env python3
"""Gate-checked synthetic adapter for the existing #3902 local replay harness.

No generation, labels, metric implementation or handwritten baseline DSL lives
here. Every operational command requires main's hash-bound execution approval.
"""
import argparse
import importlib.util
import json
import pathlib
import subprocess
from types import SimpleNamespace

ROOT = pathlib.Path(__file__).resolve().parent
REPO = ROOT.parent.parent


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


replay = module("synthetic_replay", ROOT.parent / "run.py")
freeze_tool = module("synthetic_freeze", ROOT / "freeze.py")
BASELINE = "ba18156201c50565c85c62f76469245925994ece"
IMAGE_DIGEST = "7faca54ae24ce1c03d4213d3a3c2109ff57b23c644e4d22523e1c861201fb6ec"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def document(path):
    return json.loads(pathlib.Path(path).read_text(encoding="utf8"))


def bound_file(root, name, expected):
    root = pathlib.Path(root).resolve()
    require(not pathlib.Path(name).is_absolute(), "Manifest paths must be document-root relative")
    path = (root / name).resolve()
    require(path.is_relative_to(root), "Manifest path escapes its document root")
    require(path.is_file(), "Missing frozen file: " + str(path))
    require(replay.sha(path) == expected, "Hash mismatch: " + str(path))
    return path


def production_sources(approval, document_root, repo_root=REPO):
    """Bind actual checked-out builder/mapping/config bytes, not a caller label."""
    digest = approval.get("production_source_manifest_sha256")
    require(isinstance(digest, str) and len(digest) == 64,
            "Synthetic execution requires a pinned production source manifest hash")
    path = bound_file(document_root, "production-baseline-source.json", digest)
    manifest = document(path)
    require(manifest.get("baseline_commit") == BASELINE, "Production source manifest baseline differs")
    hashes = manifest.get("sha256")
    require(isinstance(hashes, dict) and bool(hashes), "Empty production source manifest")
    for name, expected in hashes.items():
        bound_file(repo_root, name, expected)
    return {"manifest_sha256": digest, "baseline_commit": BASELINE, "verified_file_count": len(hashes)}


def gate(freeze_path, validation_path, approval_path):
    """No network/subprocess calls; validate all preregistered execution inputs."""
    freeze_path, validation_path, approval_path = map(pathlib.Path, (freeze_path, validation_path, approval_path))
    freeze = freeze_tool.verify(freeze_path.parent, freeze_path)
    validation, approval = map(document, (validation_path, approval_path))
    require(approval.get("execution_allowed") is True and approval.get("approved_by") == "parent-agent",
            "Explicit parent execution approval required")
    require(approval.get("spec_freeze_sha256") == replay.sha(freeze_path), "Approval references another freeze")
    require(approval.get("validation_manifest_sha256") == replay.sha(validation_path), "Approval references another validation")
    source_provenance = production_sources(approval, freeze_path.parent)
    require(validation.get("status") == "passed" and validation.get("independent_validation") is True
            and validation.get("pre_retrieval") is True, "Independent pre-retrieval validation must pass")
    require(validation.get("spec_freeze_sha256") == replay.sha(freeze_path), "Validation references another freeze")
    require(validation.get("unsupported_grade3_count") == 0 and validation.get("missing_positive_queries") == []
            and validation.get("exact_targets_missing") == [], "Validation has unresolved coverage/label failures")
    require(all(corpus.get("answerability_passed") is True for corpus in validation.get("corpora", [])),
            "Every 180-record corpus must pass answerability")
    return artifact_state(freeze_path, validation_path, approval_path, freeze, validation, source_provenance)


def artifact_state(freeze_path, validation_path, approval_path, freeze, validation, source_provenance):
    """Shared byte/shape checks only; callers separately enforce their study gate."""
    files = {name: freeze_path.parent / name for name in freeze["spec_sha256"]}
    require("generation-spec.json" in files and "query-spec.jsonl" in files, "Missing frozen generation/query specification")
    queries = files["query-spec.jsonl"]
    require(validation.get("query_spec_sha256") == replay.sha(queries), "Validation query hash mismatch")
    qrels = bound_file(validation_path.parent, validation["qrels_path"], validation["qrels_sha256"])
    bound_file(validation_path.parent, validation["validation_evidence_path"], validation["validation_evidence_sha256"])
    generation = document(files["generation-spec.json"])
    system_names(generation)
    require(generation["embedding"]["image_digest"] == "sha256:" + IMAGE_DIGEST
            and generation["embedding"]["dimension"] == 768, "Unexpected frozen embedding model")
    require(generation["runtime"]["source_main_base"] == BASELINE
            and generation["runtime"]["opensearch_version"] == "2.19.1", "Unexpected frozen baseline/engine")
    require("decision-gates.json" in files, "Missing frozen execution settings")
    decisions = document(files["decision-gates.json"])
    settings = {"repetitions": decisions["latency"]["measured_repetitions_per_query_system_seed"],
                "warmup": decisions["latency"]["warmup_repetitions_per_query_system_seed"],
                "depth": decisions["correctness"]["primary_depth"]}
    require(settings == {"repetitions": 5, "depth": 10, "warmup": 1},
            "Frozen execution must specify depth10, five measured repetitions and one warmup")
    require(decisions["correctness"]["primary_mode"] == {"name": "radial", "minScore": .5},
            "Primary benchmark requires production radial minScore0.5")
    corpora = validation.get("corpora", [])
    require(len(corpora) == 3 and len({c["seed"] for c in corpora}) == 3, "Require three independently seeded corpora")
    require({c["seed"] for c in corpora} == set(generation["seeds"]), "Validated seeds differ from frozen seeds")
    for corpus in corpora:
        require(corpus.get("dataset_count") == 180, "Every corpus must contain 180 records")
        corpus["resolved_path"] = bound_file(validation_path.parent, corpus["path"], corpus["sha256"])
        rows = replay.load_jsonl(corpus["resolved_path"])
        ids = [row["identifier"] for row in rows]
        require(len(ids) == 180 and len(set(ids)) == 180
                and set(ids) == set(freeze["design_summary"]["record_ids"]), "Corpus identifiers/count mismatch")
        import hashlib
        canonical_ids = hashlib.sha256(json.dumps(sorted(ids), separators=(",", ":")).encode()).hexdigest()
        require(corpus.get("record_ids_sha256") == canonical_ids, "Canonical corpus identifier hash mismatch")
    return {"freeze": freeze, "generation": generation, "production_sources": source_provenance,
            "execution": settings, "corpora": corpora, "queries": queries,
            "qrels": qrels, "freeze_sha256": replay.sha(freeze_path),
            "validation_sha256": replay.sha(validation_path), "approval_sha256": replay.sha(approval_path)}


def diagnostic_labels(generation, queries, expected_rows, validated_rows, mask_rows):
    """Check explicit uncertainty coverage; never derive labels or convert to zero."""
    seeds = set(generation["seeds"])
    ids = {row["id"] for row in generation["record_plans"]}
    query_intents = {row["id"]: row["intent_id"] for row in queries}
    intent_queries = {}
    for qid, intent in query_intents.items():
        intent_queries.setdefault(intent, []).append(qid)
    expected_pairs = {(qid, identifier) for qid in query_intents for identifier in ids}
    seen = set()
    for row in expected_rows:
        pair = row["query_id"], row["dataset_id"]
        require(pair in expected_pairs and pair not in seen, "Invalid/duplicate frozen proposed qrel")
        require(type(row.get("grade")) is int and row["grade"] == generation["intent_doc_grades"][query_intents[pair[0]]][pair[1]],
                "Proposed qrels differ from the frozen grade matrix")
        seen.add(pair)
    require(seen == expected_pairs, "Incomplete frozen proposed qrels")
    mask_units, unknown_pairs = set(), set()
    for row in mask_rows:
        unit = row["seed"], row["intent_id"], row["dataset_id"]
        require(type(unit[0]) is int and unit[0] in seeds and unit[1] in intent_queries and unit[2] in ids and unit not in mask_units,
                "Invalid/duplicate diagnostic uncertainty unit")
        require(isinstance(row.get("reason"), str) and bool(row["reason"].strip()), "Uncertainty requires an explicit independent reason")
        mask_units.add(unit)
        unknown_pairs.update((unit[0], qid, unit[2]) for qid in intent_queries[unit[1]])
    require(bool(mask_units), "Incomplete diagnostic validation requires an explicit nonempty U mask")
    all_pairs = {(seed, qid, identifier) for seed in seeds for qid, identifier in expected_pairs}
    seen, actual_unknown = set(), set()
    for row in validated_rows:
        pair = row["seed"], row["query_id"], row["dataset_id"]
        require(type(pair[0]) is int and pair in all_pairs and pair not in seen, "Invalid/duplicate independently validated qrel")
        grade = row.get("grade")
        if grade == "U":
            require(pair in unknown_pairs, "U qrel is not explicitly covered by the uncertainty mask")
            actual_unknown.add(pair)
        else:
            require(pair not in unknown_pairs, "Uncertainty-mask pair was coerced to a known grade")
            require(type(grade) is int and grade in (0, 1, 2, 3)
                    and grade == generation["intent_doc_grades"][query_intents[pair[1]]][pair[2]],
                    "Known independently derived qrel differs from frozen design truth")
        seen.add(pair)
    require(seen == all_pairs and actual_unknown == unknown_pairs, "Incomplete independently validated coverage or non-exact U-mask expansion")
    return {"validated_query_document_pairs": len(seen), "known_query_document_pairs": len(seen) - len(actual_unknown),
            "unknown_query_document_pairs": len(actual_unknown), "uncertainty_units": len(mask_units)}


def diagnostic_gate(freeze_path, validation_path, approval_path, policy_path):
    """Separate nonpromotional gate; strict validation remains failed, never faked."""
    import datetime
    freeze_path, validation_path, approval_path, policy_path = map(pathlib.Path, (freeze_path, validation_path, approval_path, policy_path))
    freeze = freeze_tool.verify(freeze_path.parent, freeze_path)
    validation, approval, policy = map(document, (validation_path, approval_path, policy_path))
    require(approval.get("execution_allowed") is True and approval.get("approved_by") == "parent-agent"
            and approval.get("diagnostic_only") is True and approval.get("promotion_allowed") is False,
            "Explicit parent approval for nonpromotional diagnostic execution required")
    require(approval.get("spec_freeze_sha256") == replay.sha(freeze_path)
            and approval.get("diagnostic_validation_sha256") == replay.sha(validation_path)
            and approval.get("diagnostic_policy_sha256") == replay.sha(policy_path), "Diagnostic approval hash mismatch")
    sources = production_sources(approval, freeze_path.parent)
    probe_digest = approval.get("supplementary_probe_spec_sha256")
    require(isinstance(probe_digest, str) and len(probe_digest) == 64, "Diagnostic replay requires a supplementary probe specification hash")
    bound_file(freeze_path.parent, "quality-spatial-probe-spec.json", probe_digest)
    require(validation.get("status") == "incomplete_diagnostic_only"
            and validation.get("independent_validation") is True and validation.get("pre_retrieval") is True
            and validation.get("full_validation_passed") is False and validation.get("promotion_allowed") is False
            and validation.get("forced_recommendation") == "C", "Diagnostic document must truthfully retain failed full validation and force C")
    require(type(validation.get("manual_record_reviews")) is int and validation["manual_record_reviews"] == 540
            and type(validation.get("query_equivalence_reviews")) is int and validation["query_equivalence_reviews"] == 75
            and validation.get("known_qrels_match_frozen") is True, "Complete independent record/query reviews and known-pair agreement required")
    require(validation.get("spec_freeze_sha256") == replay.sha(freeze_path), "Diagnostic validation references another freeze")
    require(policy.get("mode") == "supplementary_nonpromotional" and policy.get("pre_retrieval") is True
            and policy.get("no_outcomes_seen") is True and policy.get("recommendation") == "C"
            and policy.get("promotion_allowed") is False, "Diagnostic policy cannot permit promotion or post-outcome tuning")
    require(policy.get("spec_freeze_sha256") == replay.sha(freeze_path)
            and policy.get("validation_manifest_sha256") == replay.sha(validation_path)
            and policy.get("uncertainty_mask_sha256") == validation.get("uncertainty_mask_sha256"), "Diagnostic policy artifact hash mismatch")
    require(isinstance(policy.get("created_utc"), str), "Diagnostic pre-outcome policy timestamp required")
    timestamp = datetime.datetime.fromisoformat(policy["created_utc"].replace("Z", "+00:00"))
    require(timestamp.tzinfo is not None and timestamp.utcoffset() == datetime.timedelta(0), "Diagnostic policy timestamp must be UTC")
    state = artifact_state(freeze_path, validation_path, approval_path, freeze, validation, sources)
    validated = bound_file(validation_path.parent, validation["validated_qrels_path"], validation["validated_qrels_sha256"])
    mask = bound_file(validation_path.parent, validation["uncertainty_mask_path"], validation["uncertainty_mask_sha256"])
    coverage = diagnostic_labels(state["generation"], replay.load_jsonl(state["queries"]), replay.load_jsonl(state["qrels"]),
                                 replay.load_jsonl(validated), replay.load_jsonl(mask))
    require(coverage["validated_query_document_pairs"] == 40500, "Diagnostic replay requires full 40500-pair coverage")
    state.update(expected_qrels=state["qrels"], qrels=validated, uncertainty_mask=mask)
    state["diagnostic_metadata"] = {"diagnostic_only": True, "promotion_allowed": False, "forced_recommendation": "C",
        "full_validation_passed": False, "diagnostic_policy_sha256": replay.sha(policy_path),
        "diagnostic_validation_sha256": replay.sha(validation_path), "uncertainty_mask_sha256": replay.sha(mask),
        "validated_qrels_sha256": replay.sha(validated), "policy_created_utc": policy["created_utc"], **coverage}
    return state


def execution_gate(args):
    requested = getattr(args, "allow_incomplete_diagnostic_replay", False)
    policy = getattr(args, "diagnostic_policy", None)
    require(bool(requested) == bool(policy), "Diagnostic replay requires both explicit opt-in flag and policy")
    if requested:
        return diagnostic_gate(args.freeze, args.validation, args.approval, policy)
    return gate(args.freeze, args.validation, args.approval)


def system_names(generation):
    values = generation["systems"]
    if isinstance(values, dict):
        values = list(values)
    elif values and isinstance(values[0], dict):
        values = [value["id"] for value in values]
    names = replay.selected_systems(values)
    require(set(names) == set(replay.SYSTEMS + replay.EXTRA_SYSTEMS), "Synthetic comparison requires all eight frozen systems")
    if isinstance(generation["systems"], list) and isinstance(generation["systems"][0], dict):
        for system in generation["systems"]:
            require(system.get("weights") == replay.WEIGHTS.get(system["id"]), "Frozen weights differ from registered implementation")
    return names


def write_document(path, value):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf8") as stream:
        json.dump(value, stream, indent=2, sort_keys=True)
        stream.write("\n")


def execution_identity(state):
    return {"spec_freeze_sha256": state["freeze_sha256"], "validation_manifest_sha256": state["validation_sha256"],
            "approval_sha256": state["approval_sha256"], **state.get("diagnostic_metadata", {})}


def identity_receipt(path, state):
    payload = execution_identity(state)
    path = pathlib.Path(path)
    if path.exists():
        require(document(path) == payload, "Execution identity/mode changed for an existing artifact")
    else:
        write_document(path, payload)


def artifact_paths(args, seed):
    root = pathlib.Path(args.artifact_root) / str(seed)
    return {name: root / filename for name, filename in {
        "corpus": "embedded-corpus.jsonl", "queries": "embedded-queries.jsonl",
        "requests": "baseline-requests.jsonl", "mapping": "mapping.json",
        "config": "search-config.json", "runs": "runs.jsonl", "raw": "response-ledger.jsonl"}.items()}


def prepare(args, state):
    """Complete ALL embedding work before the run command can measure latency."""
    receipt = pathlib.Path(args.artifact_root) / "preparation.json"
    require(not receipt.exists(), "Preparation already complete; use a new artifact root")
    cache = pathlib.Path(args.cache)
    identity_path = cache / "embedding-cache-identity.json"
    expected_model = state["generation"]["embedding"]["model"]
    identity = {"image_digest": "sha256:" + IMAGE_DIGEST, "dimension": 768,
                "model": expected_model}
    if identity_path.exists():
        require(document(identity_path) == identity, "Embedding cache belongs to another model")
    else:
        require(not cache.exists() or not any(cache.iterdir()), "Unidentified nonempty embedding cache rejected")
        write_document(identity_path, identity)
    completed = []
    for corpus in sorted(state["corpora"], key=lambda value: value["seed"]):
        paths = artifact_paths(args, corpus["seed"])
        require(not paths["corpus"].exists() and not paths["queries"].exists(), "Do not overwrite prepared vectors")
        replay.prepare(SimpleNamespace(corpus=corpus["resolved_path"], queries=state["queries"],
            embedding_url=args.embedding_url, cache=args.cache, batch_size=8, expected_model=expected_model,
            output_corpus=paths["corpus"], output_queries=paths["queries"]))
        dimensions = {len(row["vector"]) for row in replay.load_jsonl(paths["queries"])}
        require(dimensions == {768}, "Frozen GTE model must produce 768 dimensions")
        completed.append({"seed": corpus["seed"], "corpus_sha256": replay.sha(paths["corpus"]),
                          "queries_sha256": replay.sha(paths["queries"])})
    write_document(receipt, {**execution_identity(state),
        "all_embedding_jobs_complete": True, "image_digest": IMAGE_DIGEST, "corpora": completed})


def exporter_command(args, paths, index, top_k=False, dimension=None, regions_index=None):
    options = ["--input", str(paths["queries"].resolve()), "--output", str(paths["requests"].resolve()),
        "--index", index, "--mapping-output", str(paths["mapping"].resolve()),
        "--config-output", str(paths["config"].resolve()), "--baseline-commit", BASELINE]
    if top_k:
        options += ["--k", "1"]
    if dimension is not None:
        options += ["--dimension", str(dimension)]
    if regions_index is not None:
        options += ["--regions-index", replay.owned(regions_index)]
    # No --regions-endpoint: that invokes a read-only region search. This benchmark
    # explicitly records disabled geographic augmentation in every exported row.
    import shlex
    return [args.sbt, 'set searchApi / Test / unmanagedSourceDirectories += (ThisBuild / baseDirectory).value / "search-relevance-eval/scala"',
            "searchApi/Test/runMain au.csiro.data61.magda.search.eval.ExportBaselineRequests " + shlex.join(options)]


def run(args, state):
    receipt_path = pathlib.Path(args.artifact_root) / "preparation.json"
    receipt = document(receipt_path)
    require(receipt.get("all_embedding_jobs_complete") is True and receipt.get("spec_freeze_sha256") == state["freeze_sha256"]
            and receipt.get("validation_manifest_sha256") == state["validation_sha256"], "Prepare all frozen seeds before latency")
    require({c["seed"] for c in receipt["corpora"]} == {c["seed"] for c in state["corpora"]}, "Incomplete embedding receipt")
    require(bool(receipt.get("diagnostic_only")) == bool(state.get("diagnostic_metadata")), "Preparation/replay diagnostic mode differs")
    require(all(receipt.get(key) == value for key, value in state.get("diagnostic_metadata", {}).items()),
            "Preparation/replay diagnostic policy or uncertainty changed")
    systems = system_names(state["generation"])
    # Verify all vectors BEFORE installing/searching even the first seed.
    for corpus in receipt["corpora"]:
        paths = artifact_paths(args, corpus["seed"])
        require(replay.sha(paths["corpus"]) == corpus["corpus_sha256"] and replay.sha(paths["queries"]) == corpus["queries_sha256"],
                "Prepared vector artifact changed")
    require(args.allow_local_writes, "Explicit local-write opt-in required")
    identity_receipt(pathlib.Path(args.artifact_root) / "execution-identity.json", state)
    version = replay.request(args.engine_url, "GET", "/")
    require(version.get("version", {}).get("number") == "2.19.1", "Require pinned OpenSearch 2.19.1")
    for corpus in sorted(state["corpora"], key=lambda value: value["seed"]):
        seed = corpus["seed"]
        index = replay.owned(args.index_prefix + "-" + str(seed))
        paths = artifact_paths(args, seed)
        require(not paths["runs"].exists() and not paths["requests"].exists(), "Never silently rerun/overwrite scored artifacts")
        subprocess.run(exporter_command(args, paths, index), cwd=REPO, check=True)
        exports = replay.load_jsonl(paths["requests"])
        require(all(row.get("baseline_commit") == BASELINE for row in exports), "Unexpected production baseline")
        replay.install(SimpleNamespace(allow_local_writes=True, engine_url=args.engine_url,
            index=index, mapping=paths["mapping"], corpus=paths["corpus"]))
        replay.run(SimpleNamespace(allow_local_writes=True, engine_url=args.engine_url,
            index=index, requests=paths["requests"], corpus=corpus["resolved_path"], output=str(paths["runs"]),
            depth=state["execution"]["depth"], repetitions=state["execution"]["repetitions"],
            systems=systems, raw_output=paths["raw"], seed=seed))


def controls(args, state):
    """Reuse the existing real-engine 20-check suite; never emulate real OPA."""
    require(args.allow_local_writes, "Explicit local-write opt-in required")
    output = pathlib.Path(args.output)
    require(not output.exists(), "Do not overwrite correctness evidence")
    if state.get("diagnostic_metadata"):
        identity_receipt(str(output) + ".execution-identity.json", state)
    smoke = ROOT.parent / "scala" / "smoke"
    paths = {"queries": smoke / "tasks.jsonl", "requests": smoke / "baseline.jsonl", "mapping": smoke / "mapping.json"}
    if args.top_k:
        root = output.parent / (output.stem + "-export")
        root.mkdir(parents=True, exist_ok=False)
        paths.update(requests=root / "baseline.jsonl", mapping=root / "mapping.json", config=root / "config.json")
        subprocess.run(exporter_command(args, paths, "magda-relevance-eval-synthetic3903-topk-controls", top_k=True, dimension=3),
                       cwd=REPO, check=True)
    verifier = module("synthetic_existing_controls", ROOT.parent / "verify.py")
    # Radial assertions deliberately remain unchanged for the feasibility attempt.
    # If k=1 changes fixture inclusion, verify writes the failed report and raises;
    # report that as secondary top-k infeasibility, never weaken radial assertions.
    original_systems, original_formats = verifier.SYSTEMS, verifier.FORMAT_SYSTEMS
    try:
        verifier.SYSTEMS = system_names(state["generation"])
        verifier.FORMAT_SYSTEMS = tuple(system for system in verifier.SYSTEMS if system not in ("keyword", "vector"))
        return verifier.verify(SimpleNamespace(allow_local_writes=True, engine_url=args.engine_url,
            baseline_requests=paths["requests"], mapping=paths["mapping"], output=output))
    finally:
        verifier.SYSTEMS, verifier.FORMAT_SYSTEMS = original_systems, original_formats


def probe_score_checks(spec, responses):
    """Fixed arithmetic checks for supplementary fixtures, not relevance metrics."""
    import math
    plan = spec["dataset_plan"]
    identifiers = {"probe-" + place + "-q" + str(i): (place, quality)
                   for place in plan["geographies"] for i, quality in enumerate(plan["qualities"])}
    checks = {}
    for variant in spec["query_variants"]:
        qid = variant["id"]
        maps = {}
        for system, response in responses[qid].items():
            rows = response["hits"]["hits"]
            ids = [row["_id"] for row in rows]
            require(len(ids) == len(identifiers) and set(ids) == set(identifiers), "Probe result inclusion/duplicates failure")
            total = response["hits"].get("total")
            require(total == len(identifiers) or total == {"value": len(identifiers), "relation": "eq"}, "Probe total-hit count mismatch")
            require(not response.get("timed_out") and not response.get("_shards", {}).get("failed"), "Incomplete probe response")
            maps[system] = {row["_id"]: row["_score"] for row in rows}
            require(all(isinstance(score, (int, float)) and math.isfinite(score) for score in maps[system].values()), "Invalid probe score")
        require(set(maps) == set(spec["systems"]), "Missing supplementary system response")
        ratios = {}
        for system in ("baseline", "raw_boost1", "keyword", "vector"):
            groups = {}
            for identifier, (place, quality) in identifiers.items():
                region_weight = 1 if variant["boost_regions"] and place == "inside" else 0
                group = place if variant["boost_regions"] else "all"
                groups.setdefault(group, []).append(maps[system][identifier] / (1 + quality + region_weight))
            for group, values in groups.items():
                require(values[0] > 0 and all(math.isclose(value, values[0], rel_tol=1e-5, abs_tol=1e-5) for value in values),
                        "Production quality/spatial multiplier ratio failed: " + qid + "/" + system + "/" + group)
            ratios[system] = groups
        for system in replay.WEIGHTS:
            require(all(-1e-5 <= score <= 1 + 1e-5 for score in maps[system].values()), "Candidate probe scores not normalized")
        predicted = {}
        for system in ("candidate_03_07", "candidate_05_05", "candidate_07_03"):
            predicted[system] = {}
            for identifier in identifiers:
                score = 0
                for family, weight in zip(("keyword", "vector"), replay.WEIGHTS[system]):
                    low, high = min(maps[family].values()), max(maps[family].values())
                    require(high > low, "Probe family has degenerate normalization range")
                    # OpenSearch's MIN_SCORE floor is evidenced in the retained
                    # #3901 control scores (0.9001/0.1009), not fitted to this probe.
                    score += weight * max(.001, (maps[family][identifier] - low) / (high - low))
                residual = maps[system][identifier] - score
                require(math.isclose(residual, 0, rel_tol=1e-5, abs_tol=1e-5), "Pre-normalization family placement mismatch")
                predicted[system][identifier] = {"expected": score, "actual": maps[system][identifier], "residual": residual}
        checks[qid] = {"status": "passed", "raw_multiplier_base_scores": ratios, "normalized_fusion": predicted}
    return checks


def quality_spatial_probe(args, state):
    """Actual exporter/engine fixture, gated separately from benchmark queries."""
    import urllib.parse
    import uuid
    require(args.allow_local_writes, "Explicit local-write opt-in required")
    spec_path = pathlib.Path(args.probe_spec)
    spec = document(spec_path)
    approval = document(args.approval)
    require(approval.get("supplementary_probe_spec_sha256") == replay.sha(spec_path),
            "Supplementary quality/spatial probe requires its own parent-approved specification hash")
    require(spec["phase"] == "supplementary_correctness_preregistered_before_probe_execution"
            and spec["primary_benchmark_queries_or_labels_changed"] is False, "Invalid supplementary probe boundary")
    require(tuple(spec["systems"]) == system_names(state["generation"]), "Probe systems differ from frozen comparison")
    version = replay.request(args.engine_url, "GET", "/")
    require(version.get("version", {}).get("number") == spec["engine"].split()[-1], "Probe requires pinned OpenSearch version")
    output = pathlib.Path(args.output)
    require(not output.exists(), "Do not overwrite probe evidence")
    root = output.parent / (output.stem + "-artifacts")
    root.mkdir(parents=True, exist_ok=False)
    stem = replay.owned("magda-relevance-eval-quality-spatial-" + str(uuid.uuid4()))
    index, region_index = replay.owned(stem + "-datasets"), replay.owned(stem + "-regions")
    paths = {name: root / filename for name, filename in {
        "queries": "tasks.jsonl", "requests": "baseline.jsonl", "mapping": "mapping.json", "config": "config.json"}.items()}
    tasks = [dict(variant, query=spec["query"], vector=spec["query_vector"]) for variant in spec["query_variants"]]
    replay.write_jsonl(paths["queries"], tasks)
    subprocess.run(exporter_command(args, paths, index, dimension=spec["dimension"], regions_index=region_index), cwd=REPO, check=True)
    exports = replay.load_jsonl(paths["requests"])
    verifier = module("synthetic_existing_probe_helpers", ROOT.parent / "verify.py")
    plan = spec["dataset_plan"]
    docs = []
    for place, geometry in plan["geographies"].items():
        for i, quality in enumerate(plan["qualities"]):
            doc = verifier.dataset("probe-" + place + "-q" + str(i), title=plan["constant_title"],
                                   description=plan["constant_description"], vector=spec["dataset_vector"])
            doc.update(quality=quality, hasQuality=True, publisher={"name": plan["constant_publisher"]}, spatial={"geoJson": geometry})
            docs.append(doc)
    paths["corpus"] = root / "corpus.jsonl"
    replay.write_jsonl(paths["corpus"], docs)
    report = {"status": "running", "scope": "supplementary fixed correctness, NOT relevance or latency",
        "probe_spec_sha256": replay.sha(spec_path), "spec_freeze_sha256": state["freeze_sha256"],
        "validation_manifest_sha256": state["validation_sha256"], "resources": [], "responses": [], "structural_checks": {},
        **state.get("diagnostic_metadata", {})}
    created, responses, failure, executed_requests = [], {}, None, []

    def create(path, payload, name):
        replay.owned(name)
        resource = {"name": name, "path": path, "cleanup": "not_needed", "created": False}
        report["resources"].append(resource)
        result = replay.request(args.engine_url, "PUT", path, payload)
        require(result.get("acknowledged") is True, "Probe resource not acknowledged")
        resource.update(created=True, cleanup="pending")
        created.append(resource)

    try:
        create("/" + region_index, spec["region"]["mapping"], region_index)
        region_id = urllib.parse.quote(spec["region"]["indexed_document_id"], safe="")
        replay.request(args.engine_url, "PUT", "/" + region_index + "/_doc/" + region_id + "?refresh=true",
                       {"geometry": spec["region"]["geometry"]})
        create("/" + index, document(paths["mapping"]), index)
        lines = []
        for doc in docs:
            lines.extend([json.dumps({"index": {"_id": doc["identifier"]}}), json.dumps(doc)])
        bulk = replay.request(args.engine_url, "POST", "/" + index + "/_bulk?refresh=true", "\n".join(lines) + "\n", "application/x-ndjson")
        require(not bulk.get("errors"), "Supplementary fixture indexing failed")
        pipelines = {}
        for system in spec["systems"]:
            if system in replay.WEIGHTS or system in ("baseline", "raw_boost1"):
                name = replay.owned(stem + "-" + system.replace("_", "-"))
                create("/_search/pipeline/" + name, replay.pipeline_body(replay.WEIGHTS.get(system, [.3, .7])), name)
                pipelines[system] = name
        for exported, task in zip(exports, tasks):
            qid = exported["query_id"]
            require(qid == task["id"] and exported["boost_regions_index"] == region_index, "Unexpected supplementary export provenance")
            body = exported["request"]["body"]
            root_scorers = verifier.nodes(body["query"], "function_score")
            require(len(root_scorers) == 1, "Unexpected production root score structure")
            functions = root_scorers[0]["functions"]
            require(root_scorers[0].get("score_mode") == "sum" and len(functions) == (3 if task["boost_regions"] else 2),
                    "Production quality/spatial score functions differ from preregistration")
            factors = verifier.nodes(functions, "field_value_factor")
            require(len(factors) == 1 and factors[0].get("field") == "quality" and factors[0].get("missing") == 1,
                    "Production quality factor missing")
            quality_terms = [term["hasQuality"] for term in verifier.nodes(functions, "term") if "hasQuality" in term]
            require(functions[0].get("weight") == 1 and len(quality_terms) == 1
                    and (quality_terms[0].get("value") if isinstance(quality_terms[0], dict) else quality_terms[0]) is True,
                    "Production base weight or hasQuality filter differs")
            require(not task["boost_regions"] or functions[-1].get("weight") == 1,
                    "Production region function weight differs")
            knn_payloads = [payload for knn in verifier.nodes(body["query"], "knn") for payload in knn.values()]
            require(knn_payloads and all(payload.get("min_score") == .5 and "k" not in payload for payload in knn_payloads),
                    "Supplementary probe must retain production radial minScore mode")
            references = verifier.nodes(body["query"], "indexed_shape")
            expected_reference = {"index": region_index, "id": spec["region"]["indexed_document_id"], "path": "geometry"}
            require(bool(references) == bool(task["boost_regions"]) and all(ref == expected_reference for ref in references),
                    "Production geometry scorer must reference only the owned fixed region")
            responses[qid] = {}
            report["structural_checks"][qid] = {"functions": functions, "indexed_shape_references": references, "systems": {}}
            for system in spec["systems"]:
                current = replay.experimental(body, system)
                scorers = verifier.nodes(current["query"], "function_score")
                require(len(scorers) == (2 if system.startswith("candidate") else 1)
                        and all(scorer["functions"] == functions and scorer.get("score_mode") == "sum" for scorer in scorers),
                        "Quality/spatial functions not retained before family normalization")
                current["size"] = 10
                pipeline = pipelines.get(system)
                path = "/" + index + "/_search" + ("?search_pipeline=" + pipeline if pipeline else "")
                executed_requests.append({"query_id": qid, "system": system, "body": current, "path": path, "pipeline": pipeline})
                response = replay.request(args.engine_url, "POST", path, current)
                responses[qid][system] = response
                report["responses"].append(replay.response_receipt(response, query_id=qid, system=system,
                    request_sha256=__import__("hashlib").sha256(json.dumps(current, sort_keys=True).encode()).hexdigest()))
                facet = response["aggregations"]["Publisher-global"]["filter"]
                buckets = facet["terms-other-options"]["buckets"]
                require(facet["doc_count"] == 6 and len(buckets) == 1 and buckets[0]["doc_count"] == 6,
                        "Supplementary publisher facet count mismatch")
                report["structural_checks"][qid]["systems"][system] = {"function_score_count": len(scorers), "functions_unchanged": True,
                    "publisher_facet_root_count": facet["doc_count"]}
        require(len(exports) == len(tasks), "Supplementary exporter count mismatch")
        report["score_checks"] = probe_score_checks(spec, responses)
        report["status"] = "passed"
    except Exception as error:
        failure = error
        report.update(status="failed", error=type(error).__name__ + ": " + str(error))
    finally:
        for resource in reversed(created):
            try:
                result = replay.request(args.engine_url, "DELETE", resource["path"])
                require(result.get("acknowledged") is True, "Probe cleanup not acknowledged")
                resource["cleanup"] = "deleted"
            except Exception as error:
                resource.update(cleanup="failed", cleanup_error=str(error))
                report["status"] = "failed"
                if failure is None:
                    failure = error
        paths["executed_requests"] = root / "executed-requests.jsonl"
        replay.write_jsonl(paths["executed_requests"], executed_requests)
        report["artifacts"] = {name + "_sha256": replay.sha(path) for name, path in paths.items()}
        write_document(output, report)
    if failure is not None:
        raise failure
    return report


def analyze_tokens(args, state):
    """Actual field analyzers only, after the same explicit execution gate."""
    replay.owned(args.index)
    require(not pathlib.Path(args.output).exists(), "Do not overwrite analyzer evidence")
    if state.get("diagnostic_metadata"):
        identity_receipt(str(args.output) + ".execution-identity.json", state)
    queries = replay.load_jsonl(state["queries"])
    mapping = replay.request(args.engine_url, "GET", "/" + args.index + "/_mapping")
    properties = mapping[args.index]["mappings"]["properties"]
    fields = {}
    for prefix, props in (("", properties), ("distributions.", properties["distributions"]["properties"])):
        for name in ("title", "description", "keywords"):
            definition = props.get(name, {})
            if definition.get("type") != "text":
                continue
            fields[prefix + name] = definition
            if definition.get("fields", {}).get("quote", {}).get("type") == "text":
                fields[prefix + name + ".quote"] = definition["fields"]["quote"]
    rows = []
    for query in queries:
        if query.get("kind") != "exact" and not query.get("authoritative_target_ids"):
            continue
        for field, definition in fields.items():
            modes = [("index_field", {"field": field})]
            if definition.get("search_analyzer"):
                modes.append(("search_analyzer", {"analyzer": definition["search_analyzer"]}))
            for mode, selector in modes:
                response = replay.request(args.engine_url, "POST", "/" + args.index + "/_analyze",
                                          dict(selector, text=query["query"], explain=True))
                rows.append({"query_id": query["id"], "text": query["query"], "field": field,
                             "mode": mode, "selector": selector, "response": response})
    replay.write_jsonl(args.output, rows)


def parser():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ("freeze", "validation", "approval"):
        p.add_argument("--" + name, required=True)
    p.add_argument("--diagnostic-policy", help="Separately approved forced-C supplementary policy; never a strict-gate bypass")
    p.add_argument("--allow-incomplete-diagnostic-replay", action="store_true",
                   help="Explicit nonpromotional replay with independently documented U labels; requires --diagnostic-policy")
    sub = p.add_subparsers(dest="command", required=True)
    sub.add_parser("check-gate")
    prep = sub.add_parser("prepare")
    prep.add_argument("--artifact-root", required=True)
    prep.add_argument("--embedding-url", type=replay.local_url, required=True)
    prep.add_argument("--cache", required=True, help="Dedicated cache for the frozen image digest only")
    execute = sub.add_parser("run")
    execute.add_argument("--artifact-root", required=True)
    execute.add_argument("--engine-url", type=replay.local_url, required=True)
    execute.add_argument("--index-prefix", default="magda-relevance-eval-synthetic3903")
    execute.add_argument("--sbt", default="/tmp/magda-3886-tools/bin/sbt")
    execute.add_argument("--allow-local-writes", action="store_true")
    checks = sub.add_parser("controls")
    checks.add_argument("--engine-url", type=replay.local_url, required=True)
    checks.add_argument("--output", required=True)
    checks.add_argument("--top-k", action="store_true", help="Secondary feasibility only: actual exporter --k 1")
    checks.add_argument("--sbt", default="/tmp/magda-3886-tools/bin/sbt")
    checks.add_argument("--allow-local-writes", action="store_true")
    probe = sub.add_parser("quality-spatial-probe")
    probe.add_argument("--engine-url", type=replay.local_url, required=True)
    probe.add_argument("--output", required=True)
    probe.add_argument("--probe-spec", default=str(ROOT / "quality-spatial-probe-spec.json"))
    probe.add_argument("--sbt", default="/tmp/magda-3886-tools/bin/sbt")
    probe.add_argument("--allow-local-writes", action="store_true")
    tokens = sub.add_parser("analyzer-tokens")
    tokens.add_argument("--engine-url", type=replay.local_url, required=True)
    tokens.add_argument("--index", required=True)
    tokens.add_argument("--output", required=True)
    return p


if __name__ == "__main__":
    args = parser().parse_args()
    state = execution_gate(args)
    if args.command == "check-gate":
        print(json.dumps({"status": "diagnostic_only" if state.get("diagnostic_metadata") else "passed",
            "spec_freeze_sha256": state["freeze_sha256"], "corpora": len(state["corpora"]), **state.get("diagnostic_metadata", {})}))
    elif args.command == "prepare":
        prepare(args, state)
    elif args.command == "run":
        run(args, state)
    elif args.command == "controls":
        controls(args, state)
    elif args.command == "quality-spatial-probe":
        quality_spatial_probe(args, state)
    else:
        analyze_tokens(args, state)
