#!/usr/bin/env python3
"""Evaluation-only local replay. Never imports or changes production ranking code.

Baseline JSON comes from ExportBaselineRequests.scala on the pinned Magda commit.
Experimental transformations below are deliberately confined to this directory.
"""
import argparse
import copy
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import math
import pathlib
import statistics
import time
import urllib.error
import urllib.parse
import urllib.request

SYSTEMS = ("baseline", "candidate_03_07", "candidate_05_05", "candidate_07_03",
           "candidate_keep50_03_07", "keyword", "vector")
WEIGHTS = {"candidate_03_07": [.3, .7], "candidate_05_05": [.5, .5],
           "candidate_07_03": [.7, .3], "candidate_keep50_03_07": [.3, .7]}
EXTRA_SYSTEMS = ("raw_boost1",)  # Explicit opt-in; the #3902 default stays seven.
PREFIX = "magda-relevance-eval-"


def selected_systems(value=None):
    """Accept a fixed allowlisted subset, never arbitrary post-hoc weights/DSL."""
    if value is None:
        return SYSTEMS
    if isinstance(value, str):
        value = json.loads(value) if value.lstrip().startswith("[") else value.split(",")
    if not isinstance(value, (list, tuple)) or not value or any(not isinstance(v, str) for v in value):
        raise ValueError("Systems must be a nonempty list or comma-separated names")
    value = tuple(v.strip() for v in value)
    if len(set(value)) != len(value) or any(v not in SYSTEMS + EXTRA_SYSTEMS for v in value):
        raise ValueError("Unknown or duplicate evaluation system")
    return value


def remove_root_vector_boost(node):
    """Remove ONLY exact root field kNN boosts, including facet query copies."""
    if isinstance(node, list):
        return [remove_root_vector_boost(value) for value in node]
    if not isinstance(node, dict):
        return node
    out = {key: remove_root_vector_boost(value) for key, value in node.items()}
    if "knn" in out and "queryContextVector" in out["knn"]:
        out["knn"]["queryContextVector"].pop("boost", None)
    return out


def load_jsonl(path):
    with open(path, encoding="utf8") as stream:
        return [json.loads(line) for line in stream if line.strip()]


def write_jsonl(path, values):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf8") as stream:
        for value in values:
            stream.write(json.dumps(value, ensure_ascii=False, sort_keys=True) + "\n")


def sha(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def local_url(value):
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "localhost", "::1", "host.docker.internal"):
        raise ValueError("Replay and embedding endpoints must be explicit loopback/local HTTP URLs, never a public catalogue")
    if parsed.username or parsed.password or parsed.path not in ("", "/") or parsed.query or parsed.fragment:
        raise ValueError("Credentials, paths, queries and fragments are not accepted in service origins")
    _ = parsed.port
    return value.rstrip("/")


def owned(name):
    if not name.startswith(PREFIX) or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789-_" for c in name):
        raise ValueError("Test resource names must start with " + PREFIX + " and use lowercase letters, digits, - or _")
    return name


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Redirects are forbidden for local evaluation requests")


def request(base, method, path, body=None, content_type="application/json"):
    local_url(base)
    data = body.encode() if isinstance(body, str) else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(base + path, data=data, method=method,
                                 headers={"Content-Type": content_type, "User-Agent": "magda-search-relevance-eval/3901"})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(req, timeout=180) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"{method} {path}: {error.code} {error.read().decode()[:3000]}") from error


def embed_texts(endpoint, texts, cache, batch_size=8, expected_model=None):
    """Cache by exact UTF-8 text; model/digest must be frozen in experiment manifest."""
    cache.mkdir(parents=True, exist_ok=True)
    missing = {}
    for text in texts:
        key = hashlib.sha256(text.encode()).hexdigest()
        if not (cache / (key + ".json")).exists():
            missing[key] = text
    items = sorted(missing.items())
    for start in range(0, len(items), batch_size):
        group = items[start:start + batch_size]
        payload = {"input": [v for _, v in group]}
        if expected_model is not None:
            payload["model"] = expected_model
        result = request(endpoint, "POST", "/v1/embeddings", payload)
        if expected_model is not None and result.get("model") != expected_model:
            raise ValueError("Embedding response model differs from frozen expected model")
        rows = result.get("data", [])
        rows = sorted(rows, key=lambda row: row.get("index", 0))
        if len(rows) != len(group):
            raise ValueError("Embedding response count mismatch")
        for (key, _), row in zip(group, rows):
            vector = row["embedding"]
            if not vector or not all(isinstance(v, (float, int)) and math.isfinite(v) for v in vector):
                raise ValueError("Invalid embedding")
            (cache / (key + ".json")).write_text(json.dumps(vector), encoding="utf8")
        print(f"embedded {min(start + batch_size, len(items))}/{len(items)} new texts", flush=True)
    return [json.loads((cache / (hashlib.sha256(text.encode()).hexdigest() + ".json")).read_text()) for text in texts]


