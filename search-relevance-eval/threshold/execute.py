#!/usr/bin/env python3
"""Gated threshold-study adapter over the existing exporter and replay runner.

No independent search/measurement framework, query DSL construction or metric
implementation. An explicit parent-approved, hash-bound execution input manifest
is mandatory. Unresolved fixture conformance cannot silently become a strict pass.
"""
import argparse
import copy
import datetime
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import re
import subprocess
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


replay = module("threshold_execution_replay", ROOT.parent / "run.py")
freeze = module("threshold_execution_freeze", ROOT / "freeze.py")
contract = module("threshold_execution_contract", ROOT / "export_contract.py")
diagnostics = module("threshold_execution_diagnostics", ROOT / "diagnostics.py")


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_json(path):
    return json.loads(Path(path).read_text())


def repo_file(name):
    require(isinstance(name, str) and not Path(name).is_absolute(), "Use repository-relative input paths")
    path = (REPO / name).resolve()
    require(path.is_relative_to(REPO) and path.is_file(), "Execution input missing or outside checkout")
    return path


def exclusive_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf8") as stream:
        json.dump(value, stream, indent=2, sort_keys=True, allow_nan=False)
        stream.write("\n")


def relative(path):
    return str(Path(path).resolve().relative_to(REPO))


def digest(value):
    return hashlib.sha256(contract.canonical(value)).hexdigest()


def bound_file(inputs, name):
    require(name in inputs["source_sha256"], "Input is not hash-bound: " + str(name))
    path = repo_file(name)
    require(replay.sha(path) == inputs["source_sha256"][name], "Execution source changed: " + name)
    return path


def embedding_spec(inputs):
    # Threshold registration explicitly inherits this frozen model, not a new choice.
    path = ROOT.parent / "synthetic/generation-spec.json"
    value = read_json(bound_file(inputs, relative(path)))["embedding"]
    require(isinstance(value.get("model"), str) and value["model"], "Missing frozen model alias")
    require(type(value.get("dimension")) is int and value["dimension"] > 0, "Invalid frozen dimension")
    require(re.fullmatch(r"sha256:[0-9a-f]{64}", value.get("image_digest", "")) is not None,
            "Missing frozen image digest")
    return value


def unique_rows(rows, key):
    ids = [row[key] for row in rows]
    require(all(isinstance(value, str) and value for value in ids)
            and len(set(ids)) == len(ids), "Missing/duplicate " + key)
    return {row[key]: row for row in rows}


def corpus_projection(doc):
    """Exact metadata projection performed by inherited replay.prepare, sans vectors."""
    result = copy.deepcopy(doc)
    require(result.get("publishingState") in (None, "published"), "Nonpublic source document")
    for item, child in [(result, False)] + [(d, True) for d in result.get("distributions", [])]:
        for key in ("score", "accessControl", "queryContextVector"):
            item.pop(key, None)
        item["tenantId"] = 0
        item["queryContext"] = replay.context(item, child)
    return result


def vector(value, dimension):
    require(isinstance(value, list) and len(value) == dimension
            and all(type(v) in (int, float) and math.isfinite(v) for v in value),
            "Invalid frozen vector/dimension")


def verify_reused(source_docs, reused_docs, source_queries, reused_queries, count, dimension):
    require(len(source_docs) == len(reused_docs) == count, "Reused corpus count mismatch")
    expected = unique_rows(source_docs, "identifier")
    actual = unique_rows(reused_docs, "identifier")
    require(expected.keys() == actual.keys(), "Reused corpus IDs changed")
    for identifier, doc in actual.items():
        # Only vectors may differ from the inherited prepare source projection.
        projected = copy.deepcopy(doc)
        for item in [projected] + projected.get("distributions", []):
            vector(item.pop("queryContextVector", None), dimension)
        require(projected == corpus_projection(expected[identifier]),
                "Reused root/child text or metadata changed: " + identifier)
    expected_queries = unique_rows(source_queries, "id")
    actual_queries = unique_rows(reused_queries, "id")
    require(expected_queries.keys() == actual_queries.keys(), "Reused query IDs changed")
    for identifier, query in actual_queries.items():
        plain = copy.deepcopy(query)
        vector(plain.pop("vector", None), dimension)
        original = {key: value for key, value in expected_queries[identifier].items() if key != "vector"}
        require(plain == original, "Reused query text/split/filter metadata changed: " + identifier)


def verify_reuse_attestation(case, inputs, embedding):
    value = case.get("reuse_embedding", {})
    for key in ("model", "image_digest", "dimension"):
        require(value.get(key) == embedding[key], "Reused embedding identity differs: " + key)
    for key, source in (("corpus_sha256", "reuse_embedded_corpus"),
                        ("queries_sha256", "reuse_embedded_queries")):
        require(value.get(key) == replay.sha(bound_file(inputs, case[source])), "Reused vector hash differs")
    provenance = value.get("provenance")
    require(isinstance(provenance, list) and provenance, "Existing vector provenance required")
    for name in provenance:
        bound_file(inputs, name)
    # This is a NEW parent-approved attestation, never a claim that an old receipt
    # originally contained fields it did not. The old provenance bytes stay intact.
    return value


