#!/usr/bin/env python3
"""Local-only objective controls for run.py; not a production/OPA implementation.

Uses the actual Scala-exported unfiltered request and mapping. Fixture-only changes:
query text/vector, result window, and a translated synthetic ownerId != 'hidden'
predicate in every tenant-based root/child filter group (including inner_hits).
The production projection intentionally has no child publishing-state filter:
visible tenant-0 draft siblings may be projected, but cannot qualify a parent.
"""
import argparse
import copy
import importlib.util
import ipaddress
import json
import math
import pathlib
import re
import urllib.error
import urllib.parse
import urllib.request
import uuid

_spec = importlib.util.spec_from_file_location("relevance_replay", pathlib.Path(__file__).with_name("run.py"))
replay = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(replay)
PREFIX = "magda-relevance-eval-controls-"
RESOURCE = re.compile(re.escape(PREFIX) + r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-(eligibility|fusion|keyword-heavy|vector-heavy)\Z")
SYSTEMS = replay.SYSTEMS
BEST = [0.0, 0.0, 0.0]
FAR = [10.0, 10.0, 10.0]
FORMAT_SYSTEMS = tuple(system for system in SYSTEMS if system not in ("keyword", "vector"))
FORMATS = ("CSV", "magda-fixture-unavailable-format")
FORMAT_ROOTS = {"visible-child", "siblings", "root-only-hidden-child", "metadata-hidden-match-visible-sibling"}


def local_url(value):
    parsed = urllib.parse.urlsplit(value)
    try:
        local = parsed.hostname == "localhost" or ipaddress.ip_address(parsed.hostname).is_loopback
    except (ValueError, TypeError):
        local = False
    if (parsed.scheme != "http" or not local or parsed.username or parsed.password
            or parsed.path not in ("", "/") or parsed.query or parsed.fragment):
        raise ValueError("Controls require an explicit loopback HTTP engine origin")
    _ = parsed.port  # Reject malformed ports before any network access.
    return value.rstrip("/")


def owned(name):
    if not RESOURCE.fullmatch(name):
        raise ValueError("Resource must use controls prefix, UUIDv4, and an approved suffix")
    return name


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Redirects are forbidden by local-only controls")


def request(base, method, path, body=None, content_type="application/json"):
    """No environment proxies or redirects, including redirects to public hosts."""
    base = local_url(base)
    data = body.encode() if isinstance(body, str) else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(base + path, data=data, method=method,
                                 headers={"Content-Type": content_type})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(req, timeout=180) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"{method} {path}: {error.code} {error.read().decode()[:3000]}") from error


def nodes(value, key):
    if isinstance(value, list):
        return [item for child in value for item in nodes(child, key)]
    if not isinstance(value, dict):
        return []
    return ([value[key]] if key in value else []) + [item for child in value.values() for item in nodes(child, key)]


def inject_auth(value):
    """Translate one synthetic decision, NOT a real OPA policy evaluation.

    Attach at the bool group directly containing a tenant term, not at an outer
    wrapper; this covers lexical matching, vector matching, facet filters and
    the optional child projection without making the projection mandatory.
    """
    counts = {"root": 0, "child": 0}
    seen = set()

    def visit(node):
        if isinstance(node, list):
            for child in node:
                visit(child)
        elif isinstance(node, dict):
            for child in list(node.values()):
                visit(child)
            opts = node.get("bool", {})
            for clause in ("filter", "must"):
                entries = opts.get(clause, [])
                if isinstance(entries, dict):
                    entries = [entries]
                for field, kind in (("tenantId", "root"), ("distributions.tenantId", "child")):
                    if any(field in entry.get("term", {}) for entry in entries):
                        seen.add(kind)
                        prefix = "distributions." if kind == "child" else ""
                        predicate = {"bool": {"must_not": [{"term": {prefix + "accessControl.ownerId": "hidden"}}]}}
                        filters = opts.setdefault("filter", [])
                        if isinstance(filters, dict):
                            filters = opts["filter"] = [filters]
                        if predicate not in filters:
                            filters.append(predicate)
                            counts[kind] += 1
    visit(value)
    if seen != {"root", "child"}:
        raise ValueError("Export lacks required tenant-based root/child filter groups")
    return counts