def context(doc, distribution=False):
    if doc.get("queryContext"):
        return doc["queryContext"]
    # Exact fallbacks mirror ElasticSearchIndexer.construct*QueryContext.
    if distribution:
        return f"Title: {doc.get('title') or 'None'}\nFormat: {doc.get('format') or 'None'}\nDescription: {doc.get('description') or 'None'}\n"
    return f"Title: {doc.get('title') or 'None'}\nDescription: {doc.get('description') or 'None'}\n"


def prepare(args):
    documents = load_jsonl(args.corpus)
    tasks = load_jsonl(args.queries)
    texts = [task["query"] for task in tasks]
    slots = []
    for doc in documents:
        # Search API output is public/permission-filtered, never an authorization export.
        if doc.get("publishingState") not in (None, "published"):
            raise ValueError("Only public published snapshot documents may be replayed")
        doc.pop("score", None)
        for field in ("queryContextVector", "accessControl"):
            doc.pop(field, None)
        doc["tenantId"] = 0
        for item, child in [(doc, False)] + [(d, True) for d in doc.get("distributions", [])]:
            item.pop("score", None)
            item.pop("accessControl", None)
            item["tenantId"] = 0
            text = context(item, child)
            item["queryContext"] = text
            slots.append(item)
            texts.append(text)
    vectors = embed_texts(local_url(args.embedding_url), texts, pathlib.Path(args.cache), args.batch_size,
                          expected_model=getattr(args, "expected_model", None))
    dimensions = {len(vector) for vector in vectors}
    if len(dimensions) != 1:
        raise ValueError("Mixed vector dimensions")
    for task, vector in zip(tasks, vectors[:len(tasks)]):
        task["vector"] = vector
    for item, vector in zip(slots, vectors[len(tasks):]):
        item["queryContextVector"] = vector
    write_jsonl(args.output_corpus, documents)
    write_jsonl(args.output_queries, tasks)
    print(json.dumps({"datasets": len(documents), "distributions": len(slots) - len(documents),
                      "dimension": dimensions.pop(), "corpus_sha256": sha(args.corpus),
                      "queries_sha256": sha(args.queries), "embedded_corpus_sha256": sha(args.output_corpus)}, indent=2))


def install(args):
    if not args.allow_local_writes:
        raise ValueError("Pass --allow-local-writes to create an owned disposable index")
    owned(args.index)
    mapping = json.loads(pathlib.Path(args.mapping).read_text())
    request(args.engine_url, "PUT", "/" + args.index, mapping)
    docs = load_jsonl(args.corpus)
    for start in range(0, len(docs), 50):
        lines = []
        for doc in docs[start:start + 50]:
            lines.extend([json.dumps({"index": {"_index": args.index, "_id": doc["identifier"]}}), json.dumps(doc)])
        result = request(args.engine_url, "POST", "/_bulk?refresh=true", "\n".join(lines) + "\n", "application/x-ndjson")
        if result.get("errors"):
            failures = [x for x in result["items"] if x["index"].get("error")]
            raise ValueError("Bulk index failed: " + json.dumps(failures[:2]))
    print(json.dumps({"index": args.index, "count": len(docs), "corpus_sha256": sha(args.corpus)}))


def replace_hybrid(node, family, keep_boost=True):
    if isinstance(node, list):
        return [replace_hybrid(v, family, keep_boost) for v in node]
    if not isinstance(node, dict):
        return node
    if "hybrid" in node:
        children = node["hybrid"]["queries"]
        if len(children) != 2:
            raise ValueError("Unexpected baseline hybrid arity; pinned baseline must be reviewed")
        return replace_hybrid(children[family], family, keep_boost)
    out = {key: replace_hybrid(value, family, keep_boost) for key, value in node.items()}
    if not keep_boost and "knn" in out:
        for field, payload in out["knn"].items():
            if field == "queryContextVector":
                payload.pop("boost", None)
    return out