def validated_manifest_ref(inputs, parent, value):
    path = (parent / value["path"]).resolve()
    require(path.is_relative_to(REPO), "Validation reference escapes checkout")
    require(replay.sha(bound_file(inputs, relative(path))) == value["sha256"], "Independent validation input differs")
    return path


def verify_independent_inputs(inputs):
    """NEW/LEGACY known+U evidence only; REAL is not declared relevance-validated."""
    new_path = bound_file(inputs, inputs["new_validation_manifest"])
    old_path = bound_file(inputs, inputs["legacy_validation_manifest"])
    new, old = read_json(new_path), read_json(old_path)
    require(all(new.get(key) is True for key in ("all_expanded_rows_independently_reconstructed",
                "all_known_pairs_inspected", "complete_actual_label_evidence", "pre_retrieval", "diagnostic_only",
                "original_strict_conformance_failed"))
            and new.get("forced_recommendation") == "D" and new.get("promotion_allowed") is False
            and new.get("actual_text_validation_passed") is False,
            "Require truthful independently closed, nonconformant NEW evidence")
    require(inputs.get("fixture_conformance_passed") is False and inputs.get("original_strict_conformance_failed") is True,
            "Preserve actual strict failure instead of replacing it with a Boolean pass")
    require(new.get("spec_freeze_sha256") == replay.sha(ROOT / "spec-freeze.json"), "NEW validation freeze differs")
    require(old.get("independent_validation") is True and old.get("known_qrels_match_frozen") is True
            and old.get("pre_retrieval") is True and old.get("promotion_allowed") is False
            and old.get("unknown_pair_count") == 12,
            "Require unchanged original LEGACY known/U evidence")
    for cohort, path, document in (("NEW", new_path, new), ("LEGACY", old_path, old)):
        cases = [c for c in inputs["cases"] if c["cohort"] == cohort]
        rows = document["corpora"]
        require(len(rows) == len(cases), "Independent validation skipped/duplicated a case")
        for case in cases:
            matched = [row for row in rows if row["seed"] == case["seed"]
                       and row["dataset_count"] == case["catalog_size"]]
            require(len(matched) == 1, "Case is not independently validated")
            row = matched[0]
            require(validated_manifest_ref(inputs, path.parent, row) == repo_file(case["corpus"]),
                    "Case corpus differs from independently closed source")
            if "row_receipt" in row:
                validated_manifest_ref(inputs, path.parent, row["row_receipt"])
            if cohort == "LEGACY":
                require(replay.sha(repo_file(case["queries"])) == document["query_spec_sha256"],
                        "Original LEGACY query bytes changed")
    # These are hash checks only; execution never reads qrel grades or audit labels.
    for key in ("qrels", "expanded_evidence"):
        validated_manifest_ref(inputs, new_path.parent, new[key])
    bundle_path = bound_file(inputs, inputs["real_bundle_manifest"])
    bundle = read_json(bundle_path)
    members = unique_rows(bundle["members"], "name")
    real = next(c for c in inputs["cases"] if c["cohort"] == "REAL")
    for key, member in (("corpus", "corpus.jsonl"), ("queries", "queries.jsonl"),
                        ("reuse_embedded_corpus", "embedded-corpus.jsonl"),
                        ("reuse_embedded_queries", "embedded-queries.jsonl")):
        require(replay.sha(bound_file(inputs, real[key])) == members[member]["sha256"],
                "REAL snapshot/vector file differs from immutable original bundle")
    return {"NEW": relative(new_path), "LEGACY": relative(old_path), "REAL": "unjudged_snapshot_not_label_validated"}