def select_export(rows):
    selected = [row for row in rows if row.get("query_id") == "smoke-unfiltered"]
    if len(selected) != 1:
        raise ValueError("Require exactly one Scala smoke-unfiltered production export; never silently replace filters")
    row = selected[0]
    assumptions = row.get("public_corpus_assumptions", {})
    if assumptions.get("tenant_id") != 0 or assumptions.get("publishing_state") != "published":
        raise ValueError("Require public tenant 0 / published smoke export")
    body = row.get("request", {}).get("body")
    if not body or not nodes(body.get("query"), "hybrid") or not nodes(body.get("query"), "inner_hits"):
        raise ValueError("Require actual hybrid production export with child projection")
    # Fail closed if a differently filtered export is mislabeled.
    for match in nodes(body, "match"):
        if any(field.startswith("publisher.") or field.startswith("distributions.format") for field in match):
            raise ValueError("Fixture controls require no publisher/format selection filters")
    return row


def fixture_body(exported):
    body = copy.deepcopy(exported["request"]["body"])
    for query in nodes(body, "simple_query_string"):
        query["query"] = "water quality"
    for knn in nodes(body, "knn"):
        for payload in knn.values():
            payload["vector"] = BEST.copy()
    counts = inject_auth(body)
    body.update(size=100, **{"from": 0, "track_total_hits": True})
    return body, counts


def format_fixture_body(rows, selected_format):
    """Retain actual production format DSL; remove only disclosed fixture filters.

    No indexed region reference may survive. In production the format nested
    clause and the child matching/auth clause are independent: a hidden child
    can satisfy format for an otherwise metadata-matching accessible parent.
    Do not silently strengthen this behavior or claim same-child authorization.
    """
    selected = [row for row in rows if row.get("query_id") == "smoke-filtered"]
    require(len(selected) == 1, "Require exactly one actual smoke-filtered production export")
    exported = selected[0]
    require(exported.get("public_corpus_assumptions", {}).get("tenant_id") == 0 and
            exported.get("public_corpus_assumptions", {}).get("publishing_state") == "published",
            "Filtered export must use public tenant 0 / published assumptions")
    body = copy.deepcopy(exported["request"]["body"])
    removed = {"publisher": 0, "temporal": 0, "region": 0}

    def removal_kind(clause):
        # Only direct selection wrappers, never a matching/security container.
        opts = clause.get("bool", {}) if isinstance(clause, dict) else {}
        if set(opts) not in ({"boost", "should"}, {"boost", "filter"}) or opts["boost"] != 2.0:
            return None
        if any("publisher.name.keyword_lowercase" in match for match in nodes(clause, "match")):
            return "publisher"
        ranges = nodes(clause, "range")
        if ranges and all(all(field in ("temporal.start.date", "temporal.end.date") for field in item) for item in ranges):
            return "temporal"
        if nodes(clause, "geo_shape"):
            return "region"
        return None

    def strip(node):
        if isinstance(node, list):
            for item in node:
                strip(item)
        elif isinstance(node, dict):
            opts = node.get("bool", {})
            if isinstance(opts.get("filter"), list):
                retained = []
                for clause in opts["filter"]:
                    kind = removal_kind(clause)
                    if kind:
                        removed[kind] += 1
                    else:
                        retained.append(clause)
                opts["filter"] = retained
            for value in node.values():
                strip(value)
    strip(body)
    require(all(removed.values()), "Unexpected filtered export: missing known publisher/date/region selection wrappers")
    require(not nodes(body, "indexed_shape") and not nodes(body, "geo_shape"),
            "No nonowned region-index reference is permitted in fixture controls")
    require(not nodes(body, "range"), "Unexpected remaining range filter")
    matches = [match["distributions.format.quote"] for match in nodes(body, "match")
               if "distributions.format.quote" in match]
    require(matches and all(item == {"query": "CSV"} for item in matches), "Expected actual CSV production format clauses")
    for match in matches:
        match["query"] = selected_format
    for terms in nodes(body, "terms"):
        if terms.get("field") == "distributions.format.keyword_lowercase":
            for key in ("include", "exclude"):
                if key in terms:
                    terms[key] = [selected_format if item == "CSV" else item for item in terms[key]]
    adapted, auth_counts = fixture_body({"request": {"body": body}})
    require(nodes(adapted["query"], "hybrid") and nodes(adapted["query"], "inner_hits"),
            "Filtered export must retain production matching and projection")
    return adapted, {"export_query_id": exported["query_id"], "selected_format": selected_format,
                     "removed_fixture_selection_wrappers": removed, "auth_injections": auth_counts,
                     "format_match_clauses": len(matches)}