def union_hybrid(node):
    if isinstance(node, list):
        return [union_hybrid(v) for v in node]
    if not isinstance(node, dict):
        return node
    if "hybrid" in node:
        return {"bool": {"should": [union_hybrid(v) for v in node["hybrid"]["queries"]], "minimum_should_match": 1}}
    return {key: union_hybrid(value) for key, value in node.items()}


def detach_inner_hits(node, projections):
    if isinstance(node, list):
        result = []
        for value in node:
            transformed = detach_inner_hits(value, projections)
            if transformed is not None:
                result.append(transformed)
        return result
    if not isinstance(node, dict):
        return node
    if "bool" in node:
        opts = node["bool"]
        should = opts.get("should", [])
        if not isinstance(should, list):
            should = [should]
        if any("match_all" in child for child in should) and any("inner_hits" in json.dumps(child) for child in should):
            projections.append(copy.deepcopy(node))
            return None
    return {key: detach_inner_hits(value, projections) for key, value in node.items()}


def experimental(body, system):
    """A separate experimental candidate, not an alternative production implementation."""
    if system not in SYSTEMS + EXTRA_SYSTEMS:
        raise ValueError("Unknown evaluation system: " + system)
    if system == "baseline":
        return copy.deepcopy(body)
    if system == "raw_boost1":
        return remove_root_vector_boost(body)
    out = copy.deepcopy(body)
    projections = []
    query = detach_inner_hits(out["query"], projections)
    if not projections:
        raise ValueError("Baseline inner-hit projection not found; review baseline revision")
    out["post_filter"] = projections[0]
    keyword = replace_hybrid(query, 0)
    vector = replace_hybrid(query, 1, keep_boost=system == "candidate_keep50_03_07")
    out["query"] = keyword if system == "keyword" else vector if system == "vector" else {"hybrid": {"queries": [keyword, vector]}}
    for key in ("aggs", "aggregations"):
        if key in out:
            matching = detach_inner_hits(out[key], [])
            if system == "keyword":
                out[key] = replace_hybrid(matching, 0)
            elif system == "vector":
                out[key] = replace_hybrid(matching, 1, keep_boost=False)
            else:
                out[key] = union_hybrid(matching)
    return out


def pipeline_body(weights):
    return {"phase_results_processors": [{"normalization-processor": {
        "normalization": {"technique": "min_max"},
        "combination": {"technique": "arithmetic_mean", "parameters": {"weights": weights}}
    }}]}


def hits(response, metadata):
    out = []
    for rank, hit in enumerate(response["hits"]["hits"], 1):
        identifier = hit["_id"]
        out.append({"id": identifier, "rank": rank, "score": hit.get("_score"), "metadata": metadata.get(identifier, {})})
    return out


def facet_counts(value):
    """Retain bucket/count evidence, not facet top_hits metadata or vectors."""
    if isinstance(value, list):
        return [facet_counts(item) for item in value]
    if not isinstance(value, dict):
        return value
    return {key: facet_counts(item) for key, item in value.items()
            if key not in ("hits", "_source", "queryContextVector", "distributions.queryContextVector")}


def response_receipt(response, **identity):
    signature = [{"id": hit["_id"], "rank": rank, "score": hit.get("_score")}
                 for rank, hit in enumerate(response.get("hits", {}).get("hits", []), 1)]
    return dict(identity, parsed_json_sha256=hashlib.sha256(
        json.dumps(response, sort_keys=True).encode()).hexdigest(), hits=signature,
        total_hits=response.get("hits", {}).get("total"),
        aggregations=facet_counts(response.get("aggregations")),
        timed_out=response.get("timed_out"), shards=response.get("_shards"), took=response.get("took"))


def rotation_order(query_id, systems):
    """Original per-query hash rotation, shared by legacy and exported sweeps."""
    rotation = int(hashlib.sha256(query_id.encode()).hexdigest()[:8], 16) % len(systems)
    return systems[rotation:] + systems[:rotation]


def measurement_order(order, repetition):
    offset = repetition % len(order)
    return order[offset:] + order[:offset]