def gate(approval_path, inputs_path):
    """Offline only; a complete source closure is required before any subprocess."""
    freeze.verify(ROOT)
    approval, inputs = read_json(approval_path), read_json(inputs_path)
    require(approval.get("approved_by") == "parent-agent" and approval.get("execution_allowed") is True,
            "Explicit parent execution approval is required")
    require(approval.get("spec_freeze_sha256") == replay.sha(ROOT / "spec-freeze.json"), "Approval freeze mismatch")
    require(approval.get("inputs_sha256") == replay.sha(inputs_path), "Approval input manifest mismatch")
    require(inputs.get("pre_retrieval") is True and inputs.get("thresholds") == freeze.THRESHOLDS,
            "Input registration must precede retrieval and fix all thresholds")
    if inputs.get("fixture_conformance_passed") is not True:
        require(approval.get("diagnostic_only") is True and approval.get("forced_recommendation") == "D"
                and approval.get("promotion_allowed") is False,
                "Failed fixture conformance permits only separately approved forced-D diagnostics")
        require(inputs.get("original_strict_conformance_failed") is True,
                "Do not hide failed original fixture conformance")
    hashes = inputs.get("source_sha256")
    require(isinstance(hashes, dict) and hashes, "Execution requires actual source-file closure")
    required_sources = (ROOT / "execute.py", ROOT / "diagnostics.py", ROOT / "freeze.py",
                        ROOT / "export_contract.py", ROOT.parent / "run.py",
                        ROOT.parent / "scala/ExportBaselineRequests.scala",
                        ROOT.parent / "synthetic/generation-spec.json",
                        ROOT.parent / "synthetic/production-baseline-source.json", ROOT / "spec-freeze.json")
    require(all(relative(path) in hashes for path in required_sources), "Incomplete execution source closure")
    for name, expected in hashes.items():
        require(isinstance(expected, str) and re.fullmatch(r"[0-9a-f]{64}", expected) is not None,
                "Invalid source SHA256: " + name)
        bound_file(inputs, name)
    embedding_spec(inputs)
    runtime_provenance = inputs.get("embedding_runtime_provenance")
    require(isinstance(runtime_provenance, list) and runtime_provenance, "Existing pinned runtime-image provenance required")
    for name in runtime_provenance:
        bound_file(inputs, name)
    bound_file(inputs, inputs["correctness_report"])
    production = read_json(ROOT.parent / "synthetic/production-baseline-source.json")
    require(production["baseline_commit"] == freeze.BASELINE and len(production["sha256"]) == 8,
            "Wrong production baseline/eight-file closure")
    for name, expected in production["sha256"].items():
        require(replay.sha(repo_file(name)) == expected, "Production ranking/mapping/config changed: " + name)
    require(inputs.get("independent_actual_label_evidence_complete") is True,
            "All independent known/U evidence must be complete; never invent judgments")
    cases = inputs.get("cases", [])
    require(cases and len({(case["cohort"], case["seed"], case["catalog_size"]) for case in cases}) == len(cases),
            "Missing or duplicate corpus cases")
    require({(c["seed"], c["catalog_size"]) for c in cases if c["cohort"] == "NEW"}
            == {(seed, size) for seed in (38871, 38872, 38873) for size in (60, 1000, 2000)}
            and {(c["seed"], c["catalog_size"]) for c in cases if c["cohort"] == "LEGACY"}
            == {(seed, 180) for seed in (39031, 39032, 39033)}
            and sum(c["cohort"] == "REAL" for c in cases) == 1 and len(cases) == 13,
            "Full registered 9 NEW + 3 LEGACY + 1 REAL cases required; no silent skips")
    require(len({case["index"] for case in cases}) == len(cases), "Cases must own distinct indices")
    for case in cases:
        replay.owned(case["index"])
        require(case["cohort"] in ("NEW", "LEGACY", "REAL"), "Unregistered cohort")
        require(type(case["seed"]) is int and type(case["catalog_size"]) is int and case["catalog_size"] > 0,
                "Invalid seed/corpus count")
        for key in ("corpus", "queries"):
            bound_file(inputs, case[key])
        reuse_keys = ("reuse_embedded_corpus", "reuse_embedded_queries")
        require(all(case.get(key) for key in reuse_keys) or not any(case.get(key) for key in reuse_keys),
                "Reuse requires both corpus and query vectors")
        if case.get("reuse_embedded_corpus"):
            for key in reuse_keys:
                bound_file(inputs, case[key])
            verify_reuse_attestation(case, inputs, embedding_spec(inputs))
    validation_scope = verify_independent_inputs(inputs)
    return {"approval": approval, "inputs": inputs, "validation_scope": validation_scope,
            "approval_sha256": replay.sha(approval_path),
            "inputs_sha256": replay.sha(inputs_path), "production_files_verified": len(production["sha256"])}


def artifact_root(value):
    path = Path(value).resolve()
    require(path.is_relative_to((ROOT / ".local").resolve()), "Keep operational artifacts inside threshold/.local")
    return path


def case_dir(root, case):
    return root / case["cohort"] / str(case["seed"]) / str(case["catalog_size"])