def child(identifier, *, title="water quality", vector=None, tenant=0, state="published", owner="visible"):
    return {"identifier": identifier, "title": title, "description": "", "format": "CSV",
            "tenantId": tenant, "publishingState": state, "accessControl": {"ownerId": owner},
            "queryContextVector": list(BEST if vector is None else vector)}


def dataset(identifier, *, title="water quality", vector=None, children=(), tenant=0, state="published", owner="visible", description=""):
    return {"identifier": identifier, "title": title, "description": description, "tenantId": tenant,
            "publishingState": state, "accessControl": {"ownerId": owner},
            "publisher": {"name": identifier}, "queryContextVector": list(BEST if vector is None else vector),
            "distributions": list(children)}


def fixtures():
    unrelated = dict(title="marmalade", vector=FAR)
    docs = [dataset("public-root"), dataset("metadata-nochildren"),
            dataset("visible-child", **unrelated, children=[child("visible-child-hit")]),
            dataset("siblings", children=[child("hidden-sibling", owner="hidden"),
                                         child("draft-sibling", state="draft"),
                                         child("wrong-tenant-sibling", tenant=1),
                                         child("unrelated-visible-sibling", **unrelated)]),
            dataset("root-only-hidden-child", children=[child("only-hidden-child", owner="hidden")]),
            dataset("metadata-hidden-match-visible-sibling",
                    children=[child("metadata-hidden-child", owner="hidden"), child("metadata-unrelated-visible", **unrelated)]),
            dataset("hidden-child-only", **unrelated, children=[child("hidden-match", owner="hidden")]),
            dataset("draft-child-only", **unrelated, children=[child("draft-match", state="draft")]),
            dataset("wrong-tenant-child-only", **unrelated, children=[child("wrong-tenant-match", tenant=1)]),
            dataset("hidden-match-visible-sibling", **unrelated,
                    children=[child("hidden-only-match", owner="hidden"), child("unrelated-sibling", **unrelated)]),
            dataset("draft-root", state="draft"), dataset("wrong-tenant-root", tenant=1),
            dataset("hidden-root", owner="hidden"), dataset("lexical-only", vector=FAR),
            dataset("vector-only", title="marmalade")]
    return docs


def expected_roots(system):
    roots = {"public-root", "metadata-nochildren", "visible-child", "siblings", "root-only-hidden-child",
             "metadata-hidden-match-visible-sibling"}
    if system != "vector":
        roots.add("lexical-only")
    if system != "keyword":
        roots.add("vector-only")
    return roots


def expected_children(identifier):
    return {"visible-child": {"visible-child-hit"},
            "metadata-hidden-match-visible-sibling": {"metadata-unrelated-visible"},
            # Existing production projection uses tenant/auth, not publishing or lexical matching.
            "siblings": {"draft-sibling", "unrelated-visible-sibling"}}.get(identifier, set())


def hit_ids(response):
    return {hit["_id"] for hit in response["hits"]["hits"]}