def response_executor(args, ledger, receipt=response_receipt):
    """One timed request, one receipt; errors abort without retrying."""
    def execute(path, body, qid, system, phase, repetition, **extra_identity):
        identity = {"query_id": qid, "system": system, "phase": phase,
                    "warmup": phase == "warmup", "latency_scope": "local_warmed",
                    "seed": getattr(args, "seed", None), "repetition": repetition, "index": args.index,
                    "request_sha256": hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()}
        identity.update(extra_identity)
        identity["request_started_utc"] = datetime.now(timezone.utc).isoformat()
        start = time.perf_counter()
        try:
            response = request(args.engine_url, "POST", path, body)
        except Exception as error:
            identity["request_completed_utc"] = datetime.now(timezone.utc).isoformat()
            if ledger:
                with ledger.open("a", encoding="utf8") as stream:
                    stream.write(json.dumps(dict(identity, error_type=type(error).__name__, error=str(error)), sort_keys=True) + "\n")
            raise
        elapsed = (time.perf_counter() - start) * 1000
        identity["request_completed_utc"] = datetime.now(timezone.utc).isoformat()
        if ledger:
            with ledger.open("a", encoding="utf8") as stream:
                stream.write(json.dumps(receipt(response, elapsed_ms=elapsed, **identity), sort_keys=True) + "\n")
        if response.get("timed_out") or response.get("_shards", {}).get("failed"):
            raise ValueError("Incomplete search response")
        return response, elapsed
    return execute


def run(args):
    if not args.allow_local_writes:
        raise ValueError("Pass --allow-local-writes for owned evaluation pipelines")
    owned(args.index)
    systems = selected_systems(getattr(args, "systems", None))
    if args.depth < 1 or args.repetitions < 1:
        raise ValueError("Depth and repetitions must be positive")
    ledger = getattr(args, "raw_output", None)
    if ledger:
        ledger = pathlib.Path(ledger)
        ledger.parent.mkdir(parents=True, exist_ok=True)
        with ledger.open("x", encoding="utf8"):
            pass  # Never silently overwrite an earlier raw repetition ledger.

    execute = response_executor(args, ledger)

    pipeline_prefix = owned(args.index + "-pipeline")
    exports = load_jsonl(args.requests)
    metadata = {d["identifier"]: d for d in load_jsonl(args.corpus)}
    pipeline_names = {}
    for system in systems:
        if system in ("baseline", "raw_boost1") or system in WEIGHTS:
            pipeline_names[system] = pipeline_prefix + "-" + system.replace("_", "-")
            request(args.engine_url, "PUT", "/_search/pipeline/" + pipeline_names[system],
                    pipeline_body(WEIGHTS.get(system, [.3, .7])))
    rows = []
    requests_out = []
    for exported in exports:
        qid = exported["query_id"]
        body = exported.get("request", {}).get("body", exported.get("body"))
        if body is None:
            raise ValueError("Missing baseline exported body")
        if "hybrid" not in json.dumps(body["query"]):
            raise ValueError("Baseline request is not active hybrid")
        # Rotate order deterministically per task to reduce cold-cache/system order bias.
        order = rotation_order(qid, systems)
        entries = {}
        for system in order:
            current = experimental(body, system)
            current["size"] = args.depth
            pipeline = pipeline_names.get(system)
            path = "/" + args.index + "/_search" + ("?search_pipeline=" + pipeline if pipeline else "")
            execute(path, current, qid, system, "warmup", 0)  # excluded warmup
            entries[system] = {"body": current, "path": path, "pipeline": pipeline, "samples": [], "variants": set()}
        # Interleave configurations rather than measuring one system's full block first.
        for repetition in range(args.repetitions):
            for system in measurement_order(order, repetition):
                entry = entries[system]
                response, elapsed = execute(entry["path"], entry["body"], qid, system, "measured", repetition + 1)
                entry["samples"].append(elapsed)
                entry["response"] = response
                signature = [(h["_id"], h.get("_score")) for h in response["hits"]["hits"]]
                entry["variants"].add(hashlib.sha256(json.dumps(signature).encode()).hexdigest())
        for system in order:
            entry = entries[system]
            current, response, samples = entry["body"], entry["response"], entry["samples"]
            row = {"system": system, "query_id": qid, "seed": getattr(args, "seed", None),
                   "latency_scope": "local_warmed", "warmup": False, "hits": hits(response, metadata),
                   "latency_ms": statistics.median(samples), "latency_samples_ms": samples,
                   "ranking_score_variants": sorted(entry["variants"]),
                   "total_hits": response["hits"].get("total"), "aggregations": response.get("aggregations"),
                   "config": {"warmup_excluded": 1, "repetitions": args.repetitions,
                              "latency_scope": "local_warmed", "weights": WEIGHTS.get(system),
                              "index": args.index, "request_sha256": hashlib.sha256(json.dumps(current, sort_keys=True).encode()).hexdigest()}}
            rows.append(row)
            requests_out.append({"system": system, "query_id": qid, "body": current, "pipeline": entry["pipeline"]})
            print(qid, system, len(row["hits"]), round(row["latency_ms"], 2), flush=True)
    write_jsonl(args.output, rows)
    write_jsonl(args.output + ".requests.jsonl", requests_out)