def prepare(a, verified):
    root = artifact_root(a.artifact_root)
    require(not (root / "preparation.json").exists(), "Do not overwrite an earlier preparation receipt")
    replay.local_url(a.embedding_url)
    start, rows = utc(), []
    embedding = embedding_spec(verified["inputs"])
    # Identity includes frozen model/image/dimension and inference metadata.
    cache = ROOT / ".local/gte-q8-cache" / digest(embedding)
    # Shared contexts are cached across all sizes; the same model response is
    # reused for identical text, never regenerated per threshold or catalog size.
    for case in verified["inputs"]["cases"]:
        target = case_dir(root, case)
        target.mkdir(parents=True, exist_ok=True)
        docs, queries = target / "embedded-corpus.jsonl", target / "embedded-queries.jsonl"
        require(not docs.exists() and not queries.exists(), "Use a fresh empty execution root")
        if case.get("reuse_embedded_corpus") and case.get("reuse_embedded_queries"):
            import shutil
            old_docs = bound_file(verified["inputs"], case["reuse_embedded_corpus"])
            old_queries = bound_file(verified["inputs"], case["reuse_embedded_queries"])
            verify_reuse_attestation(case, verified["inputs"], embedding)
            verify_reused(replay.load_jsonl(bound_file(verified["inputs"], case["corpus"])),
                          replay.load_jsonl(old_docs),
                          replay.load_jsonl(bound_file(verified["inputs"], case["queries"])),
                          replay.load_jsonl(old_queries), case["catalog_size"], embedding["dimension"])
            shutil.copyfile(old_docs, docs)
            shutil.copyfile(old_queries, queries)
            reused_vectors = True
        else:
            replay.prepare(SimpleNamespace(corpus=bound_file(verified["inputs"], case["corpus"]),
                queries=bound_file(verified["inputs"], case["queries"]), cache=cache,
                embedding_url=a.embedding_url, batch_size=8, expected_model=embedding["model"],
                output_corpus=docs, output_queries=queries))
            verify_reused(replay.load_jsonl(repo_file(case["corpus"])), replay.load_jsonl(docs),
                          replay.load_jsonl(repo_file(case["queries"])), replay.load_jsonl(queries),
                          case["catalog_size"], embedding["dimension"])
            reused_vectors = False
        rows.append({"cohort": case["cohort"], "seed": case["seed"], "catalog_size": case["catalog_size"],
                     "corpus_sha256": replay.sha(docs), "queries_sha256": replay.sha(queries),
                     "source_projection_verified": True, "reused_vectors": reused_vectors,
                      "reuse_embedding": case.get("reuse_embedding")})
    exclusive_json(root / "preparation.json", {"started_utc": start, "completed_utc": utc(),
        "inputs_sha256": verified["inputs_sha256"], "embedding": embedding,
        "embedding_cache_identity_sha256": digest(embedding),
        "embedding_runtime_provenance_sha256": {name: verified["inputs"]["source_sha256"][name]
                                              for name in verified["inputs"]["embedding_runtime_provenance"]},
        "cases": rows, "retrievals_executed": 0})


def verify_preparation(root, verified):
    preparation = read_json(root / "preparation.json")
    require(preparation["inputs_sha256"] == verified["inputs_sha256"], "Prepared different inputs")
    require(preparation.get("embedding") == embedding_spec(verified["inputs"]), "Prepared model identity changed")
    expected = {(c["cohort"], c["seed"], c["catalog_size"]): c for c in verified["inputs"]["cases"]}
    rows = preparation["cases"]
    require(len(rows) == len(expected) and
            {(r["cohort"], r["seed"], r["catalog_size"]) for r in rows} == set(expected),
            "Preparation silently skipped/duplicated a case")
    for row in rows:
        target = case_dir(root, row)
        require(row.get("source_projection_verified") is True, "Unverified prepared projection")
        for name, key in (("embedded-corpus.jsonl", "corpus_sha256"), ("embedded-queries.jsonl", "queries_sha256")):
            require(replay.sha(target / name) == row[key], "Prepared artifact changed: " + str(target / name))
    return preparation


def safe_sbt_argument(value):
    # sbt parses each runMain string again; shell argv quoting alone is not enough.
    text = str(value)
    require(re.fullmatch(r"[A-Za-z0-9_./:=+@,-]+", text) is not None,
            "Exporter argument needs explicit safe quoting support: " + repr(text))
    return text


def export_files(root, cases):
    return [case_dir(root, case) / "exports" / label / name
            for case in cases for label in tuple(contract.THRESHOLD_LABELS) + (contract.DIAGNOSTIC_LABEL, "keyword")
            for name in ("requests.jsonl", "mapping.json", "config.json")]


def verify_exports(root, verified):
    verify_preparation(root, verified)
    receipt = read_json(root / "export-completion.json")
    require(receipt["inputs_sha256"] == verified["inputs_sha256"] and
            receipt["preparation_sha256"] == replay.sha(root / "preparation.json"), "Exported different preparation/inputs")
    files = export_files(root, verified["inputs"]["cases"])
    require(set(receipt["files_sha256"]) == {relative(path) for path in files}, "Export closure skipped an artifact")
    for path in files:
        require(replay.sha(path) == receipt["files_sha256"][relative(path)], "Export artifact changed: " + str(path))
    return receipt