def projected_ids(hit):
    return {item["_source"]["identifier"] for group in hit.get("inner_hits", {}).values()
            for item in group["hits"]["hits"]}


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def assert_eligibility(response, system):
    require(not response.get("timed_out") and not response.get("_shards", {}).get("failed"), "Incomplete response")
    expected = expected_roots(system)
    require(hit_ids(response) == expected, f"{system}: root IDs {sorted(hit_ids(response))} != {sorted(expected)}")
    for hit in response["hits"]["hits"]:
        require(projected_ids(hit) == expected_children(hit["_id"]),
                f"{system}/{hit['_id']}: unexpected projected children {sorted(projected_ids(hit))}")
    facet = response["aggregations"]["Publisher-global"]["filter"]
    require(facet["doc_count"] == len(expected), f"{system}: publisher facet filtered root count mismatch")
    buckets = facet["terms-other-options"]["buckets"]
    require({bucket["key"]: bucket["doc_count"] for bucket in buckets} == {identifier: 1 for identifier in expected},
            f"{system}: publisher facet buckets differ from eligible roots")
    return {"root_ids": sorted(expected), "inner_hits": {hit["_id"]: sorted(projected_ids(hit)) for hit in response["hits"]["hits"]},
            "publisher_facet": buckets, "format_facet": response["aggregations"].get("Format-global")}


def assert_format(response, system, selected_format):
    """Closed fixture assertions, not judgments about real q04/q12 datasets."""
    require(not response.get("timed_out") and not response.get("_shards", {}).get("failed"), "Incomplete format response")
    expected = FORMAT_ROOTS if selected_format == "CSV" else set()
    require(hit_ids(response) == expected,
            f"{system}/{selected_format}: format root IDs {sorted(hit_ids(response))} != {sorted(expected)}")
    for hit in response["hits"]["hits"]:
        require(projected_ids(hit) == expected_children(hit["_id"]), "Format filter changed production projection")
    publisher = response["aggregations"]["Publisher-global"]["filter"]
    require(publisher["doc_count"] == len(expected), "Publisher facet must retain selected format")
    buckets = [bucket for name in ("terms-other-options", "terms-selected-options")
               for bucket in publisher.get(name, {}).get("buckets", [])]
    require({bucket["key"]: bucket["doc_count"] for bucket in buckets} == {identifier: 1 for identifier in expected},
            "Format-filtered publisher facet root buckets mismatch")
    format_facet = response["aggregations"]["Format-global"]["filter"]
    require(format_facet["doc_count"] == len(expected_roots(system)),
            "Format facet self-excludes selected format; must preserve ordinary matching union roots")
    return {"selected_format": selected_format, "root_ids": sorted(expected),
            "inner_hits": {hit["_id"]: sorted(projected_ids(hit)) for hit in response["hits"]["hits"]},
            "publisher_facet_root_count": publisher["doc_count"], "publisher_facet": buckets,
            "format_facet_self_excluding_root_count": format_facet["doc_count"],
            "format_facet": format_facet,
            "scope": "Synthetic fixture format DSL only; no subjective or known-answer judgment about real datasets"}


def score_map(response):
    return {hit["_id"]: hit["_score"] for hit in response["hits"]["hits"]}


def assert_fusion(responses):
    candidate_a, candidate_b, baseline_a, baseline_b = responses
    for response in responses:
        require(not response.get("timed_out") and not response.get("_shards", {}).get("failed"), "Incomplete fusion response")
        require(hit_ids(response) == {"lexical-leader", "vector-leader"}, "Contradictory fixture must return both documents")
    require(candidate_a["hits"]["hits"][0]["_id"] == "lexical-leader", "Keyword-heavy pipeline did not choose lexical leader")
    require(candidate_b["hits"]["hits"][0]["_id"] == "vector-leader", "Vector-heavy pipeline did not choose vector leader")
    for response in (candidate_a, candidate_b):
        require(all(isinstance(score, (float, int)) and math.isfinite(score) and 0 <= score <= 1.000001
                    for score in score_map(response).values()), "Candidate scores are not normalized to [0, 1]")
    a, b = score_map(baseline_a), score_map(baseline_b)
    require(all(math.isclose(a[key], b[key], rel_tol=1e-6, abs_tol=1e-6) for key in a),
            "Nested raw baseline unexpectedly changed scores with pipeline weights")
    require(max(a.values()) > 1, "Baseline did not demonstrate raw unnormalized scores")
    return {"candidate_keyword_heavy": score_map(candidate_a), "candidate_vector_heavy": score_map(candidate_b),
            "baseline_keyword_heavy": a, "baseline_vector_heavy": b}