# Labels describe actual Scala exports, never Python-generated ranking variants.
EXPORTED_VARIANTS = {"ms_050": .50, "ms_048": .48, "ms_046": .46, "ms_045": .45,
                     "ms_044": .44, "ms_042": .42, "ms_040": .40, "topk10diag": None}


def labelled_paths(values):
    result = {}
    for value in values or ():
        label, separator, path = value.partition("=")
        if not separator or label not in EXPORTED_VARIANTS or not path or label in result:
            raise ValueError("Expected unique allowlisted LABEL=path")
        result[label] = pathlib.Path(path)
    if not result:
        raise ValueError("At least one exported request set is required")
    return result


def export_response_receipt(response, **identity):
    """Hash full parsed JSON; retain hit scores and minimal actual child identity."""
    result = response_receipt(response, **identity)
    signatures = []

    def nested_identity(value):
        # Actual OpenSearch nested field/offset chains, not inferred child IDs.
        if not isinstance(value, dict):
            return None
        out = {key: value[key] for key in ("field", "offset") if key in value}
        if isinstance(value.get("_nested"), dict):
            out["_nested"] = nested_identity(value["_nested"])
        return out

    def hit_identity(hit, rank):
        out = {"id": hit.get("_id"), "rank": rank, "score": hit.get("_score")}
        if isinstance(hit.get("_nested"), dict):
            out["_nested"] = nested_identity(hit["_nested"])
        source = hit.get("_source")
        if isinstance(source, dict):
            fields = {key: source[key] for key in ("identifier", "distribution_id")
                      if key in source and isinstance(source[key], (str, int, float, bool, type(None)))}
            if fields:
                out["source_identity"] = fields
        return out

    def visit(value, path=()):
        if isinstance(value, dict):
            for key, item in value.items():
                if key == "hits" and isinstance(item, list):
                    signatures.append({"path": list(path + (key,)), "total_hits": value.get("total"),
                                       "max_score": value.get("max_score"), "hits": [
                        hit_identity(hit, rank) for rank, hit in enumerate(item, 1)]})
                if key != "_source":
                    visit(item, path + (key,))
        elif isinstance(value, list):
            for index, item in enumerate(value):
                visit(item, path + (index,))
    visit(response)
    result["all_hit_signatures"] = signatures
    result["full_response_body_stored"] = False
    return result