def validate_case_exports(root, case):
    target = case_dir(root, case)
    directory = target / "exports"
    sets = {label: replay.load_jsonl(directory / label / "requests.jsonl")
            for label in tuple(contract.THRESHOLD_LABELS) + (contract.DIAGNOSTIC_LABEL,)}
    configs = {label: directory / label / "config.json" for label in sets}
    result = contract.validate_request_sets(sets, configs)
    require(result["full_frozen_label_set"], "All eight frozen labels required")
    keyword = replay.load_jsonl(directory / "keyword/requests.jsonl")
    contract.validate_keyword_exports(keyword)
    embedded = unique_rows(replay.load_jsonl(target / "embedded-queries.jsonl"), "id")
    expected_ids = embedded.keys()
    for rows in sets.values():
        for row in rows:
            require(all(payload["vector"] == embedded[row["query_id"]]["vector"]
                        for _, _, payload in contract.knn_copies(row["request"]["body"])),
                    "Exporter query vector differs from its prepared source task")
    for rows in list(sets.values()) + [keyword]:
        require(unique_rows(rows, "query_id").keys() == expected_ids, "Exporter skipped/added a task")
        require(all(row["request"]["path"] == "/" + case["index"] + "/_search" for row in rows),
                "Exporter index differs; never hand-patch index paths")
    mapping_hashes = {replay.sha(directory / label / "mapping.json") for label in tuple(sets) + ("keyword",)}
    require(len(mapping_hashes) == 1, "Mappings differ across arms")


def export(a, verified):
    root = artifact_root(a.artifact_root)
    verify_preparation(root, verified)
    commands = ['set searchApi / Test / unmanagedSourceDirectories += (ThisBuild / baseDirectory).value / "search-relevance-eval/scala"']
    tasks = []
    for case in verified["inputs"]["cases"]:
        target = case_dir(root, case)
        input_path = target / "embedded-queries.jsonl"
        for label, score in list(contract.THRESHOLD_LABELS.items()) + [(contract.DIAGNOSTIC_LABEL, None), ("keyword", None)]:
            directory = target / "exports" / label
            directory.mkdir(parents=True, exist_ok=True)
            output = directory / "requests.jsonl"
            require(not any((directory / name).exists() for name in ("requests.jsonl", "mapping.json", "config.json")),
                    "Do not overwrite an actual exporter artifact")
            for argument in (input_path, output, case["index"], directory / "mapping.json", directory / "config.json"):
                safe_sbt_argument(argument)
            option = "--keyword-only true" if label == "keyword" else "--k 10" if score is None else "--min-score " + str(score)
            command = ("searchApi/Test/runMain au.csiro.data61.magda.search.eval.ExportBaselineRequests "
                       "--input {input} --output {output} --index {index} --mapping-output {mapping} "
                       "--config-output {config} --limit 10 --baseline-commit {baseline} {option}").format(
                           input=input_path, output=output, index=case["index"], mapping=directory / "mapping.json",
                           config=directory / "config.json", baseline=freeze.BASELINE, option=option)
            commands.append(command)
            tasks.append({"case": [case["cohort"], case["seed"], case["catalog_size"]], "label": label,
                          "requests": str(output.relative_to(REPO))})
    exclusive_json(root / "export-command.json", {"started_utc": utc(), "command": [a.sbt] + commands,
                                                "inputs_sha256": verified["inputs_sha256"]})
    subprocess.run([a.sbt] + commands, cwd=REPO, check=True)
    for case in verified["inputs"]["cases"]:
        validate_case_exports(root, case)
    exclusive_json(root / "export-completion.json", {"completed_utc": utc(), "tasks": tasks,
        "files_sha256": {relative(path): replay.sha(path) for path in export_files(root, verified["inputs"]["cases"])},
        "preparation_sha256": replay.sha(root / "preparation.json"),
                                                    "inputs_sha256": verified["inputs_sha256"]})


def index_metadata(engine, case):
    index = case["index"]
    count = replay.request(engine, "GET", "/" + index + "/_count")
    require(not count.get("_shards", {}).get("failed") and count.get("count") == case["catalog_size"],
            "Installed dataset count differs")
    mapping = replay.request(engine, "GET", "/" + index + "/_mapping")[index]["mappings"]
    settings = replay.request(engine, "GET", "/" + index + "/_settings")[index]["settings"]["index"]
    require(isinstance(settings.get("uuid"), str) and settings["uuid"], "Missing installed index UUID")
    return {"count": count["count"], "mapping_sha256": digest(mapping), "index_uuid": settings["uuid"]}


def install(a, verified):
    """Install ALL cases before ANY timing window; never install from run()."""
    require(a.allow_local_writes, "Explicit local writes required")
    replay.local_url(a.engine_url)
    root = artifact_root(a.artifact_root)
    require(not (root / "installation.json").exists(), "Do not reinstall an existing execution")
    require(not any(root.glob("release-*.json")), "No installation after a timing release")
    verify_exports(root, verified)
    started, rows = utc(), []
    for case in verified["inputs"]["cases"]:
        target = case_dir(root, case)
        mapping, corpus = target / "exports/ms_050/mapping.json", target / "embedded-corpus.jsonl"
        replay.install(SimpleNamespace(engine_url=a.engine_url, index=case["index"], mapping=mapping,
                                       corpus=corpus, allow_local_writes=True))
        metadata = index_metadata(a.engine_url, case)
        require(metadata["mapping_sha256"] == digest(read_json(mapping)["mappings"]), "Engine mapping differs")
        docs = replay.load_jsonl(corpus)
        vectors = [{"identifier": doc["identifier"], "root": doc["queryContextVector"],
                    "children": [child["queryContextVector"] for child in doc.get("distributions", [])]}
                   for doc in docs]
        rows.append(dict(metadata, cohort=case["cohort"], seed=case["seed"], catalog_size=case["catalog_size"],
                         index=case["index"], corpus_sha256=replay.sha(corpus),
                         mapping_file_sha256=replay.sha(mapping), source_vectors_sha256=digest(vectors)))
    exclusive_json(root / "installation.json", {"started_utc": started, "completed_utc": utc(),
        "engine_url": a.engine_url, "inputs_sha256": verified["inputs_sha256"],
        "export_completion_sha256": replay.sha(root / "export-completion.json"),
        "all_cases_installed_before_timings": True, "cases": rows})


