#!/usr/bin/env python3
"""Evaluation-only local replay. Never imports or changes production ranking code.

Baseline JSON comes from ExportBaselineRequests.scala on the pinned Magda commit.
Experimental transformations below are deliberately confined to this directory.
"""
import argparse
import copy
import hashlib
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
PREFIX = "magda-relevance-eval-"


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


def embed_texts(endpoint, texts, cache, batch_size=8):
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
        result = request(endpoint, "POST", "/v1/embeddings", {"input": [v for _, v in group]})
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
    vectors = embed_texts(local_url(args.embedding_url), texts, pathlib.Path(args.cache), args.batch_size)
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
    if system == "baseline":
        return copy.deepcopy(body)
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


def run(args):
    if not args.allow_local_writes:
        raise ValueError("Pass --allow-local-writes for owned evaluation pipelines")
    owned(args.index)
    pipeline_prefix = owned(args.index + "-pipeline")
    exports = load_jsonl(args.requests)
    metadata = {d["identifier"]: d for d in load_jsonl(args.corpus)}
    pipeline_names = {}
    pipeline_names["baseline"] = pipeline_prefix + "-baseline"
    request(args.engine_url, "PUT", "/_search/pipeline/" + pipeline_names["baseline"], pipeline_body([.3, .7]))
    for system, weights in WEIGHTS.items():
        pipeline_names[system] = pipeline_prefix + "-" + system.replace("_", "-")
        request(args.engine_url, "PUT", "/_search/pipeline/" + pipeline_names[system], pipeline_body(weights))
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
        rotation = int(hashlib.sha256(qid.encode()).hexdigest()[:8], 16) % len(SYSTEMS)
        order = SYSTEMS[rotation:] + SYSTEMS[:rotation]
        entries = {}
        for system in order:
            current = experimental(body, system)
            current["size"] = args.depth
            pipeline = pipeline_names.get(system)
            path = "/" + args.index + "/_search" + ("?search_pipeline=" + pipeline if pipeline else "")
            request(args.engine_url, "POST", path, current)  # one excluded warmup per system
            entries[system] = {"body": current, "path": path, "pipeline": pipeline, "samples": [], "variants": set()}
        # Interleave configurations rather than measuring one system's full block first.
        for repetition in range(args.repetitions):
            offset = repetition % len(order)
            for system in order[offset:] + order[:offset]:
                entry = entries[system]
                start = time.perf_counter()
                response = request(args.engine_url, "POST", entry["path"], entry["body"])
                entry["samples"].append((time.perf_counter() - start) * 1000)
                if response.get("timed_out") or response.get("_shards", {}).get("failed"):
                    raise ValueError("Incomplete search response")
                entry["response"] = response
                signature = [(h["_id"], h.get("_score")) for h in response["hits"]["hits"]]
                entry["variants"].add(hashlib.sha256(json.dumps(signature).encode()).hexdigest())
        for system in order:
            entry = entries[system]
            current, response, samples = entry["body"], entry["response"], entry["samples"]
            row = {"system": system, "query_id": qid, "hits": hits(response, metadata),
                   "latency_ms": statistics.median(samples), "latency_samples_ms": samples,
                   "ranking_score_variants": sorted(entry["variants"]),
                   "total_hits": response["hits"].get("total"), "aggregations": response.get("aggregations"),
                   "config": {"warmup_excluded": 1, "repetitions": args.repetitions, "weights": WEIGHTS.get(system),
                              "index": args.index, "request_sha256": hashlib.sha256(json.dumps(current, sort_keys=True).encode()).hexdigest()}}
            rows.append(row)
            requests_out.append({"system": system, "query_id": qid, "body": current, "pipeline": entry["pipeline"]})
            print(qid, system, len(row["hits"]), round(row["latency_ms"], 2), flush=True)
    write_jsonl(args.output, rows)
    write_jsonl(args.output + ".requests.jsonl", requests_out)


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
    a.add_argument("--allow-local-writes", action="store_true")
    a.set_defaults(func=run)
    return p


if __name__ == "__main__":
    args = parser().parse_args()
    args.func(args)