def run_export_sets(args, request_sets, *, config_paths=None, validate_request_sets=None):
    """Replay label->Scala JSONL path mappings without constructing production DSL.

    The higher-level threshold adapter owns family/split gating. Its external
    validator receives loaded rows and declared config paths, before any writes.
    Validation must check effective config hashes and complete DSL pair guards.
    """
    if not getattr(args, "raw_production_only", False):
        raise ValueError("Pass --raw-production-only for exported production replay")
    local_url(args.engine_url)
    owned(args.index)
    if type(args.depth) is not int or type(args.repetitions) is not int or args.depth < 1 or args.repetitions < 1:
        raise ValueError("Depth and repetitions must be positive integers")
    if not request_sets or any(label not in EXPORTED_VARIANTS for label in request_sets):
        raise ValueError("Unknown or empty exported variant set")
    systems = tuple(label for label in EXPORTED_VARIANTS if label in request_sets)
    source_paths = {label: pathlib.Path(request_sets[label]) for label in systems}
    exports = {label: load_jsonl(path) for label, path in source_paths.items()}
    by_id = {}
    query_ids = None
    for label, rows in exports.items():
        ids = [row.get("query_id") for row in rows]
        if not ids or any(not isinstance(qid, str) or not qid for qid in ids) or len(ids) != len(set(ids)):
            raise ValueError("Empty, missing or duplicate query ID in " + label)
        if query_ids is not None and set(ids) != set(query_ids):
            raise ValueError("All exported request sets must have the same query ID set")
        if query_ids is None:
            query_ids = ids
        by_id[label] = {row["query_id"]: row for row in rows}
    config_paths = {label: pathlib.Path(path) for label, path in (config_paths or {}).items()}
    if set(config_paths) != set(systems):
        raise ValueError("Declare exactly one config file per exported request set")
    if validate_request_sets is None:
        # Lazy import avoids an adapter/run.py circular dependency.
        spec = importlib.util.spec_from_file_location(
            "threshold_export_contract", pathlib.Path(__file__).parent / "threshold" / "export_contract.py")
        contract = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(contract)
        validate_request_sets = contract.validate_request_sets
    validation = validate_request_sets(exports, config_paths=config_paths)
    compact = getattr(args, "compact_output", True)
    metadata = ({d["identifier"]: d for d in load_jsonl(args.corpus)}
                if not compact and getattr(args, "corpus", None) else {})
    entries = {}
    sources = {label: {"source_path": str(source_paths[label]), "source_sha256": sha(source_paths[label]),
                       "config_path": str(config_paths[label]), "config_file_sha256": sha(config_paths[label])}
               for label in systems}
    provenance = [{"kind": "export_set_validation", "sources": sources, "validation": validation}]
    for qid in query_ids:
        for label in systems:
            exported = by_id[label][qid]
            original = exported.get("request", {})
            if original.get("method") != "POST" or not isinstance(original.get("body"), dict):
                raise ValueError("Expected complete Scala POST search request")
            body = original["body"]
            if body.get("size") != args.depth:
                raise ValueError("Exported size must equal replay depth; re-export, never rewrite DSL")
            params = copy.deepcopy(original.get("query_params", {}))
            if not isinstance(params, dict) or any(not isinstance(k, str) or not isinstance(v, str) for k, v in params.items()):
                raise ValueError("Scala query_params must be a string mapping")
            source_pipeline = params.get("search_pipeline")
            if source_pipeline not in (None, "_none", "magda-datasets-hybrid-search") or "search_pipeline" in body:
                raise ValueError("Unexpected exported production pipeline")
            # Explicit raw mode bypasses the known production NOP pipeline. The
            # higher-level adapter must gate execution on an engine parity receipt.
            params["search_pipeline"] = "_none"  # Never inherit an index default pipeline.
            path = "/" + args.index + "/_search?" + urllib.parse.urlencode(params)
            request_hash = hashlib.sha256(json.dumps(original, sort_keys=True, ensure_ascii=False,
                                                       allow_nan=False, separators=(",", ":")).encode("utf8")).hexdigest()
            entries[qid, label] = {"body": body, "path": path, "samples": [], "variants": set(),
                                   "export_request_sha256": request_hash}
            provenance.append({"kind": "exported_request", "system": label, "query_id": qid, "export": exported,
                               "export_request_sha256": request_hash, "replay_path": path,
                               "replay_body_sha256": hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest(),
                               "source_search_pipeline": source_pipeline, "replay_search_pipeline": "_none",
                               "pipeline_override_reason": "explicit raw-production-only; adapter owns engine parity gate",
                               "pipeline": None})
    output = pathlib.Path(args.output)
    ledger = pathlib.Path(getattr(args, "raw_output", None) or str(output) + ".repetitions.jsonl")
    provenance_path = pathlib.Path(str(output) + ".requests.jsonl")
    targets = (output, ledger, provenance_path)
    resolved = [path.resolve() for path in targets]
    inputs = {path.resolve() for path in (*source_paths.values(), *config_paths.values())}
    if getattr(args, "corpus", None):
        inputs.add(pathlib.Path(args.corpus).resolve())
    if len(set(resolved)) != len(resolved) or any(path in inputs for path in resolved):
        raise ValueError("Replay artifact paths must be distinct and must not overwrite inputs")
    if any(path.exists() for path in targets):
        raise FileExistsError("Refusing to overwrite an existing replay artifact")
    for path in targets:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("x", encoding="utf8"):
            pass
    write_jsonl(provenance_path, provenance)
    execute = response_executor(args, ledger, receipt=export_response_receipt)
    rows = []
    for qid in query_ids:
        order = rotation_order(qid, systems)
        for label in order:
            entry = entries[qid, label]
            execute(entry["path"], entry["body"], qid, label, "warmup", 0,
                    export_request_sha256=entry["export_request_sha256"])
        for repetition in range(args.repetitions):
            for label in measurement_order(order, repetition):
                entry = entries[qid, label]
                response, elapsed = execute(entry["path"], entry["body"], qid, label, "measured", repetition + 1,
                                            export_request_sha256=entry["export_request_sha256"])
                entry["samples"].append(elapsed)
                entry["response"] = response
                signature = [(hit["_id"], hit.get("_score")) for hit in response["hits"]["hits"]]
                entry["variants"].add(hashlib.sha256(json.dumps(signature).encode()).hexdigest())
        for label in order:
            entry = entries[qid, label]
            response, samples = entry.pop("response"), entry["samples"]
            ranked = hits(response, {} if compact else metadata)
            if compact:
                for hit in ranked:
                    hit.pop("metadata")
            rows.append({"system": label, "query_id": qid, "seed": getattr(args, "seed", None),
                         "latency_scope": "local_warmed", "warmup": False, "hits": ranked,
                         "latency_ms": statistics.median(samples), "latency_samples_ms": samples,
                         "ranking_score_variants": sorted(entry["variants"]),
                         "repeat_instability": len(entry["variants"]) > 1,
                         "total_hits": response["hits"].get("total"), "shards": response.get("_shards"),
                         "timed_out": response.get("timed_out"), "took": response.get("took"),
                         "aggregations": facet_counts(response.get("aggregations")) if compact else response.get("aggregations"),
                         "config": {"warmup_excluded": 1, "repetitions": args.repetitions,
                                    "latency_scope": "local_warmed", "index": args.index,
                                    "raw_production_only": True, "compact_output": compact,
                                    "export_request_sha256": entry["export_request_sha256"]}})
    write_jsonl(output, rows)
    return rows