def verify_installation(a, root, verified):
    verify_exports(root, verified)
    value = read_json(root / "installation.json")
    require(value["inputs_sha256"] == verified["inputs_sha256"] and value["engine_url"] == a.engine_url,
            "Installed different inputs/engine")
    require(value.get("all_cases_installed_before_timings") is True and
            value["export_completion_sha256"] == replay.sha(root / "export-completion.json"),
            "Installation/export closure differs")
    rows = value["cases"]
    require(len(rows) == len(verified["inputs"]["cases"]) and
            {r["index"] for r in rows} == {c["index"] for c in verified["inputs"]["cases"]},
            "Installation skipped/duplicated a case")
    for case in verified["inputs"]["cases"]:
        old = next(row for row in rows if row["index"] == case["index"])
        require(index_metadata(a.engine_url, case) == {key: old[key] for key in ("count", "mapping_sha256", "index_uuid")},
                "Installed engine state changed")
        require(old["corpus_sha256"] == replay.sha(case_dir(root, case) / "embedded-corpus.jsonl"),
                "Installed vector corpus changed")
    return value


def selected_ids(queries, case, split):
    unique_rows(queries, "id")
    require(split in ("development", "heldout"), "Unknown execution split")
    if case["cohort"] != "NEW":
        return set() if split == "development" else {q["id"] for q in queries}
    require(all(q.get("split") in ("development", "heldout", "diagnostic") for q in queries),
            "Missing/unregistered NEW task split")
    return {q["id"] for q in queries if q["split"] == split or split == "heldout" and q["split"] == "diagnostic"}


def development_decision(path, verified):
    require(path is not None, "Freeze development decision before any heldout/legacy retrieval")
    value = read_json(path)
    require(value.get("immutable_before_heldout") is True and value.get("created_utc")
            and value.get("inputs_sha256") == verified["inputs_sha256"]
            and "selected_threshold" in value, "Require dated, input-bound explicit DEV decision")
    stamp = datetime.datetime.fromisoformat(value["created_utc"].replace("Z", "+00:00"))
    require(stamp.tzinfo is not None and stamp <= datetime.datetime.now(datetime.timezone.utc), "Invalid DEV decision UTC")
    require(value.get("selected_threshold") in freeze.THRESHOLDS + [None, "NONE"], "Invalid DEV selection")
    if verified["approval"].get("diagnostic_only"):
        require(value.get("selected_threshold") in (None, "NONE") and value.get("promotion_allowed") is False
                and value.get("forced_recommendation") == "D", "Forced-D DEV must explicitly select NONE")
    return value


