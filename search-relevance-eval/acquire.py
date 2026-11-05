#!/usr/bin/env python3
"""Anonymous public-metadata acquisition; never downloads distribution content.

Uses raw HTTP because curated mgd commands have no bulk Registry cursor support.
The curl transport avoids the system Python TLS incompatibility on some hosts.
Run: python3 search-relevance-eval/acquire.py --size 500
Reuse the same --data-root to resume cached requests; --refresh starts a new cache.
Only feasibility.json is written in git; all raw/indexed metadata stays in /tmp.
"""
import argparse
import collections
import datetime as dt
import email.utils
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.parse

BASE = "https://dev.magda.io/api"
DEFAULT_ROOT = "/tmp/magda-3901-data"


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encode(value):
    return (json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")) + "\n").encode()


def immutable(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("xb") as out:
            out.write(data)
        path.chmod(0o444)
    except FileExistsError:
        if path.read_bytes() != data:
            raise ValueError("Immutable file mismatch: " + str(path))
    return {"path": str(path.resolve()), "sha256": digest(data), "bytes": len(data)}


class AnonymousGET:
    """Allowlisted, credential-free, verified-TLS GET transport with shared throttling.

    Request starts are >= interval seconds apart (including retries). A cache hit
    performs no network access; bodies and their acquisition receipts are hashed.
    No redirect following, curl config, cookies, netrc, or Authorization headers.
    """
    def __init__(self, root, interval=0.75, retries=5):
        if not math.isfinite(interval) or interval < 0.5:
            raise ValueError("interval must be finite and >= 0.5 (at most 2 req/sec)")
        self.root = Path(root)
        self.interval = interval
        self.retries = retries
        self.last_start = -float("inf")
        self.requests = 0
        self.cache_hits = 0
        self.root.mkdir(parents=True, exist_ok=True)

    def throttle(self):
        # Shared across resumed/refreshed caches and cooperating processes. Hold
        # the advisory lock only while reserving a request start, not over HTTP.
        with (self.root.parent / ".request-start.lock").open("a+") as lock:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
            lock.seek(0)
            previous = lock.read().strip()
            previous = float(previous) if previous else 0.0
            if not math.isfinite(previous) or previous > time.time() + 60:
                raise ValueError("Invalid shared request clock")
            time.sleep(max(0, self.interval - (time.time() - previous)))
            lock.seek(0)
            lock.truncate()
            lock.write(str(time.time()))
            lock.flush()
            self.last_start = time.monotonic()

    def get(self, path, params=None, json_body=True):
        allowed = {"/v0/registry/records": {"aspect", "limit", "pageToken"},
                   "/v0/search/datasets": {"query", "limit", "publishingState", "publisher"},
                   "/v0/search/status/live": set()}
        if path not in allowed or set(params or {}) - allowed[path]:
            raise ValueError("Endpoint or query parameter not allowlisted")
        if path == "/v0/registry/records" and (params or {}).get("aspect") != "dcat-dataset-strings":
            raise ValueError("Only public dataset-string metadata inventory is permitted")
        if path == "/v0/search/datasets" and (params or {}).get("publishingState") != "published":
            raise ValueError("Search acquisition must explicitly filter published records")
        if "limit" in (params or {}):
            limit = int(params["limit"])
            if limit < 1 or limit > (1000 if path == "/v0/registry/records" else 10):
                raise ValueError("Acquisition page limit exceeds courtesy bound")
        url = BASE + path
        if params:
            url += "?" + urllib.parse.urlencode(sorted(params.items()))
        key = digest(url.encode())
        receipt_path = self.root / "requests" / (key + ".json")
        if receipt_path.exists():
            receipt = json.loads(receipt_path.read_text())
            body = (self.root / "objects" / (receipt["sha256"] + ".body")).read_bytes()
            if digest(body) != receipt["sha256"] or receipt["url"] != url:
                raise ValueError("Corrupt request cache")
            self.cache_hits += 1
            return (json.loads(body) if json_body else body.decode()), receipt
        error = None
        for attempt in range(self.retries + 1):
            self.throttle()
            self.requests += 1
            started = now()
            # Header tempfile stays outside git. No shell interpolation is used.
            with tempfile.TemporaryDirectory(dir=str(self.root)) as temp:
                headers_path = Path(temp) / "headers"
                cmd = ["curl", "--disable", "--silent", "--show-error", "--proto", "=https",
                       "--request", "GET", "--max-redirs", "0", "--connect-timeout", "20",
                       "--max-time", "90", "--header", "Accept: application/json" if json_body else "Accept: text/plain",
                       "--user-agent", "Magda-Issue3901-public-metadata-eval/1.0",
                       "--dump-header", str(headers_path), "--write-out", "\n%{http_code}", url]
                # Never inherit MAGDA, curl, proxy, or credential environment variables.
                proc = subprocess.run(cmd, capture_output=True, env={"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "LC_ALL": "C"})
                headers = headers_path.read_text(errors="replace") if headers_path.exists() else ""
            try:
                body, status_bytes = proc.stdout.rsplit(b"\n", 1)
                status = int(status_bytes)
            except (ValueError, TypeError):
                body, status = proc.stdout, 0
            event = {"url": url, "method": "GET", "started_at": started, "finished_at": now(),
                     "status": status, "curl_exit": proc.returncode, "attempt": attempt + 1,
                     "sha256": digest(body), "bytes": len(body)}
            with (self.root / "http-attempts.jsonl").open("ab") as log:
                log.write(encode(event))
            if proc.returncode == 0 and status == 200:
                if json_body:
                    json.loads(body)  # Reject malformed success before caching.
                immutable(self.root / "objects" / (digest(body) + ".body"), body)
                event["response_headers"] = headers
                immutable(receipt_path, encode(event))
                return (json.loads(body) if json_body else body.decode()), event
            error = RuntimeError("GET failed: status=%s curl=%s url=%s" % (status, proc.returncode, url))
            if status not in {0, 408, 425, 429, 500, 502, 503, 504}:
                raise error
            delay = min(60, 2 ** attempt)
            for line in headers.splitlines():
                if line.lower().startswith("retry-after:"):
                    value = line.split(":", 1)[1].strip()
                    try:
                        delay = max(delay, float(value))
                    except ValueError:
                        try:
                            delay = max(delay, email.utils.parsedate_to_datetime(value).timestamp() - time.time())
                        except (ValueError, TypeError):
                            pass
            if attempt < self.retries:
                time.sleep(delay)
        raise error


def publisher(record):
    value = record.get("aspects", {}).get("dcat-dataset-strings", {}).get("publisher")
    if isinstance(value, dict):
        value = value.get("name") or value.get("identifier")
    return str(value).strip() if value else "<missing>"


def select(records, size, seed):
    """Half equal-publisher allocation, half uniform; hash ordering is deterministic."""
    def rank(identifier, domain="record"):
        return digest((seed + "\0" + domain + "\0" + identifier).encode())
    groups = collections.defaultdict(list)
    for record in records.values():
        groups[publisher(record)].append(record["id"])
    for ids in groups.values():
        ids.sort(key=rank)
    group_order = sorted(groups, key=lambda p: rank(p, "publisher"))
    selected = []
    quota = collections.Counter()
    while len(selected) < min(size // 2, len(records)):
        added = False
        for pub in group_order:
            pos = quota[pub]
            if pos < len(groups[pub]):
                selected.append(groups[pub][pos])
                quota[pub] += 1
                added = True
                if len(selected) == size // 2:
                    break
        if not added:
            break
    chosen = set(selected)
    uniform = sorted((rid for rid in records if rid not in chosen), key=lambda rid: rank(rid, "uniform"))
    selected += uniform[:max(0, size - len(selected))]
    return selected, {p: {"inventory": len(groups[p]), "stratified_quota": quota[p],
                          "selected_total": sum(publisher(records[rid]) == p for rid in selected)}
                      for p in sorted(groups)}


def metadata_projection(dataset):
    """Blind task-author view: no score, quality, context, vectors or retrieval ranks."""
    keys = ("identifier", "title", "description", "publisher", "temporal", "spatial", "keywords", "themes", "issued", "modified", "landingPage")
    projected = {key: dataset[key] for key in keys if key in dataset}
    projected["distributions"] = [{key: dist[key] for key in ("identifier", "title", "description", "format", "mediaType", "downloadURL", "accessURL", "license") if key in dist}
                                    for dist in dataset.get("distributions", []) or []]
    return projected


def coverage(datasets):
    fields = sorted({key for dataset in datasets for key in dataset})
    def field_counts(rows, names):
        return {key: {"present": sum(key in d for d in rows),
                      "non_null": sum(d.get(key) is not None for d in rows),
                      "non_empty": sum(d.get(key) not in (None, "", [], {}) for d in rows)} for key in names}
    counts = field_counts(datasets, fields)
    distributions = [x for d in datasets for x in d.get("distributions", []) or []]
    distribution_fields = sorted({key for distribution in distributions for key in distribution})
    return {"dataset_fields": counts, "distribution_fields": field_counts(distributions, distribution_fields), "distributions": len(distributions),
            "datasets_with_distributions": sum(bool(d.get("distributions")) for d in datasets),
            "distribution_query_context_nonempty": sum(bool(d.get("queryContext")) for d in distributions),
            "distribution_vector_nonnull": sum(d.get("queryContextVector") is not None for d in distributions),
            "distribution_duplicate_id_occurrences": len(distributions) - len({d.get("identifier") for d in distributions}),
            "publisher_names_nonempty": len({str((d.get("publisher") or {}).get("name", "")).strip() for d in datasets} - {""}),
            "publisher_objects_including_null": len({json.dumps(d.get("publisher"), sort_keys=True) for d in datasets})}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", default=DEFAULT_ROOT)
    parser.add_argument("--manifest", default="search-relevance-eval/results/pilot/feasibility.json")
    parser.add_argument("--size", type=int, default=500)
    parser.add_argument("--seed", default="issue3901-pilot-v1")
    parser.add_argument("--interval", type=float, default=0.75)
    parser.add_argument("--max-pages", type=int, default=1000, help="Safety cutoff, explicitly reported if reached")
    parser.add_argument("--refresh", action="store_true", help="Use a new dated HTTP cache rather than resume")
    args = parser.parse_args()
    root = Path(args.data_root).resolve()
    allowed_root = Path(DEFAULT_ROOT).resolve()
    if root != allowed_root and allowed_root not in root.parents:
        parser.error("bulk data root must be under " + DEFAULT_ROOT)
    if not 1 <= args.size <= 1200 or not 1 <= args.max_pages <= 10000:
        parser.error("size must be 1..1200 and max-pages 1..10000")
    root.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    run = root / ("run-" + stamp)
    run.mkdir()
    client = AnonymousGET(root / ("cache-" + stamp if args.refresh else "cache"), args.interval)
    manifest_path = Path(args.manifest)
    # Only this manifest is permitted inside the repository by this utility.
    expected_manifest = Path(__file__).resolve().parent / "results/pilot/feasibility.json"
    if manifest_path.resolve() != expected_manifest:
        parser.error("manifest must be " + str(expected_manifest))
    manifest = {"schema_version": 1, "issue": 3901, "status": "running", "started_at": now(),
                "base_url": BASE, "anonymous": True, "http_method": "GET", "content_downloads": False,
                "source_commits_live": "unknown", "live_embedding_model": "unknown",
                "transport": "raw HTTP via curl; curated CLI has no bulk Registry cursor",
                "request_start_interval_seconds": args.interval, "max_requests_per_second": 1 / args.interval,
                "run_directory": str(run), "cache_directory": str(client.root),
                "limitations": ["Public anonymous deployment only, not production representative.",
                                "Live Registry pagination is not a transactional point-in-time snapshot.",
                                "Inventory covers public Registry dcat-dataset-strings records, not necessarily every indexed Search document.",
                                "Metadata-title lookup can miss duplicate/common titles outside top 10; skipped IDs are not replaced.",
                                "Stratified oversampling changes publisher prevalence; not a self-weighting sample.",
                                "Search lookup is retrieval only: only exact presampled identifiers are retained.",
                                "Null and empty indexed fields, including vectors, are preserved without trimming.",
                                "Source commits and live model/config are unverifiable and unknown."]}
    def checkpoint():
        manifest["updated_at"] = now()
        manifest["network_requests"] = client.requests
        manifest["cache_hits"] = client.cache_hits
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(manifest, sort_keys=True, ensure_ascii=False, indent=2) + "\n")
    try:
        live, receipt = client.get("/v0/search/status/live", json_body=False)
        manifest["public_liveness"] = {"value": live, "receipt": receipt}
        manifest["readiness_probe"] = "not called by this acquisition utility: documented ready GET can create a search pipeline"
        records, pages, seen_tokens = {}, [], set()
        token = None
        duplicates = 0
        has_more = True
        for page in range(args.max_pages):
            params = {"aspect": "dcat-dataset-strings", "limit": 1000}
            if token is not None:
                params["pageToken"] = token
            data, receipt = client.get("/v0/registry/records", params)
            rows = data.get("records")
            if not isinstance(rows, list) or not isinstance(data.get("hasMore"), bool):
                raise ValueError("Invalid Registry page envelope")
            pages.append(receipt)
            for record in rows:
                rid = record.get("id")
                if not rid:
                    raise ValueError("Registry record has no ID")
                if rid in records:
                    duplicates += 1
                else:
                    records[rid] = record
            has_more = data["hasMore"]
            manifest["inventory"] = {"unique_records": len(records), "pages": len(pages), "duplicates": duplicates,
                                     "complete": not has_more, "last_page_token": token,
                                     "next_page_token": data.get("nextPageToken"), "cutoff_pages": args.max_pages}
            checkpoint()
            print(json.dumps({"phase": "inventory", **manifest["inventory"]}), flush=True)
            if not has_more:
                break
            token = data.get("nextPageToken")
            if token is None or str(token) in seen_tokens:
                raise ValueError("Registry cursor missing or repeated")
            seen_tokens.add(str(token))
        manifest["inventory"].update({"scope": "anonymous Registry records with dcat-dataset-strings aspect", "page_size": 1000,
                                      "first_page_fetched_at": pages[0]["started_at"] if pages else None,
                                      "last_page_fetched_at": pages[-1]["finished_at"] if pages else None,
                                      "source_cutoff": "terminal cursor" if not has_more else "max-pages safety cutoff"})
        inventory_body = b"".join(encode(records[rid]) for rid in sorted(records))
        manifest["inventory"]["snapshot"] = immutable(run / "inventory.jsonl", inventory_body)
        del inventory_body
        manifest["inventory"]["page_receipts"] = immutable(run / "inventory-page-receipts.json", encode(pages))
        selected, strata = select(records, args.size, args.seed)
        selection = {"seed": args.seed, "algorithm": "SHA256(seed + NUL + domain + NUL + ID); equal-publisher round-robin half, uniform remainder half",
                     "requested": args.size, "selected": len(selected), "strata": strata, "ids": selected,
                     "selection_input": "anonymous Registry metadata only; independent of information needs, queries, scores and relevance"}
        manifest["selection"] = immutable(run / "selection.json", encode(selection))
        manifest["selection"].update({"seed": args.seed, "requested": args.size, "selected": len(selected),
                                      "publisher_strata": len(strata), "publishers_selected": sum(s["selected_total"] > 0 for s in strata.values())})
        selected_metadata = [{"identifier": rid, **records[rid].get("aspects", {}).get("dcat-dataset-strings", {})} for rid in selected]
        manifest["selected_inventory_metadata"] = immutable(run / "selected-inventory-metadata.jsonl", b"".join(encode(metadata_projection(d)) for d in selected_metadata))
        manifest["lookup_protocol"] = {"order": ["quoted metadata title", "quoted metadata title plus Registry publisher filter", "bare identifier"],
                                       "limit_per_lookup": 10, "publishingState": "published", "acceptance": "exact identifier equality only", "missing_policy": "skip, no output-driven replacements"}
        checkpoint()
        print(json.dumps({"phase": "selection", "selection": manifest["selection"], "metadata": manifest["selected_inventory_metadata"]}), flush=True)
        datasets, missing, lookup_receipts = [], [], []
        for index, rid in enumerate(selected):
            title = records[rid].get("aspects", {}).get("dcat-dataset-strings", {}).get("title")
            # Checked-in Search source gives identifier zero keyword boost; live
            # bare-ID probes missed known public records in the first 10 matches.
            # A quoted metadata title is a lookup key, NEVER a selection query.
            quoted_title = ('"' + str(title).replace('\\', '\\\\').replace('"', '\\"') + '"') if title else None
            queries = [{"query": quoted_title or rid, "limit": 10, "publishingState": "published"}]
            pub = publisher(records[rid])
            if quoted_title and pub != "<missing>":
                queries.append({"query": quoted_title, "publisher": pub, "limit": 10, "publishingState": "published"})
            if quoted_title:
                queries.append({"query": rid, "limit": 10, "publishingState": "published"})
            matches = []
            for query in queries:
                data, receipt = client.get("/v0/search/datasets", query)
                lookup_receipts.append({"requested_id": rid, "lookup_kind": "metadata_title" if query["query"] == quoted_title else "identifier", **receipt})
                matches = [d for d in data.get("dataSets", []) if d.get("identifier") == rid]
                if matches:
                    break
            if len(matches) == 1:
                dataset = matches[0]
                if dataset.get("publishingState") not in (None, "published"):
                    raise ValueError("Nonpublished dataset returned despite published filter")
                datasets.append(dataset)
            elif not matches:
                missing.append({"id": rid, "reason": "no exact identifier among 10 public published search lookup results", "hitCount": data.get("hitCount")})
            else:
                raise ValueError("Duplicate exact indexed identifier " + rid)
            manifest["lookup"] = {"attempted": index + 1, "retained": len(datasets), "skipped_public_missing": missing}
            checkpoint()
            if (index + 1) % 25 == 0:
                blind = immutable(run / ("indexed-metadata-%04d.jsonl" % (index + 1)), b"".join(encode(metadata_projection(d)) for d in datasets))
                manifest["indexed_metadata_progress"] = blind
                checkpoint()
                print(json.dumps({"phase": "lookup", "attempted": index + 1, "retained": len(datasets), "missing": len(missing), "blind_metadata": blind}), flush=True)
        manifest["corpus"] = immutable(run / "corpus.jsonl", b"".join(encode(d) for d in datasets))
        manifest["blind_metadata"] = immutable(run / "indexed-metadata.jsonl", b"".join(encode(metadata_projection(d)) for d in datasets))
        manifest["lookup_receipts"] = immutable(run / "lookup-receipts.json", encode(lookup_receipts))
        manifest["coverage"] = coverage(datasets)
        manifest["corpus_duplicate_ids"] = len(datasets) - len({d["identifier"] for d in datasets})
        audit_path = client.root / "http-attempts.jsonl"
        if audit_path.exists():
            audit_body = audit_path.read_bytes()
            attempts = [json.loads(line) for line in audit_body.splitlines()]
            starts = [dt.datetime.fromisoformat(event["started_at"]).timestamp() for event in attempts]
            manifest["cache_http_audit"] = immutable(run / "http-attempts.jsonl", audit_body)
            manifest["cache_http_audit"].update({"attempts": len(attempts), "methods": sorted({event["method"] for event in attempts}),
                                                "status_counts": dict(collections.Counter(str(event["status"]) for event in attempts)),
                                                "min_request_start_interval_seconds": min((b - a for a, b in zip(starts, starts[1:])), default=None),
                                                "note": "All acquisition-client network attempts across cache resumes; standalone initial probes are separate."})
        manifest["implementation"] = immutable(run / "acquire.py", Path(__file__).read_bytes())
        manifest["status"] = "complete" if not has_more else "complete_with_inventory_cutoff"
        if has_more:
            manifest["limitations"].append("Full inventory cutoff reached: prefix/cursor coverage bias; not full catalogue.")
        manifest["finished_at"] = now()
        manifest["acquisition_mode"] = "frozen cache replay" if client.requests == 0 else "network acquisition with immutable cache resume"
        checkpoint()
        immutable(run / "acquisition-manifest.json", encode(manifest))
        print(json.dumps({"phase": "complete", "manifest": str(manifest_path), "corpus": manifest["corpus"], "coverage": manifest["coverage"]}), flush=True)
    except BaseException as exc:
        manifest["status"] = "failed"
        manifest["error"] = str(exc)
        checkpoint()
        raise


if __name__ == "__main__":
    main()