def run_exports(args):
    return run_export_sets(args, labelled_paths(args.request_set), config_paths=labelled_paths(args.config_set))


def parser():
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="command", required=True)
    a = sub.add_parser("prepare")
    for name in ("corpus", "queries", "cache", "output-corpus", "output-queries"):
        a.add_argument("--" + name, required=True)
    a.add_argument("--embedding-url", type=local_url, required=True)
    a.add_argument("--batch-size", type=int, default=8)
    a.set_defaults(func=prepare)
    a = sub.add_parser("install")
    a.add_argument("--engine-url", type=local_url, required=True)
    for name in ("index", "mapping", "corpus"):
        a.add_argument("--" + name, required=True)
    a.add_argument("--allow-local-writes", action="store_true")
    a.set_defaults(func=install)
    a = sub.add_parser("run")
    a.add_argument("--engine-url", type=local_url, required=True)
    for name in ("index", "requests", "corpus", "output"):
        a.add_argument("--" + name, required=True)
    a.add_argument("--depth", type=int, default=10)
    a.add_argument("--repetitions", type=int, default=3)
    a.add_argument("--systems", type=selected_systems, default=None,
                   help="Explicit fixed system names, comma-separated or a JSON list; default remains seven")
    a.add_argument("--raw-output", help="New JSONL ledger of every warmup/measured response receipt")
    a.add_argument("--allow-local-writes", action="store_true")
    a.set_defaults(func=run)
    a = sub.add_parser("run-exports", help="Raw-only replay of actual Scala-exported request sets")
    a.add_argument("--engine-url", type=local_url, required=True)
    for name in ("index", "output"):
        a.add_argument("--" + name, required=True)
    a.add_argument("--request-set", action="append", required=True, metavar="LABEL=path")
    a.add_argument("--config-set", action="append", required=True, metavar="LABEL=path",
                   help="Explicit effective-config export for each request label")
    a.add_argument("--corpus", help="Optional metadata source for --no-compact-output")
    a.add_argument("--depth", type=int, default=10)
    a.add_argument("--repetitions", type=int, default=10)
    a.add_argument("--seed", type=int, default=0, help="Recorded context; query hash rotation remains unchanged")
    a.add_argument("--raw-output", help="New repetition ledger (default: OUTPUT.repetitions.jsonl)")
    a.add_argument("--raw-production-only", action="store_true", required=True)
    a.add_argument("--compact-output", action=argparse.BooleanOptionalAction, default=True,
                   help="Omit hit metadata and facet top_hits payloads (default: enabled)")
    a.set_defaults(func=run_exports)
    return p


if __name__ == "__main__":
    args = parser().parse_args()
    args.func(args)