def run(a, verified):
    require(a.allow_local_writes, "Explicit local writes required")
    replay.local_url(a.engine_url)
    root = artifact_root(a.artifact_root)
    parity = read_json(bound_file(verified["inputs"], verified["inputs"]["correctness_report"]))
    require(parity.get("status") == "passed" and parity.get("production_pipeline_parity", {}).get("status") == "passed",
            "Actual all-threshold controls and production-pipeline raw parity must pass")
    selection = None
    if a.split != "development":
        selection = development_decision(a.development_record, verified)
        require((root / "complete-development.json").is_file(), "DEV sweep must finish before heldout/legacy")
        require(selection.get("development_completion_sha256") == replay.sha(root / "complete-development.json"),
                "DEV decision must bind complete development artifacts")
        complete = verify_complete(root, "development", verified)
        require(complete["inputs_sha256"] == verified["inputs_sha256"] and
                datetime.datetime.fromisoformat(selection["created_utc"].replace("Z", "+00:00")) >=
                datetime.datetime.fromisoformat(complete["completed_utc"].replace("Z", "+00:00")),
                "DEV decision predates complete sweep")
    verify_installation(a, root, verified)
    exclusive_json(root / ("release-" + a.split + ".json"), {
        "created_utc": utc(), "split": a.split, "approval_sha256": verified["approval_sha256"],
        "inputs_sha256": verified["inputs_sha256"],
        "installation_sha256": replay.sha(root / "installation.json"),
        "export_completion_sha256": replay.sha(root / "export-completion.json"),
        "development_record_sha256": replay.sha(a.development_record) if selection is not None else None,
        "original_fixture_conformance_passed": verified["inputs"].get("fixture_conformance_passed") is True,
        "diagnostic_only": verified["approval"].get("diagnostic_only", False)})
    completed_cases = []
    for case in verified["inputs"]["cases"]:
        if a.split == "development" and case["cohort"] != "NEW":
            continue
        target = case_dir(root, case)
        queries = replay.load_jsonl(bound_file(verified["inputs"], case["queries"]))
        ids = selected_ids(queries, case, a.split)
        require(ids, "Execution split has no tasks")
        labels = tuple(contract.THRESHOLD_LABELS) + (contract.DIAGNOSTIC_LABEL,)
        requests, configs = {}, {}
        for label in labels:
            source = target / "exports" / label
            path = target / (a.split + "-" + label + ".jsonl")
            rows = replay.load_jsonl(source / "requests.jsonl")
            chosen = [row for row in rows if row["query_id"] in ids]
            require(unique_rows(chosen, "query_id").keys() == ids, "Split export skipped a task")
            require(all(row["request"]["path"] == "/" + case["index"] + "/_search" for row in chosen),
                    "Wrong exported index; re-export instead of rewriting")
            with path.open("x") as stream:
                for row in chosen:
                    stream.write(json.dumps(row, sort_keys=True) + "\n")
            requests[label], configs[label] = path, source / "config.json"
        rows = replay.run_export_sets(SimpleNamespace(engine_url=a.engine_url, index=case["index"],
            output=target / (a.split + "-runs.jsonl"), depth=10, repetitions=10,
            raw_production_only=True, allow_local_writes=True, compact_output=True, seed=case["seed"],
            corpus=target / "embedded-corpus.jsonl", raw_output=target / (a.split + "-receipts.jsonl")),
            requests, config_paths=configs, validate_request_sets=contract.validate_request_sets)
        completed_cases.append(case_run_receipt(target, a.split, case, ids, labels, rows))
    exclusive_json(root / ("complete-" + a.split + ".json"), {"completed_utc": utc(), "split": a.split,
        "release_sha256": replay.sha(root / ("release-" + a.split + ".json")), "cases": completed_cases,
                                                           "inputs_sha256": verified["inputs_sha256"]})


def case_run_receipt(target, prefix, case, ids, labels, rows):
    require(len(rows) == len(ids) * len(labels)
            and {(r["query_id"], r["system"]) for r in rows} == {(qid, label) for qid in ids for label in labels},
            "Replay skipped/duplicated a query/arm")
    receipts = replay.load_jsonl(target / (prefix + "-receipts.jsonl"))
    expected = {(qid, label, phase, repetition) for qid in ids for label in labels
                for phase, repetitions in (("warmup", [0]), ("measured", range(1, 11))) for repetition in repetitions}
    require(len(receipts) == len(expected) and
            {(r["query_id"], r["system"], r["phase"], r["repetition"]) for r in receipts} == expected
            and all(r.get("parsed_json_sha256") and r.get("request_started_utc") and r.get("request_completed_utc")
                    and "all_hit_signatures" in r for r in receipts), "Incomplete per-request timing/identity receipts")
    files = [target / (prefix + suffix) for suffix in ("-runs.jsonl", "-receipts.jsonl", "-runs.jsonl.requests.jsonl")]
    return {"cohort": case["cohort"], "seed": case["seed"], "catalog_size": case["catalog_size"],
            "query_count": len(ids), "measured_requests": len(ids) * len(labels) * 10,
            "warmup_requests": len(ids) * len(labels), "files_sha256": {relative(path): replay.sha(path) for path in files}}


def verify_complete(root, split, verified):
    path = root / ("complete-" + split + ".json")
    value = read_json(path)
    require(value["inputs_sha256"] == verified["inputs_sha256"] and value.get("cases"), "Incomplete primary sweep")
    require(value["release_sha256"] == replay.sha(root / ("release-" + split + ".json")), "Timing release changed")
    expected = {(c["cohort"], c["seed"], c["catalog_size"]) for c in verified["inputs"]["cases"]
                if split == "heldout" or c["cohort"] == "NEW"}
    require(len(value["cases"]) == len(expected) and
            {(r["cohort"], r["seed"], r["catalog_size"]) for r in value["cases"]} == expected,
            "Primary completion skipped/duplicated a case")
    for row in value["cases"]:
        for name, expected_sha in row["files_sha256"].items():
            require(replay.sha(repo_file(name)) == expected_sha, "Completed primary artifact changed: " + name)
    return value