class Controls:
    def __init__(self, report):
        self.report = report

    def check(self, name, action):
        record = self.report["controls"][name]
        try:
            details = action()
            record.update(status="passed", details=details)
            return details
        except Exception as error:
            record.update(status="failed", error=f"{type(error).__name__}: {error}")
            raise


def verify(args):
    if not args.allow_local_writes:
        raise ValueError("Pass --allow-local-writes for disposable local controls")
    engine = local_url(args.engine_url)
    output = pathlib.Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    root = PREFIX + str(uuid.uuid4())
    indexes = [owned(root + suffix) for suffix in ("-eligibility", "-fusion")]
    pipelines = [owned(root + suffix) for suffix in ("-keyword-heavy", "-vector-heavy")]
    names = (["inputs", "install"] + ["eligibility/" + system for system in SYSTEMS]
             + ["format/" + selected + "/" + system for selected in FORMATS for system in FORMAT_SYSTEMS]
             + ["normalization_executes"])
    report = {"issue": 3901, "status": "running", "engine_url": engine,
              "authorization": "Translated synthetic ownerId != hidden, NOT real OPA evaluation",
              "fixture_overrides": ["query text: water quality", "query vectors: three zeros", "size/from/track_total_hits",
                                    "synthetic owner predicate in root/child tenant filter groups and inner-hit projection",
                                    "format controls only: smoke-filtered publisher/date/region selection wrappers removed; production format clauses retained and CSV/impossible literal substituted"],
              "semantics": {"ranking": "Eligibility controls assert sets, not ordering",
                            "projection": "Production tenant/auth projection retained: visible draft and unrelated siblings included; hidden/wrong-tenant excluded",
                            "facets": "Candidate ordinary bool union, not hybrid normalized ranking; Publisher root facet exact. Format nested facet counts all children of eligible parents, not child-auth-filtered; its root filter self-excludes selected format.",
                            "explicit_format": "Preserves actual independent root nested format clause: hidden/draft/wrong-tenant child format may qualify an otherwise metadata-matching accessible parent. Does NOT prove same-child format plus authorization. Publisher facet topHits may embed raw child source. Synthetic format controls are not real-dataset q04/q12 judgments."},
              "resources": [], "controls": {name: {"status": "not_run"} for name in names}}
    controls = Controls(report)
    created = []
    failure = None

    def create(kind, name, payload):
        owned(name)
        path = "/" + name if kind == "index" else "/_search/pipeline/" + name
        resource = {"kind": kind, "name": name, "path": path, "created": False, "cleanup": "not_needed"}
        report["resources"].append(resource)
        result = request(engine, "PUT", path, payload)
        require(result.get("acknowledged") is True, "Resource creation was not acknowledged: " + name)
        resource.update(created=True, cleanup="pending")
        created.append(resource)

    def search(index, body, pipeline):
        owned(index)
        owned(pipeline)
        return request(engine, "POST", "/" + index + "/_search?search_pipeline=" + pipeline, body)

    try:
        def inputs():
            rows = replay.load_jsonl(args.baseline_requests)
            exported = select_export(rows)
            format_bodies = {}
            report["format_adaptations"] = {}
            for selected in FORMATS:
                adapted, details = format_fixture_body(rows, selected)
                format_bodies[selected] = adapted
                report["format_adaptations"][selected] = details
            mapping = json.loads(pathlib.Path(args.mapping).read_text(encoding="utf8"))
            props = mapping["mappings"]["properties"]
            require(props["queryContextVector"]["dimension"] == 3 and
                    props["distributions"]["properties"]["queryContextVector"]["dimension"] == 3,
                    "Use the actual dimension-3 Scala smoke mapping")
            body, counts = fixture_body(exported)
            report.update(baseline_query_id=exported["query_id"], baseline_commit=exported.get("baseline_commit"),
                          baseline_requests_sha256=replay.sha(args.baseline_requests), mapping_sha256=replay.sha(args.mapping),
                          auth_injections=counts)
            return exported, mapping, body, format_bodies
        exported, mapping, body, format_bodies = controls.check("inputs", inputs)
        # Keep the persisted report compact and JSON serializable, without duplicating the complete export.
        report["controls"]["inputs"]["details"] = {"auth_injections": report["auth_injections"]}

        def install():
            create("index", indexes[0], mapping)
            create("index", indexes[1], mapping)
            for name, weights in zip(pipelines, ([.9, .1], [.1, .9])):
                create("pipeline", name, replay.pipeline_body(weights))
            fusion_docs = [dataset("lexical-leader", vector=[.9, 0, 0]),
                           dataset("vector-leader", title="marmalade", description="water quality")]
            for index, docs in zip(indexes, (fixtures(), fusion_docs)):
                lines = []
                for doc in docs:
                    lines.extend([json.dumps({"index": {"_id": doc["identifier"]}}), json.dumps(doc)])
                result = request(engine, "POST", "/" + owned(index) + "/_bulk?refresh=true",
                                 "\n".join(lines) + "\n", "application/x-ndjson")
                require(not result.get("errors"), "Fixture bulk indexing failed: " + json.dumps(result))
            return {"eligibility_documents": len(fixtures()), "fusion_documents": 2}
        controls.check("install", install)
        for system in SYSTEMS:
            def eligibility(system=system):
                current = replay.experimental(body, system)
                if system.startswith("candidate"):
                    require(not nodes(current.get("aggs", {}), "hybrid"), "Candidate facets must use ordinary bool union")
                return assert_eligibility(search(indexes[0], current, pipelines[0]), system)
            controls.check("eligibility/" + system, eligibility)
        for selected in FORMATS:
            for system in FORMAT_SYSTEMS:
                def format_control(selected=selected, system=system):
                    current = replay.experimental(format_bodies[selected], system)
                    if system.startswith("candidate"):
                        require(not nodes(current.get("aggs", {}), "hybrid"), "Format facets must use ordinary bool union")
                    return assert_format(search(indexes[0], current, pipelines[0]), system, selected)
                controls.check("format/" + selected + "/" + system, format_control)
        def fusion():
            candidate = replay.experimental(body, "candidate_03_07")
            baseline = replay.experimental(body, "baseline")
            responses = [search(indexes[1], current, pipeline)
                         for current in (candidate, baseline) for pipeline in pipelines]
            return assert_fusion(responses)
        controls.check("normalization_executes", fusion)
        report["status"] = "passed"
    except Exception as error:
        failure = error
        report.update(status="failed", error=f"{type(error).__name__}: {error}")
    finally:
        cleanup_errors = []
        for resource in reversed(created):
            try:
                owned(resource["name"])
                result = request(engine, "DELETE", resource["path"])
                require(result.get("acknowledged") is True, "Cleanup was not acknowledged")
                resource["cleanup"] = "deleted"
            except Exception as error:
                resource.update(cleanup="failed", cleanup_error=f"{type(error).__name__}: {error}")
                cleanup_errors.append(resource["name"])
        if cleanup_errors:
            report["status"] = "failed"
            if failure is None:
                failure = RuntimeError("Cleanup failed for exact owned resources: " + ", ".join(cleanup_errors))
        output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf8")
    if failure is not None:
        raise failure
    return report


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--engine-url", type=local_url, required=True)
    result.add_argument("--baseline-requests", required=True)
    result.add_argument("--mapping", required=True)
    result.add_argument("--output", required=True)
    result.add_argument("--allow-local-writes", action="store_true")
    return result


if __name__ == "__main__":
    report = verify(parser().parse_args())
    print(json.dumps({"status": report["status"], "controls": len(report["controls"]),
                      "cleanup": [resource["cleanup"] for resource in report["resources"]]}))