def role_run(a, verified):
    """Two fixed nonpromotional counterfactuals, using the existing timing runner."""
    require(a.allow_local_writes, "Explicit local writes required")
    require(verified["approval"].get("mixed_role_diagnostics_allowed") is True and
            verified["inputs"].get("mixed_role_pairs") == diagnostics.REGISTERED_ROLE_PAIRS,
            "Explicit registered mixed-role diagnostic approval required")
    root = artifact_root(a.artifact_root)
    decision = development_decision(a.development_record, verified)
    dev = verify_complete(root, "development", verified)
    verify_complete(root, "heldout", verified)
    require(decision.get("development_completion_sha256") == replay.sha(root / "complete-development.json"),
            "Mixed diagnostics require the immutable complete DEV decision")
    require(datetime.datetime.fromisoformat(decision["created_utc"].replace("Z", "+00:00")) >=
            datetime.datetime.fromisoformat(dev["completed_utc"].replace("Z", "+00:00")), "Decision predates DEV")
    held_release = read_json(root / "release-heldout.json")
    require(held_release["development_record_sha256"] == replay.sha(a.development_record),
            "DEV record changed after heldout release")
    verify_installation(a, root, verified)
    exclusive_json(root / "release-roles.json", {"created_utc": utc(), "diagnostic_only": True,
        "promotion_allowed": False, "inputs_sha256": verified["inputs_sha256"],
        "approval_sha256": verified["approval_sha256"], "development_record_sha256": replay.sha(a.development_record),
        "primary_heldout_completion_sha256": replay.sha(root / "complete-heldout.json"),
        "matched_uniform_roles_reuse_primary": {"0.50/0.50": "ms_050", "0.45/0.45": "ms_045"}})
    runner = diagnostics.role_runner()  # Private module only; the primary registry remains unchanged.
    completed = []
    for case in verified["inputs"]["cases"]:
        if case["cohort"] != "NEW":
            continue
        target = case_dir(root, case)
        baseline = target / "exports/ms_050/requests.jsonl"
        config = target / "exports/ms_050/config.json"
        source = replay.load_jsonl(baseline)
        ids = set(unique_rows(replay.load_jsonl(bound_file(verified["inputs"], case["queries"])), "id"))
        require(len(ids) == 50 and unique_rows(source, "query_id").keys() == ids,
                "Mixed diagnostics require all50 NEW tasks at every registered case")
        require(all(row["request"]["path"] == "/" + case["index"] + "/_search" for row in source),
                "Wrong actual source index")
        paths = {}
        for label, pair in diagnostics.ROLE_PAIRS.items():
            path = target / (label + ".jsonl")
            with path.open("x", encoding="utf8") as stream:
                for row in source:
                    stream.write(json.dumps(diagnostics.mixed_export(row, *pair), sort_keys=True) + "\n")
            paths[label] = path
        rows = runner.run_export_sets(SimpleNamespace(engine_url=a.engine_url, index=case["index"],
            output=target / "roles-runs.jsonl", depth=10, repetitions=10, raw_production_only=True,
            allow_local_writes=True, compact_output=True, seed=case["seed"], corpus=target / "embedded-corpus.jsonl",
            raw_output=target / "roles-receipts.jsonl"), paths,
            config_paths={label: config for label in paths},
            validate_request_sets=diagnostics.role_validator(baseline, config))
        completed.append(case_run_receipt(target, "roles", case, ids, tuple(paths), rows))
    require(len(completed) == 9, "Mixed diagnostics skipped a NEW case")
    exclusive_json(root / "complete-roles.json", {"completed_utc": utc(), "diagnostic_only": True,
        "promotion_allowed": False, "inputs_sha256": verified["inputs_sha256"],
        "release_sha256": replay.sha(root / "release-roles.json"), "cases": completed})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--approval", type=Path, default=ROOT / "execution-approval.json")
    parser.add_argument("--inputs", type=Path, default=ROOT / "execution-inputs.json")
    parser.add_argument("--artifact-root", type=Path, default=ROOT / ".local/execution")
    parser.add_argument("--engine-url", default="http://127.0.0.1:19200")
    parser.add_argument("--embedding-url", default="http://127.0.0.1:13000")
    parser.add_argument("--sbt", default="sbt")
    parser.add_argument("--allow-local-writes", action="store_true")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("check-gate")
    commands.add_parser("prepare")
    commands.add_parser("export")
    commands.add_parser("install")
    replay_parser = commands.add_parser("run")
    replay_parser.add_argument("--split", choices=("development", "heldout"), required=True)
    replay_parser.add_argument("--development-record", type=Path)
    role_parser = commands.add_parser("role-run", help="Fixed counterfactual diagnostics after all primary timings")
    role_parser.add_argument("--development-record", type=Path, required=True)
    args = parser.parse_args()
    replay.local_url(args.engine_url)
    replay.local_url(args.embedding_url)
    verified = gate(args.approval, args.inputs)
    if args.command == "check-gate":
        print(json.dumps({"status": "inputs_bound", "approval_sha256": verified["approval_sha256"],
                          "inputs_sha256": verified["inputs_sha256"]}))
    else:
        {"prepare": prepare, "export": export, "install": install, "run": run, "role-run": role_run}[args.command](args, verified)


if __name__ == "__main__":
    main()
