#!/usr/bin/env python3
"""Independent, offline threshold fixture evidence validation.

No generator/search/model imports. Manual auditors supply semantic observations;
this module checks source closure, literal evidence and exhaustive coverage and
independently derives labels. Literal matching never proves semantic entailment.
Public validate_* functions do not write artifacts. CLI outputs are exclusive.
"""
from __future__ import annotations

import argparse
import ast
from collections import Counter
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
SPEC_FILES = ("protocol.md", "query-spec.jsonl", "intents.jsonl", "generation-spec.json",
              "relevance-rubric.md", "decision-gates.json", "design-notes.md")
SEARCH_ROOTS = {"title", "description", "keywords", "publisher", "queryContext"}
DIST_SEARCH = {"title", "description", "format", "queryContext"}
DATASET_FIELDS = SEARCH_ROOTS | {"identifier", "quality", "hasQuality", "tenantId", "publishingState", "distributions", "catalog", "landingPage"}
DISTRIBUTION_FIELDS = DIST_SEARCH | {"identifier", "downloadURL", "accessURL", "tenantId", "publishingState"}
BASES = {"observed_not_simulated", "observed_administrative_records", "simulation_only",
         "contextual_topic_only", "U"}
LEAK = re.compile(r"\b(?:grade[ _:=]+[0-3]|(?:intent|query)[ _-]?id\s*[:=]|"
                  r"canonical_claims|claim_set|expected_answer|planned_grade|"
                  r"hard_negative_for_intent_ids|positive_anchor_intent_ids)\b", re.I)
GROWTH_ID = re.compile(r"g(0[1-9]|1[0-9]|20)-r(0[1-9][0-9]|00[1-9])\Z")
UNKNOWN = re.compile(r"(?:^U(?:$|[_ :])|unknown|unspecified|uncertain|unresolved)", re.I)


def require(ok, message):
    if not ok:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def sha(path):
    return digest(Path(path).read_bytes())


def canonical_sha(value):
    return digest(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))


def unique_object(pairs):
    out = {}
    for key, value in pairs:
        require(key not in out, f"Duplicate JSON key: {key}")
        out[key] = value
    return out


def loads(text):
    return json.loads(text, object_pairs_hook=unique_object)


def load(path):
    return loads(Path(path).read_text())


def bound(root, relative):
    root = Path(root).resolve()
    require(isinstance(relative, str) and relative and not Path(relative).is_absolute(),
            "Artifact paths must be nonempty and relative")
    path = (root / relative).resolve()
    require(path.is_relative_to(root) and path.is_file(), f"Missing/escaping artifact: {relative}")
    return path


def input_path(root, path):
    root, path = Path(root).resolve(), Path(path)
    path = path.resolve() if path.is_absolute() else (root / path).resolve()
    require(path.is_relative_to(root) and path.is_file(), "Input artifact outside study root or missing")
    return path


def unique(rows, key, label):
    require(isinstance(rows, list), f"{label} must be a list")
    out = {}
    for row in rows:
        require(isinstance(row, dict) and key in row and row[key] not in out,
                f"Unknown/duplicate {label} key")
        out[row[key]] = row
    return out


def jsonl_rows(path):
    """Retain full raw row bytes, including line endings, for observation closure."""
    rows, raw = [], {}
    for line in Path(path).read_bytes().splitlines(keepends=True):
        require(line.strip(), "Blank JSONL row")
        row = loads(line)
        require(isinstance(row, dict) and isinstance(row.get("identifier"), str), "Missing corpus identifier")
        rid = row["identifier"]
        require(rid not in raw, "Duplicate corpus identifier")
        rows.append(row)
        raw[rid] = line
    return unique(rows, "identifier", "corpus ID"), raw


def verify_registration(root):
    """Reimplement the hash contract without importing any implementation code."""
    root = Path(root).resolve()
    frozen = load(bound(root, "spec-freeze.json"))
    require(frozen.get("phase") == "before_new_generation_and_threshold_execution", "Wrong registration phase")
    require(set(frozen.get("spec_sha256", {})) == set(SPEC_FILES), "Incomplete frozen specification")
    for name, expected in frozen["spec_sha256"].items():
        require(sha(bound(root, name)) == expected, f"Frozen specification changed: {name}")
    require(sha(bound(root, "freeze.py")) == frozen.get("freeze_tool_sha256"), "Frozen checker changed")
    preflight = bound(root, frozen["independent_preflight_path"])
    require(sha(preflight) == frozen["independent_preflight_sha256"], "Structural review changed")
    reviewed = load(preflight)
    require(reviewed.get("status") == "structural_pre_generation_passed"
            and reviewed.get("actual_text_validation_passed") is False
            and reviewed.get("spec_sha256") == frozen["spec_sha256"], "Wrong structural review")
    generation = load(root / "generation-spec.json")
    intents = unique([loads(x) for x in (root / "intents.jsonl").read_text().splitlines() if x.strip()],
                     "intent_id", "intent")
    queries = unique([loads(x) for x in (root / "query-spec.jsonl").read_text().splitlines() if x.strip()],
                     "id", "query")
    plans = unique(generation["core_record_plans"], "id", "core plan")
    archetypes = unique(generation["growth"]["archetypes"], "archetype_id", "growth archetype")
    require(set(generation["planned_core_intent_doc_grades"]) == set(intents)
            == set(generation["planned_growth_intent_archetype_grades"]), "Incomplete intent maps")
    for iid in intents:
        require(set(generation["planned_core_intent_doc_grades"][iid]) == set(plans)
                and set(generation["planned_growth_intent_archetype_grades"][iid]) == set(archetypes),
                "Incomplete planned grade keys")
    require({qid for intent in intents.values() for qid in intent["paraphrase_query_ids"]} == set(queries),
            "Query-intent coverage mismatch")
    return {"root": root, "frozen": frozen, "generation": generation, "intents": intents,
            "queries": queries, "plans": plans, "archetypes": archetypes}


def strings(value, prefix=""):
    if isinstance(value, str):
        yield prefix, value
    elif isinstance(value, dict):
        for key, child in value.items():
            yield from strings(child, f"{prefix}.{key}" if prefix else key)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from strings(child, f"{prefix}.{index}")


def searchable(doc):
    out = {}
    for key in SEARCH_ROOTS:
        if key in doc:
            out.update(strings(doc[key], key))
    for index, distribution in enumerate(doc.get("distributions", [])):
        for key in DIST_SEARCH:
            if key in distribution:
                out.update(strings(distribution[key], f"distributions.{index}.{key}"))
    return out


def production_context(doc, distribution=False):
    title = doc.get("title") if doc.get("title") is not None else "None"
    description = doc.get("description") if doc.get("description") is not None else "None"
    if distribution:
        fmt = doc.get("format") if doc.get("format") is not None else "None"
        return f"Title: {title}\nFormat: {fmt}\nDescription: {description}\n"
    return f"Title: {title}\nDescription: {description}\n"


def quote_check(evidence, fields, label):
    require(isinstance(evidence, list) and evidence, f"Missing literal evidence: {label}")
    for item in evidence:
        require(isinstance(item, dict), f"Invalid citation: {label}")
        field, quote = item.get("field"), item.get("quote")
        require(field in fields and isinstance(quote, str) and quote.strip()
                and quote in fields[field], f"Absent/nonsearchable quotation: {label}/{field}")


def positive_quote_check(evidence, fields, label):
    quote_check(evidence, fields, label)
    denial = re.compile(r"\b(?:no|without|unavailable|missing|omitted|excluded|unmeasured|never)\b|"
                        r"\bnot\s+(?:recorded|measured|collected|available|documented)\b", re.I)
    for item in evidence:
        require(not denial.search(item["quote"]), f"Positive quotation denies measurement: {label}")
        # Also reject a minimal snippet sliced from an explicitly denying sentence.
        # This conservative check complements (never substitutes for) manual review.
        field, quote = fields[item["field"]], item["quote"]
        occurrences = [m.start() for m in re.finditer(re.escape(quote), field)]
        supported = False
        for start in occurrences:
            left = max(field.rfind(".", 0, start), field.rfind(";", 0, start), field.rfind("\n", 0, start)) + 1
            stops = [v for v in (field.find(".", start + len(quote)), field.find(";", start + len(quote)),
                                  field.find("\n", start + len(quote))) if v >= 0]
            end = min(stops) if stops else len(field)
            if not denial.search(field[left:end]):
                supported = True
        require(supported, f"Positive snippet lies in denial/absence context: {label}")


def assertion(item, fields, label):
    require(isinstance(item, dict) and isinstance(item.get("value"), str) and item["value"],
            f"Missing independent observation: {label}")
    quote_check(item.get("evidence"), fields, label)
    return item["value"]


def token_present(text, token):
    return re.search(r"(?<![\w.:-])" + re.escape(token)
                     + r"(?!(?:[\w:-]|\.[A-Za-z0-9]))", text, re.I) is not None


def formats_in(doc):
    values = set()
    for distribution in doc.get("distributions", []):
        value = distribution.get("format")
        require(isinstance(value, str) and value in {"CSV", "JSON"}, "Unregistered distribution format")
        values.add(value)
    return values


def check_neutral(doc):
    require(type(doc.get("quality")) in (int, float) and doc["quality"] == 1
            and doc.get("hasQuality") is True, "Non-neutral dataset quality")
    for item in [doc] + doc.get("distributions", []):
        require(type(item.get("tenantId")) is int and item["tenantId"] == 0
                and item.get("publishingState") == "published"
                and "accessControl" not in item, "Non-neutral tenant/publication/access policy")
    require("spatial" not in doc and "temporal" not in doc, "Unexpected spatial/temporal metadata")
    for distribution in doc.get("distributions", []):
        require("quality" not in distribution and "hasQuality" not in distribution,
                "Invented distribution quality field")


def check_record_common(doc, plan, registration):
    generation, queries = registration["generation"], registration["queries"]
    rid = doc["identifier"]
    require(set(doc) <= DATASET_FIELDS, "Unrecognized dataset field outside frozen whole-row schema")
    require(isinstance(doc.get("keywords"), list) and all(isinstance(x, str) for x in doc["keywords"]),
            "Keywords must be a string list")
    require(isinstance(doc.get("publisher"), dict) and set(doc["publisher"]) <= {"identifier", "name"}
            and isinstance(doc["publisher"].get("name"), str), "Unrecognized publisher schema")
    require(isinstance(doc.get("title"), str) and doc["title"].strip()
            and isinstance(doc.get("description"), str) and doc["description"].strip(), "Missing title/description")
    distributions = doc.get("distributions")
    require(isinstance(distributions, list) and distributions, "Missing distributions")
    require(all(isinstance(x, dict) and set(x) <= DISTRIBUTION_FIELDS for x in distributions),
            "Unrecognized/invalid distribution schema")
    require(doc.get("catalog") is None, "Unreviewed catalog object")
    if "landingPage" in doc:
        require(isinstance(doc["landingPage"], str), "Invalid structural landingPage")
    check_neutral(doc)
    require(doc.get("queryContext") == production_context(doc), f"Non-production root context: {rid}")
    for distribution in distributions:
        require(distribution.get("queryContext") == production_context(distribution, True),
                f"Non-production child context: {rid}")
        require(distribution.get("downloadURL") or distribution.get("accessURL"), "Distribution not downloadable")
    budget = generation["budgets"][plan["prose_budget"]]
    require(budget["min_words"] <= len(doc["description"].split()) <= budget["max_words"],
            f"Description outside frozen budget: {rid}")
    require(len(doc["title"].split()) <= generation["budgets"]["dataset_title_words_max"], "Title exceeds budget")
    nested_budget = generation["budgets"]["nested_description_words"]
    for distribution in distributions:
        require(isinstance(distribution.get("description"), str)
                and nested_budget["min"] <= len(distribution["description"].split()) <= nested_budget["max"],
                "Nested description outside frozen budget")
    sentences = [s.casefold().strip() for s in re.split(r"(?<=[.!?])\s+", doc["description"])
                 if len(s.split()) >= 5]
    require(max(Counter(sentences).values(), default=0) <= 1, "Repeated-sentence padding")
    fields = searchable(doc)
    for field, text in fields.items():
        require(not LEAK.search(text), f"Answer-key leakage: {rid}/{field}")
        for query in queries.values():
            if query["kind"] != "exact" and len(query["query"].split()) >= 4:
                require(query["query"].casefold() not in text.casefold(), "Full target query copied into metadata")
    claim = generation["canonical_claim_sets"][plan["claim_set"]]
    require(formats_in(doc) == set(claim["available_formats"]), "Actual format set differs from frozen requirement")
    for token in plan.get("absence_tokens_in_all_searchable_fields", []):
        require(not any(re.search(r"(?<!\w)" + re.escape(token) + r"(?!\w)", text, re.I)
                        for text in fields.values()), f"Prohibited useful-positive token: {rid}/{token}")
    return fields


def check_identity_scope(doc, claim):
    fields = searchable(doc)
    scope = claim.get("identity_scope")
    if scope:
        identity = claim["identity"]
        if scope.startswith("distribution_only"):
            allowed = {f: t for f, t in fields.items() if f.startswith("distributions.")}
            forbidden = {f: t for f, t in fields.items() if not f.startswith("distributions.")}
        elif scope == "title_only_primary_fields":
            allowed = {"title": doc["title"]}
            forbidden = {f: t for f, t in fields.items() if f not in ("title", "queryContext")}
        else:
            allowed, forbidden = {"title": doc["title"]}, {}
        require(any(token_present(t, identity) for t in allowed.values()), "Authoritative identity absent in frozen scope")
        require(not any(token_present(t, identity) for t in forbidden.values()), "Identity scope leakage")
        if claim.get("required_exact_title"):
            require(doc["title"] == claim["required_exact_title"], "Exact required title changed")
    return fields


def check_record(doc, plan, registration):
    fields = check_record_common(doc, plan, registration)
    check_identity_scope(doc, registration["generation"]["canonical_claim_sets"][plan["claim_set"]])
    return fields


def reviewer_check(reviewer):
    require(isinstance(reviewer, dict) and reviewer.get("id") and reviewer.get("context_id")
            and reviewer.get("model") and "parameters" in reviewer
            and reviewer.get("role") == "independent_semantic_auditor"
            and reviewer.get("rankings_seen") is False and reviewer.get("generator_context") is False,
            "Reviewer lacks independent fresh-context provenance")


def absence_check(value, negatives, fields, label):
    require(isinstance(value, dict), f"Missing independent negative-absence audit: {label}")
    if "checked_intents" in value:
        checked = value["checked_intents"]
        require(isinstance(checked, list) and len(checked) == len(set(checked))
                and set(checked) == negatives and value.get("absent_all") is True
                and value.get("rationale"), f"Incomplete/unresolved compact absence audit: {label}")
        quote_check(value.get("evidence"), fields, label)
    else:
        require(set(value) == negatives, f"Negative intent coverage incomplete: {label}")
        for iid, item in value.items():
            require(isinstance(item, dict) and item.get("absent") is True and item.get("rationale"),
                    f"Unproven negative absence: {label}/{iid}")
            quote_check(item.get("evidence"), fields, label + "/" + iid)


def observe(row, doc, registration):
    rid, fields = doc["identifier"], searchable(doc)
    require(row.get("exhaustive_searchable_review") is True and row.get("semantic_review_passed") is True
            and row.get("issues") == [], f"Unresolved/incomplete manual semantic review: {rid}")
    negatives = {iid for iid, intent in registration["intents"].items() if intent["kind"].startswith("negative_")}
    absence_check(row.get("negative_absence"), negatives, fields, rid)
    return parse_context_observations(row, doc, registration)


def parse_context_observations(row, doc, registration):
    """Literal observation extraction only; never clears review flags or certifies labels."""
    rid, fields = doc["identifier"], searchable(doc)
    contexts = row.get("contexts")
    require(isinstance(contexts, list) and contexts, "Missing independently observed contexts")
    normalized = []
    for index, context in enumerate(contexts):
        label = f"{rid}/context{index}"
        item = {key: assertion(context.get(key), fields, label + "/" + key)
                for key in ("product", "process", "basis")}
        require(item["basis"] in BASES, "Unrecognized observation basis")
        facts = context.get("facts")
        require(isinstance(facts, dict), "Missing independently supported facts")
        require(set(facts) <= set(registration["generation"]["closed_ontology"]["facts"]), "Unknown measured variable")
        for fact, evidence in facts.items():
            positive_quote_check(evidence, fields, label + "/" + fact)
        require(context.get("format_content_verified") is True, "Unverified distribution/content association")
        item["facts"] = facts
        normalized.append(item)
    return normalized


def derive_grade(intent, rid, contexts):
    """No planned fact/role/grade map is consulted during independent derivation."""
    kind = intent["kind"]
    if kind == "ambiguous_ungraded":
        return "U"
    if kind == "exact":
        return 3 if rid in intent["authoritative_target_ids"] else 0
    if kind.startswith("negative_"):
        return 0  # exhaustive manually attested absence is checked first
    req, grades, uncertain = intent["required_claims"], [], False
    for context in contexts:
        matches = all(context[key] == req[key] for key in ("product", "process", "basis"))
        if matches:
            grades.append(len(set(req["facts"]) & set(context["facts"])))
            continue
        decisive = any(not UNKNOWN.search(context[key]) and context[key] != req[key]
                       for key in ("product", "process", "basis"))
        uncertain |= not decisive
    return "U" if uncertain else max(grades, default=0)


def branch_support(intent, contexts):
    """Descriptive measurement completeness, not invented branch relevance labels."""
    if intent["kind"] != "semantic":
        return {}
    req = intent["required_claims"]
    scopes = {}
    for context in contexts:
        if not all(context[key] == req[key] for key in ("product", "process", "basis")):
            continue
        for fact in set(req["facts"]) & set(context["facts"]):
            for citation in context["facts"][fact]:
                field = citation["field"]
                if field in ("title", "description", "queryContext"):
                    scopes.setdefault("root", set()).add(fact)
                else:
                    match = re.fullmatch(r"distributions\.(\d+)\.(title|description|queryContext)", field)
                    if match:
                        scopes.setdefault("nested." + match.group(1), set()).add(fact)
    return {scope: {"facts": sorted(facts), "useful_measurement_complete": len(facts) >= 2,
                    "all_required_measurements_complete": len(facts) == 3}
            for scope, facts in sorted(scopes.items())}


def _source_group(root, entries, seeds, expected_ids):
    sources, documents, raw_rows = {}, {}, {}
    by_seed = unique(entries, "seed", "seed source")
    require(set(by_seed) == set(seeds), "All registered seed sources required")
    for seed, item in by_seed.items():
        path = bound(root, item["path"])
        require(sha(path) == item.get("sha256"), "Source corpus bytes changed")
        docs, raw = jsonl_rows(path)
        require(set(docs) == set(expected_ids), "Source corpus ID/count mismatch")
        sources[seed] = {"path": item["path"], "sha256": sha(path)}
        documents[seed], raw_rows[seed] = docs, raw
    return sources, documents, raw_rows


def _manual_reviews(root, review_paths, source_groups):
    """Load observations only from separately authored, source-closed artifacts."""
    observations, artifacts, reviewers = {}, [], {}
    expected = {}
    for sources, docs, raw in source_groups:
        for seed, records in docs.items():
            for rid, doc in records.items():
                expected[(seed, rid)] = (sources[seed], doc, raw[seed][rid])
    paths = sorted({str(input_path(root, p).relative_to(root)) for p in review_paths})
    require(paths, "No independent manual review artifacts")
    for relative in paths:
        path = bound(root, relative)
        data = load(path)
        require(data.get("schema_version") == 1, "Wrong manual review schema")
        reviewer = data.get("reviewer")
        reviewer_check(reviewer)
        reviewer_id = reviewer["id"]
        require(reviewer_id not in reviewers or reviewers[reviewer_id] == reviewer, "Reviewer provenance changed")
        reviewers[reviewer_id] = reviewer
        sources = unique(data.get("sources", []), "path", "manual source")
        for source in sources.values():
            require(sha(bound(root, source["path"])) == source.get("sha256"), "Manual source artifact changed")
        rows = data.get("record_reviews")
        require(isinstance(rows, list) and rows, "Empty manual review artifact")
        for row in rows:
            pair = (row.get("seed"), row.get("dataset_id"))
            require(pair in expected and pair not in observations, "Unknown/duplicate manual record review")
            source, doc, raw = expected[pair]
            require(row.get("reviewer_id") == reviewer_id, "Observation reviewer mismatch")
            require(row.get("source_path") == source["path"] and source["path"] in sources
                    and sources[source["path"]]["sha256"] == source["sha256"], "Manual/current source closure missing")
            require(row.get("raw_record_sha256") == digest(raw), "Manual review read stale/different raw row")
            if "canonical_record_sha256" in row:
                require(row["canonical_record_sha256"] == canonical_sha(doc), "Manual canonical record hash mismatch")
            observations[pair] = row
        artifacts.append({"path": relative, "sha256": sha(path)})
    require(set(observations) == set(expected), "Incomplete 180-core/60-template actual review coverage")
    return observations, artifacts, list(reviewers.values())


def _audit_record(row, doc, plan, registration, growth=False):
    """Derive from observations FIRST; compare with frozen truth only afterward."""
    fields = check_record(doc, plan, registration)
    contexts = observe(row, doc, registration)
    rid = doc["identifier"]
    grades = {iid: derive_grade(intent, rid, contexts) for iid, intent in registration["intents"].items()}
    key = rid.split("-r")[0] if growth else rid
    matrix = registration["generation"]["planned_growth_intent_archetype_grades" if growth
                                         else "planned_core_intent_doc_grades"]
    for iid, grade in grades.items():
        require(grade == matrix[iid][key], f"Independent label mismatch/U: {rid}/{iid}: {grade!r} != {matrix[iid][key]!r}")
    claim = registration["generation"]["canonical_claim_sets"][plan["claim_set"]]
    require(all(c["product"] == claim["product"] and c["process"] == claim["process"] for c in contexts),
            "Actual product/process claims diverge from closed frozen content")
    facts = {fact for c in contexts for fact in c["facts"]}
    if claim.get("identity"):
        identity = assertion(row.get("identity"), fields, rid + "/identity")
        require(identity in {claim["identity"], claim.get("required_exact_title")}
                and any(token_present(e["quote"], claim["identity"])
                        for e in row["identity"]["evidence"]), "Independent authoritative identity differs/missing")
        facts.add("authoritative_item_identity")
    require(facts == set(claim["facts"]), "Actual documented/omitted variables contradict closed frozen claims")
    require(all(c["basis"] in {"observed_not_simulated", "observed_administrative_records"} for c in contexts),
            "Unresolved/simulated content fails frozen observed realization")
    layout = plan["evidence_layout"]
    if layout in {"root_measurements", "nested_measurements"}:
        for context_index, context in enumerate(contexts):
            for fact, citations in context["facts"].items():
                if layout == "root_measurements":
                    require(all(not e["field"].startswith("distributions.") for e in citations)
                            and any(e["field"] == "description" for e in citations), "Root-only fact evidence layout violated")
                else:
                    require(all(e["field"] in {"distributions.0.title", "distributions.0.description",
                                               "distributions.0.queryContext"} for e in citations),
                            "Nested-only first-distribution fact evidence layout violated")
            # Product, process and truthful basis must also be supported in primary text.
            original = row["contexts"][context_index]
            for name in ("product", "process", "basis"):
                require(any(e["field"] in {"title", "description", "queryContext"}
                            for e in original[name]["evidence"]), "Primary product/process/basis evidence missing")
    return {"contexts": contexts, "intent_grades": grades,
            "branch_measurement_support": {iid: branch_support(intent, contexts)
                                           for iid, intent in registration["intents"].items()
                                           if intent["kind"] == "semantic"}}


PLACEHOLDER = re.compile(r"\{\{([a-z_]+)\}\}")


def pointer_strings(value, pointer=""):
    if isinstance(value, str):
        yield pointer, value
    elif isinstance(value, dict):
        for key, child in value.items():
            escaped = key.replace("~", "~0").replace("/", "~1")
            yield from pointer_strings(child, pointer + "/" + escaped)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from pointer_strings(child, pointer + "/" + str(index))


def _slot_values(aid, replica, terminal_data):
    require(type(replica) is int and 1 <= replica <= 97, "Growth replica outside frozen domain")
    definitions = terminal_data.get("slot_definitions")
    require(isinstance(definitions, dict) and set(definitions) == {"station", "year", "month", "record_id"},
            "Unregistered slot definitions")
    # These are finite independently implemented formatting choices, never eval().
    station_definition = definitions["station"]
    require(isinstance(station_definition, dict), "Station slot definition must be declarative")
    station_format = station_definition.get("format", "Station {replica:03}")
    require(station_format in {"Station {replica:03}", "Station {replica:03d}", "{replica:03}", "{replica:03d}"},
            "Unregistered station formatter")
    station = ("Station " if station_format.startswith("Station ") else "") + f"{replica:03}"
    require(station_definition.get("range", [1, 97]) == [1, 97], "Station domain changed")
    require(isinstance(definitions["year"], dict)
            and definitions["year"].get("formula", "2010 + ((replica-1) % 16)") == "2010 + ((replica-1) % 16)"
            and definitions["year"].get("range", [2010, 2025]) == [2010, 2025], "Year rule changed")
    month_definition = definitions["month"]
    require(isinstance(month_definition, dict)
            and month_definition.get("formula", "1 + ((replica-1) % 12)") == "1 + ((replica-1) % 12)"
            and month_definition.get("range", [1, 12]) == [1, 12], "Month slot definition/domain changed")
    month_format = month_definition.get("format", "integer")
    require(month_format in {"integer", "02", "02d", "{month:02}", "{month:02d}"}, "Unregistered month formatter")
    month = 1 + (replica - 1) % 12
    return {"record_id": f"{aid}-r{replica:03}", "station": station,
            "year": str(2010 + (replica - 1) % 16),
            "month": str(month) if month_format == "integer" else f"{month:02}"}


def render_terminal(bundle, replica, registration, terminal_data):
    """Independent whole-object reconstruction from reviewed declarative data."""
    aid = bundle["archetype_id"]
    require(aid in registration["archetypes"] and bundle["seed"] in registration["generation"]["seeds"],
            "Unknown terminal identity")
    metadata = bundle.get("metadata")
    require(isinstance(metadata, dict), "Terminal must contain complete metadata object")
    bindings = bundle.get("slot_bindings")
    require(isinstance(bindings, list), "Missing declared terminal slot bindings")
    declared = set()
    for binding in bindings:
        require(isinstance(binding, dict) and set(binding) == {"json_pointer", "slot"}, "Invalid slot binding")
        pair = binding["json_pointer"], binding["slot"]
        require(pair not in declared, "Duplicate slot binding")
        declared.add(pair)
    found = set()
    for pointer, text in pointer_strings(metadata):
        matches = list(PLACEHOLDER.finditer(text))
        require("{{" not in PLACEHOLDER.sub("", text) and "}}" not in PLACEHOLDER.sub("", text), "Malformed placeholder")
        for match in matches:
            slot = match.group(1)
            found.add((pointer, slot))
            require(slot in {"station", "year", "month", "record_id"}, "Unregistered terminal slot")
            if slot == "record_id":
                require(re.fullmatch(r"/(?:identifier|landingPage|distributions/\d+/(?:identifier|downloadURL|accessURL))", pointer),
                        "Record ID slot leaks into searchable prose")
            elif slot == "station":
                require(pointer in {"/publisher/name", "/description", "/queryContext"}
                        or re.fullmatch(r"/distributions/\d+/(description|queryContext)", pointer),
                        "Station slot in unapproved field")
            else:
                require(pointer in {"/description", "/queryContext"}
                        or re.fullmatch(r"/distributions/\d+/(description|queryContext)", pointer),
                        "Date slot in unapproved field")
                # Field-bundle reviewers must additionally establish truthful release provenance.
                require(re.search(r"\b(?:publication|release|released|published|issued)\b", text, re.I),
                        "Neutral date slot lacks explicit publication/release context")
    require(found == declared, "Declared slot coverage differs from actual placeholders")
    require({slot for _, slot in found} == {"station", "year", "month", "record_id"}, "Missing frozen neutral slot class")
    provenance = [pointer for pointer, slot in found if slot == "station"
                  and pointer != "/publisher/name" and not pointer.endswith("/queryContext")]
    require(("/publisher/name", "station") in found and len(provenance) == 1,
            "Station must occur in publisher and exactly one provenance clause")
    values = _slot_values(aid, replica, terminal_data)

    def substitute(value):
        if isinstance(value, str):
            return PLACEHOLDER.sub(lambda match: values[match.group(1)], value)
        if isinstance(value, dict):
            return {key: substitute(child) for key, child in value.items()}
        if isinstance(value, list):
            return [substitute(child) for child in value]
        require(value is None or type(value) in (bool, int, float), "Non-JSON terminal metadata")
        return value

    rendered = substitute(metadata)
    require(rendered.get("identifier") == values["record_id"], "Structural record ID differs")
    require([x.get("format") for x in rendered.get("distributions", [])] == ["CSV", "JSON"],
            "Growth requires CSV first and JSON second")
    require(rendered.get("queryContext") == production_context(rendered), "Terminal root projection differs")
    require(all(x.get("queryContext") == production_context(x, True) for x in rendered["distributions"]),
            "Terminal child projection differs")
    if "projections" in bundle:
        projections = substitute(bundle["projections"])
        require(isinstance(projections, dict) and projections.get("dataset") == rendered["queryContext"]
                and projections.get("nested") == [x["queryContext"] for x in rendered["distributions"]],
                "Declared terminal projections differ from actual production reconstruction")
    return rendered


def _terminal_bundles(root, manifest, registration):
    reference = manifest.get("terminal_templates")
    require(isinstance(reference, dict), "Missing terminal-template artifact")
    path = bound(root, reference["path"])
    require(sha(path) == reference.get("sha256"), "Terminal-template bytes changed")
    data = load(path)
    require(data.get("schema_version") == 1 and isinstance(data.get("bundles"), list), "Wrong terminal schema")
    by_pair = {}
    expected = {(seed, aid) for seed in registration["generation"]["seeds"] for aid in registration["archetypes"]}
    for bundle in data["bundles"]:
        pair = bundle.get("seed"), bundle.get("archetype_id")
        require(pair in expected and pair not in by_pair, "Unknown/duplicate terminal bundle")
        require(bundle.get("claim_set") == registration["archetypes"][pair[1]]["claim_set"], "Terminal claim reference differs")
        by_pair[pair] = bundle
    require(set(by_pair) == expected, "All 60 complete terminal bundles required")
    return data, by_pair, {"path": reference["path"], "sha256": sha(path)}


def inspect_stage_one(root, manifest_path, core_review_paths, template_review_paths):
    """Accumulate source-closed errors and provisional derivations; NEVER a pass.

    This is not a nonconformance bypass or diagnostic execution gate. It preserves
    each original manual flag/issue and yields no accepted expansion binding.
    """
    registration = verify_registration(root)
    root = registration["root"]
    path = input_path(root, manifest_path)
    manifest = load(path)
    require(manifest.get("schema_version") == 1 and manifest.get("spec_freeze_sha256") == sha(root / "spec-freeze.json"),
            "Stage-one manifest references another registration")
    seeds = registration["generation"]["seeds"]
    core = _source_group(root, manifest.get("corpora", []), seeds, registration["plans"])
    templates = _source_group(root, manifest.get("templates", []), seeds,
                              {aid + "-r001" for aid in registration["archetypes"]})
    terminal_data, bundles, terminal_ref = _terminal_bundles(root, manifest, registration)
    observations, artifacts, reviewers = _manual_reviews(root, list(core_review_paths) + list(template_review_paths), (core, templates))
    negatives = {iid for iid, intent in registration["intents"].items() if intent["kind"].startswith("negative_")}
    records, failures, provisional_disagreements = [], [], []
    for kind, (sources, documents, raw_rows) in (("core", core), ("template", templates)):
        for seed, docs in sorted(documents.items()):
            for rid, doc in sorted(docs.items()):
                row = observations[(seed, rid)]
                growth = kind == "template"
                key = rid.split("-r")[0] if growth else rid
                plan = registration["archetypes"][key] if growth else registration["plans"][rid]
                errors = []
                checks = [("fixture_conformance", lambda: check_record(doc, plan, registration)),
                          ("manual_semantic_gate", lambda: observe(row, doc, registration)),
                          ("strict_full_record_gate", lambda: _audit_record(row, doc, plan, registration, growth))]
                if growth:
                    def check_terminal():
                        require(render_terminal(bundles[(seed, key)], 1, registration, terminal_data) == doc,
                                "Actual representative differs from terminal reconstruction")
                    checks.append(("whole_terminal_reconstruction", check_terminal))
                for check_name, check in checks:
                    try:
                        check()
                    except ValueError as exc:
                        errors.append({"check": check_name, "message": str(exc)})
                provisional = None
                try:
                    contexts = parse_context_observations(row, doc, registration)
                    # Zero-negative inference still requires literal/manual absence closure.
                    absence_check(row.get("negative_absence"), negatives, searchable(doc), rid)
                    grades = {iid: derive_grade(intent, rid, contexts) for iid, intent in registration["intents"].items()}
                    planned = registration["generation"]["planned_growth_intent_archetype_grades" if growth
                                                          else "planned_core_intent_doc_grades"]
                    disagreements = [{"intent_id": iid, "provisional_derived_grade": grade, "planned_grade": planned[iid][key]}
                                     for iid, grade in grades.items() if grade != planned[iid][key]]
                    provisional = {"status": "provisional_NOT_certified", "intent_grades": grades,
                                   "branch_measurement_support": {iid: branch_support(intent, contexts)
                                                                  for iid, intent in registration["intents"].items()
                                                                  if intent["kind"] == "semantic"},
                                   "planned_disagreements": disagreements}
                    provisional_disagreements.extend({"seed": seed, "dataset_id": rid, **item} for item in disagreements)
                except ValueError as exc:
                    errors.append({"check": "literal_context_extraction_or_negative_absence", "message": str(exc)})
                item = {"seed": seed, "dataset_id": rid, "source": sources[seed],
                        "raw_record_sha256": digest(raw_rows[seed][rid]),
                        "observation_original_unchanged": row, "errors": errors,
                        "provisional_independent_derivation": provisional}
                records.append(item)
                if errors:
                    failures.append({"seed": seed, "dataset_id": rid, "errors": errors,
                                     "original_manual_pass": row.get("semantic_review_passed"),
                                     "original_manual_issues": row.get("issues")})
    return {"schema_version": 1, "status": "inspection_only_NOT_validation_passed",
            "pre_retrieval": True, "actual_text_validation_passed": False,
            "strict_fixture_conformance_passed": False, "expansion_allowed": False,
            "embeddings_allowed": False, "promotion_allowed": False,
            "spec_freeze_sha256": sha(root / "spec-freeze.json"), "validator_sha256": sha(__file__),
            "stage_one_manifest": {"path": str(path.relative_to(root)), "sha256": sha(path)},
            "manual_review_artifacts": artifacts, "reviewers": reviewers,
            "terminal_templates": terminal_ref, "record_inspections": records,
            "failed_record_count": len(failures), "failures": failures,
            "provisional_label_disagreements": provisional_disagreements,
            "note": "No original false flag/issue was cleared. Provisional extraction is not pair certainty, expansion acceptance, a diagnostic bypass, or execution permission. Strict validate_stage_one remains authoritative and fail-closed."}


DIAGNOSTIC_UNKNOWN_PAIRS = {(seed, "t03p3", rid) for seed in (38871, 38872) for rid in ("t013", "t014")} | {
    (38873, qid, "t045") for qid in ("t08p1", "t08p2", "t08p3")}
DIAGNOSTIC_METADATA_DISCREPANCIES = {(38872, "t023"), (38872, "g04-r001"), (38872, "t024"), (38873, "t024")}


def all_citations_check(value, fields, label):
    """Check every actual citation, including extra scoped review/format findings."""
    count = 0
    if isinstance(value, dict):
        if "field" in value and "quote" in value:
            quote_check([value], fields, label)
            count += 1
        else:
            for child in value.values():
                count += all_citations_check(child, fields, label)
    elif isinstance(value, list):
        for child in value:
            count += all_citations_check(child, fields, label)
    return count


def diagnostic_scope_adjudication(root, path, registration, manifest_path, observations, documents):
    """This study's EXACT independently authored seven-pair mask, not a skip API."""
    root = Path(root).resolve()
    manifest_path = Path(manifest_path).resolve()
    path = input_path(root, path)
    data = load(path)
    require(data.get("schema_version") == 1
            and data.get("status") == "independent_pair_scope_adjudication_NOT_validation_passed"
            and data.get("pre_retrieval") is True and data.get("independent_of_generator") is True
            and data.get("actual_text_validation_passed") is False
            and data.get("strict_fixture_conformance_passed") is False
            and data.get("forced_recommendation") == "D", "Wrong diagnostic pair-scope adjudication")
    require(data.get("spec_freeze_sha256") == sha(Path(root) / "spec-freeze.json"), "Pair adjudication freeze differs")
    require(data["stage_manifest"]["sha256"] == sha(manifest_path)
            and bound(root, data["stage_manifest"]["path"]) == Path(manifest_path), "Pair adjudication source manifest differs")
    for name in ("source_inspection",):
        ref = data[name]
        require(sha(bound(root, ref["path"])) == ref["sha256"], "Original pair-scope source inspection changed")
    for source in data.get("manual_review_sources", []):
        require(sha(bound(root, source["path"])) == source["sha256"], "Original independent review changed")
    masks = {}
    for row in data.get("unknown_pairs", []):
        key = row.get("seed"), row.get("query_id"), row.get("dataset_id")
        require(key in DIAGNOSTIC_UNKNOWN_PAIRS and key not in masks and row.get("reason")
                and row.get("origin"), "Unregistered/duplicate/unreasoned diagnostic U")
        require((key[0], key[2]) in observations and key[1] in registration["queries"], "Unknown diagnostic pair")
        require(row.get("supported_grade_interval") == ([2, 3] if key[1] == "t03p3" else [1, 2]),
                "Unregistered uncertainty gain interval")
        quote_check(row.get("evidence"), searchable(documents[(key[0], key[2])]), "explicit semantic U")
        masks[key] = row
    require(set(masks) == DIAGNOSTIC_UNKNOWN_PAIRS, "Explicit seven-pair uncertainty scope changed/incomplete")
    discrepancy_records = {(row["seed"], row["dataset_id"])
                           for group in data.get("non_grade_metadata_discrepancies", []) for row in group["records"]}
    require(discrepancy_records == DIAGNOSTIC_METADATA_DISCREPANCIES, "Unregistered closed-fact discrepancy scope")
    zero_issue_records = {(row["seed"], row["dataset_id"])
                          for group in data.get("record_issue_dispositions", [])
                          if "All48 numeric" in group.get("pair_scope", "") or "Pruning operations explicitly" in group.get("pair_scope", "")
                          for row in group["records"]}
    require(zero_issue_records == {(s, rid) for s in (38871, 38872, 38873) for rid in ("t012", "g18-r001")}
            | {(38872, "t011"), (38872, "g02-r001")}, "Unregistered unresolved-basis scope")
    return data, masks, zero_issue_records, {"path": str(path.relative_to(root)), "sha256": sha(path)}


def context_ast_bytes(source_text):
    tree = ast.parse(source_text)
    functions = [node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == "context"]
    require(len(functions) == 1 and isinstance(functions[0], ast.FunctionDef), "Unique synchronous context helper missing")
    return ast.dump(functions[0], annotate_fields=True, include_attributes=False).encode("utf-8")


def historical_projection_source_closure(root, stage_manifest):
    """One explicit archived receipt, not a waiver for arbitrary source drift."""
    root = Path(root).resolve()
    proof_path = bound(root, "generation-source-closure.json")
    proof = load(proof_path)
    original_sha = "c25b310024eb2d03110c444e559a0cb7437bfd3cf7f2b2c5380145459934f457"
    require(proof.get("schema_version") == 1 and proof.get("original_source") == "search-relevance-eval/run.py"
            and proof.get("original_source_sha256") == proof.get("archive_sha256") == original_sha
            and stage_manifest.get("source_sha256", {}).get("search-relevance-eval/run.py") == original_sha,
            "Historical projection receipt is not the explicitly archived original")
    require(proof.get("archived_source_path") == ".local/source-archive/run-at-first-realization.py"
            and proof.get("archive_git_commit") == "56aa147db"
            and proof.get("context_function_ast_byte_representation_identical") is True
            and proof.get("corpus_bytes_unchanged") is True and proof.get("stage_manifest_unchanged") is True
            and proof.get("queries_labels_unchanged") is True, "Incomplete explicit source closure proof")
    archive = bound(root, proof["archived_source_path"])
    current = root.parent / "run.py"  # pinned harness location, never a supplied escape path
    require(sha(archive) == original_sha and sha(current) == proof.get("current_runtime_sha256"),
            "Archived/current source drift outside explicit receipt")
    archived_context, current_context = context_ast_bytes(archive.read_text()), context_ast_bytes(current.read_text())
    require(archived_context == current_context, "Production projection helper actually changed")
    return {"proof": {"path": "generation-source-closure.json", "sha256": sha(proof_path)},
            "archive": {"path": proof["archived_source_path"], "sha256": sha(archive)},
            "current_runtime": {"path": "../run.py", "sha256": sha(current)},
            "context_ast_sha256": digest(archived_context), "code_imported_or_executed": False,
            "scope": "Historical generation projection receipt only; current execution source must separately be pinned."}


def scoped_manual_citations(value, documents_by_id, inherited_id=None):
    count = 0
    if isinstance(value, dict):
        rid = value.get("dataset_id", inherited_id)
        if "field" in value and "quote" in value:
            require(rid in documents_by_id, "Scoped manual citation lacks its actual record identity")
            quote_check([value], searchable(documents_by_id[rid]), "scoped naturalness/variation finding")
            return 1
        for child in value.values():
            count += scoped_manual_citations(child, documents_by_id, rid)
    elif isinstance(value, list):
        for child in value:
            count += scoped_manual_citations(child, documents_by_id, inherited_id)
    return count


def validate_diagnostic_stage_one(root, manifest_path, core_review_paths, template_review_paths, adjudication_path):
    """Pure explicit forced-D audit; NEVER calls a nonconformant fixture passed.

    All common schema/source/context/neutral/format requirements remain strict.
    Only the separately logged t051 identity failure, eight unresolved-basis
    record issues, four non-scoring fact-set discrepancies, and exact seven
    semantic pair uncertainties are admitted and retained. Unlisted failures fail.
    """
    registration = verify_registration(root)
    root = registration["root"]
    manifest_file = input_path(root, manifest_path)
    manifest = load(manifest_file)
    require(manifest.get("schema_version") == 1
            and manifest.get("spec_freeze_sha256") == sha(root / "spec-freeze.json"), "Diagnostic manifest freeze differs")
    generation_closure = historical_projection_source_closure(root, manifest)
    seeds = registration["generation"]["seeds"]
    require(seeds == [38871, 38872, 38873] and len(registration["queries"]) == 50,
            "Diagnostic branch belongs only to the registered threshold supplement")
    core = _source_group(root, manifest.get("corpora", []), seeds, registration["plans"])
    templates = _source_group(root, manifest.get("templates", []), seeds,
                              {aid + "-r001" for aid in registration["archetypes"]})
    terminal_data, bundles, terminal_ref = _terminal_bundles(root, manifest, registration)
    observations, artifacts, reviewers = _manual_reviews(root, list(core_review_paths) + list(template_review_paths), (core, templates))
    documents = {(seed, rid): doc for _, group, _ in (core, templates) for seed, docs in group.items() for rid, doc in docs.items()}
    scope, masks, zero_issues, scope_ref = diagnostic_scope_adjudication(root, adjudication_path, registration,
                                                                       manifest_file, observations, documents)
    require({(x["path"], x["sha256"]) for x in artifacts}
            == {(x["path"], x["sha256"]) for x in scope["manual_review_sources"]}, "Adjudication/manual artifact closure differs")
    nonconformance_file = bound(root, "frozen-design-nonconformance.json")
    nonconformance = load(nonconformance_file)
    require(nonconformance.get("status") == "strict_fixture_conformance_failed"
            and nonconformance.get("affected_record_id") == "t051"
            and nonconformance.get("spec_freeze_sha256") == sha(root / "spec-freeze.json"), "Missing exact frozen t051 nonconformance")
    negatives = {iid for iid, x in registration["intents"].items() if x["kind"].startswith("negative_")}
    qrels, evidence, accepted, metadata_findings, violations = [], [], [], [], []
    manual_false, quote_count, seen_false, seen_discrepancies = 0, 0, set(), set()
    source_by_pair = {(seed, rid): (sources[seed], raw[seed][rid]) for sources, group, raw in (core, templates)
                      for seed, docs in group.items() for rid in docs}
    scoped_findings = []
    for artifact in artifacts:
        review = load(bound(root, artifact["path"]))
        assigned_seeds = {row["seed"] for row in review["record_reviews"]}
        require(len(assigned_seeds) == 1, "Scoped report needs an unambiguous source seed")
        report_seed = next(iter(assigned_seeds))
        extra = {key: value for key, value in review.items() if key not in {"record_reviews", "reviewer", "sources"}}
        quote_count += scoped_manual_citations(extra, {rid: doc for (seed, rid), doc in documents.items() if seed == report_seed})
        scoped_findings.append({"artifact": artifact, "findings_original_unchanged": extra})
    seen_text = set()
    for (seed, rid), doc in sorted(documents.items()):
        row = observations[(seed, rid)]
        growth = rid not in registration["plans"]
        map_id = rid.split("-r")[0] if growth else rid
        plan = registration["archetypes"][map_id] if growth else registration["plans"][rid]
        claim = registration["generation"]["canonical_claim_sets"][plan["claim_set"]]
        fields = check_record_common(doc, plan, registration)
        text_key = seed, doc["title"], doc["description"]
        require(text_key not in seen_text, "Duplicate actual title/description realization")
        seen_text.add(text_key)
        quote_count += all_citations_check(row, fields, f"{seed}/{rid}")
        require(row.get("exhaustive_searchable_review") is True and isinstance(row.get("issues"), list),
                "Incomplete source-field review in diagnostic evidence")
        is_unresolved = row.get("semantic_review_passed") is not True or row.get("issues") != []
        if is_unresolved:
            manual_false += 1
            seen_false.add((seed, rid))
            require((seed, rid) in zero_issues or any(key[0] == seed and key[2] == rid for key in masks),
                    "Unlisted manual semantic issue cannot enter diagnostic evidence")
        absence_check(row.get("negative_absence"), negatives, fields, rid)
        contexts = parse_context_observations(row, doc, registration)
        require(all(c["product"] == claim["product"] and c["process"] == claim["process"] for c in contexts),
                "Unregistered actual product/process discrepancy")
        require(all(c["basis"] in {"observed_not_simulated", "observed_administrative_records", "U"} for c in contexts),
                "Unregistered simulation/contextual basis cannot be waived")
        if any(c["basis"] == "U" for c in contexts):
            require((seed, rid) in zero_issues, "Unregistered unresolved observation basis")
            require(all(derive_grade(intent, rid, contexts) == 0 for intent in registration["intents"].values()
                        if intent["kind"] == "semantic"), "Unresolved basis may affect a scored semantic label")
        try:
            check_identity_scope(doc, claim)
        except ValueError as exc:
            require(rid == "t051" and claim.get("identity") == "QLR-260-MIC"
                    and claim.get("required_exact_title") == doc["title"] == "QLR-260 Microphone Module"
                    and claim.get("identity_scope") == "primary_identity"
                    and not any(token_present(text, "QLR-260-MIC") for text in fields.values()),
                    "Unlisted identity conformance failure")
            violations.append({"seed": seed, "dataset_id": rid, "failure": str(exc),
                               "strict_failure_preserved": True, "full_code_absent": True})
        facts = {fact for context in contexts for fact in context["facts"]}
        if claim.get("identity") and rid != "t051":
            identity = assertion(row.get("identity"), fields, rid + "/identity")
            require(identity in {claim["identity"], claim.get("required_exact_title")}
                    and any(token_present(e["quote"], claim["identity"]) for e in row["identity"]["evidence"]),
                    "Target identity evidence missing or changed")
            facts.add("authoritative_item_identity")
        if facts != set(claim["facts"]):
            if rid == "t051":
                require(facts == set() and set(claim["facts"]) == {"authoritative_item_identity"},
                        "Unlisted component claim divergence")
            elif (seed, rid) in DIAGNOSTIC_METADATA_DISCREPANCIES:
                expected_observed = {"observer_position"} if rid in {"t023", "g04-r001"} else {"retail_price", "stock_count"}
                require(facts == expected_observed, "Actual non-scoring fact discrepancy changed")
                seen_discrepancies.add((seed, rid))
                metadata_findings.append({"seed": seed, "dataset_id": rid, "planned_facts": claim["facts"],
                                          "actual_observed_facts": sorted(facts), "preserved_not_masked": True})
            else:
                require(any(key[0] == seed and key[2] == rid for key in masks) and rid == "t045"
                        and facts == {"sound_pressure_level_db"}, "Unlisted actual fact-set mismatch")
        # Preserve original evidence placement/content checks even for unresolved records.
        for index, context in enumerate(contexts):
            for citations in context["facts"].values():
                if plan["evidence_layout"] == "root_measurements":
                    require(all(not e["field"].startswith("distributions.") for e in citations)
                            and any(e["field"] == "description" for e in citations), "Diagnostic root-only layout violated")
                elif plan["evidence_layout"] == "nested_measurements":
                    require(all(e["field"] in {"distributions.0.title", "distributions.0.description", "distributions.0.queryContext"}
                                for e in citations), "Diagnostic nested-only layout violated")
            for name in ("product", "process", "basis"):
                require(any(e["field"] in {"title", "description", "queryContext"}
                            for e in row["contexts"][index][name]["evidence"]), "Primary observation context missing")
        intent_grades = {iid: derive_grade(intent, rid, contexts) for iid, intent in registration["intents"].items()}
        matrix = registration["generation"]["planned_growth_intent_archetype_grades" if growth else "planned_core_intent_doc_grades"]
        derived_queries = {}
        for qid, query in sorted(registration["queries"].items()):
            iid = query["intent_id"]
            pair = seed, qid, rid
            grade = "U" if pair in masks else intent_grades[iid]
            if pair not in masks and query["kind"] != "ambiguous_ungraded":
                require(type(grade) is int and grade == matrix[iid][map_id],
                        f"Unmasked known diagnostic grade disagrees: {seed}/{qid}/{rid}")
            entry = {"seed": seed, "query_id": qid, "dataset_id": rid, "grade": grade}
            if pair in masks:
                entry["uncertainty_reason"] = masks[pair]["reason"]
                entry["supported_grade_interval"] = masks[pair]["supported_grade_interval"]
            qrels.append(entry)
            derived_queries[qid] = grade
        source, raw = source_by_pair[(seed, rid)]
        record_evidence = {"seed": seed, "dataset_id": rid, "source": source,
                           "raw_record_sha256": digest(raw), "canonical_record_sha256": canonical_sha(doc),
                           "observation_original_unchanged": row,
                           "independent_intent_derivation_before_query_masks": intent_grades,
                           "independent_query_grades": derived_queries,
                           "branch_measurement_support": {iid: branch_support(intent, contexts)
                                                          for iid, intent in registration["intents"].items()
                                                          if intent["kind"] == "semantic"}}
        evidence.append(record_evidence)
        if growth:
            bundle = bundles[(seed, map_id)]
            require(render_terminal(bundle, 1, registration, terminal_data) == doc, "Diagnostic actual terminal does not reconstruct")
            accepted.append({"seed": seed, "archetype_id": map_id, "bundle_sha256": canonical_sha(bundle),
                             "representative_id": rid, "raw_record_sha256": digest(raw),
                             "diagnostic_only": True, "strict_semantic_class_passed": not is_unresolved,
                             "original_manual_pass": row.get("semantic_review_passed"),
                             "original_manual_issues": row["issues"]})
    require(len(violations) == 3 and {x["seed"] for x in violations} == set(seeds), "Original strict identity failures not preserved")
    require(seen_discrepancies == DIAGNOSTIC_METADATA_DISCREPANCIES, "Original non-scoring metadata discrepancies not preserved")
    expected_false = zero_issues | {(38871, "t013"), (38871, "t014"), (38873, "t045")}
    require(seen_false == expected_false and manual_false == 11, "Original manual false/issue scope changed")
    require(len(evidence) == 240 and len(accepted) == 60 and len(qrels) == 12000, "Diagnostic actual-label coverage incomplete")
    scored_u = sum(x["grade"] == "U" and registration["queries"][x["query_id"]]["kind"] != "ambiguous_ungraded" for x in qrels)
    known = sum(type(x["grade"]) is int for x in qrels)
    require(scored_u == 7 and known == 11513, "Diagnostic known/U counts differ")
    return {"schema_version": 1, "status": "audited_nonconformant_diagnostic_only",
            "complete_actual_label_evidence": True, "manual_actual_record_count": 240,
            "reviewed_terminal_bundle_count": 60, "all_known_pairs_inspected": True,
            "unresolved_pairs_explicitly_U": True, "terminal_substitution_only_expansion_allowed": True,
            "diagnostic_only": True, "promotion_allowed": False, "forced_recommendation": "D",
            "original_strict_conformance_failed": True, "actual_text_validation_passed": False,
            "pre_retrieval": True, "embeddings_allowed": False, "search_allowed": False,
            "parent_expansion_approval_still_required": True,
            "spec_freeze_sha256": sha(root / "spec-freeze.json"), "stage_manifest_sha256": sha(manifest_file),
            "terminal_templates_sha256": terminal_ref["sha256"], "validator_sha256": sha(__file__),
            "source_stage_one": {"path": str(manifest_file.relative_to(root)), "sha256": sha(manifest_file)},
            "reproduction_inputs": {
                "manifest_path": str(manifest_file.relative_to(root)),
                "core_review_paths": [item["path"] for item in artifacts],
                "template_review_paths": [], "adjudication_path": scope_ref["path"]},
            "terminal_templates": terminal_ref, "pair_scope_adjudication": scope_ref,
            "frozen_design_nonconformance": {"path": "frozen-design-nonconformance.json", "sha256": sha(nonconformance_file)},
            "manual_review_artifacts": artifacts, "reviewers": reviewers,
            "historical_projection_source_closure": generation_closure,
            "scoped_manual_findings_original_unchanged": scoped_findings,
            "original_manual_false_count": manual_false, "literal_citations_checked": quote_count,
            "record_evidence": evidence, "accepted_terminal_bindings": accepted,
            "strict_conformance_failures": violations, "non_scoring_metadata_discrepancies": metadata_findings,
            "explicit_unknown_pairs": list(masks.values()), "seed_specific_qrels": qrels,
            "known_pair_count": known, "scored_unknown_pair_count": scored_u,
            "intentional_ambiguity_pair_count": 480, "total_query_record_seed_pairs": len(qrels),
            "known_qrels_match_frozen": True, "seedless_qrels_allowed": False,
            "legacy_unknown_pairs_unchanged": 12,
            "note": "Complete source-bound known-plus-U evidence is NOT strict validation or promotion. Original false judgments/basis U and exact design nonconformance retained. Fixed terminal substitution requires separate parent approval; no models or retrieval are authorized."}


def validate_stage_one(root, manifest_path, core_review_paths, template_review_paths):
    """Pure first-stage gate. Does not expand, generate, embed, or write anything."""
    registration = verify_registration(root)
    root = registration["root"]
    path = input_path(root, manifest_path)
    manifest = load(path)
    require(manifest.get("schema_version") == 1 and manifest.get("spec_freeze_sha256") == sha(root / "spec-freeze.json"),
            "Stage-one manifest references another registration")
    seeds = registration["generation"]["seeds"]
    core = _source_group(root, manifest.get("corpora", []), seeds, registration["plans"])
    representatives = {aid + "-r001" for aid in registration["archetypes"]}
    templates = _source_group(root, manifest.get("templates", []), seeds, representatives)
    terminal_data, bundles, terminal_ref = _terminal_bundles(root, manifest, registration)
    observations, artifacts, reviewers = _manual_reviews(root, list(core_review_paths) + list(template_review_paths),
                                                        (core, templates))
    reviewed, accepted, seen_text = [], [], {}
    for kind, (sources, documents, raw_rows) in (("core", core), ("template", templates)):
        for seed, docs in sorted(documents.items()):
            for rid, doc in sorted(docs.items()):
                growth = kind == "template"
                aid = rid.split("-r")[0] if growth else None
                plan = registration["archetypes"][aid] if growth else registration["plans"][rid]
                text_key = (seed, doc.get("title"), doc.get("description"))
                require(text_key not in seen_text, "Duplicate complete title/description realization")
                seen_text[text_key] = rid
                audit = _audit_record(observations[(seed, rid)], doc, plan, registration, growth)
                item = {"seed": seed, "dataset_id": rid, "source": sources[seed],
                        "raw_record_sha256": digest(raw_rows[seed][rid]), "canonical_record_sha256": canonical_sha(doc),
                        "observation": observations[(seed, rid)], "independent_derivation": audit}
                reviewed.append(item)
                if growth:
                    bundle = bundles[(seed, aid)]
                    rendered = render_terminal(bundle, 1, registration, terminal_data)
                    require(rendered == doc, "Reviewed growth representative does not equal declared terminal reconstruction")
                    accepted.append({"seed": seed, "archetype_id": aid, "bundle_sha256": canonical_sha(bundle),
                                     "representative_id": rid, "raw_record_sha256": digest(raw_rows[seed][rid])})
    return {"schema_version": 1, "status": "stage_one_passed", "independent_validation": True,
            "pre_retrieval": True, "actual_text_validation_passed": False,
            "stage_one_actual_text_validation_passed": True, "full_expansion_validation_passed": False, "embeddings_allowed": False,
            "spec_freeze_sha256": sha(root / "spec-freeze.json"), "validator_sha256": sha(__file__),
            "stage_one_manifest": {"path": str(path.relative_to(root)), "sha256": sha(path)},
            "core_sources": list(core[0].values()), "template_sources": list(templates[0].values()),
            "terminal_templates": terminal_ref, "accepted_terminal_bindings": accepted,
            "manual_review_artifacts": artifacts, "reviewers": reviewers, "record_evidence": reviewed,
            "coverage": {"manual_core_records": sum(len(x) for x in core[1].values()),
                         "manual_complete_growth_bundles": len(accepted), "legacy_unknown_pairs_unchanged": 12},
            "limitation": "240 source-bound actual record/class reviews, not6000 independent manual votes or phenomena. Expansion, full qrels and execution permission remain pending."}


def verify_footer_repair(root, old_manifest_path, new_manifest_path, approval_path):
    """Pure exact before/after closure for the specifically approved factual repair."""
    registration = verify_registration(root)
    root = registration["root"]
    old_file, new_file, approval_file = (input_path(root, p) for p in
                                         (old_manifest_path, new_manifest_path, approval_path))
    old, new, approval = load(old_file), load(new_file), load(approval_file)
    require(approval.get("schema_version") == 1 and approval.get("approved_by") == "parent-agent"
            and approval.get("pre_retrieval") is True and approval.get("preserve_originals") is True
            and approval.get("frozen_queries_labels_claims_and_all_other_record_fields_must_not_change") is True,
            "No source-bound narrow repair approval")
    require(approval.get("spec_freeze_sha256") == sha(root / "spec-freeze.json")
            == old.get("spec_freeze_sha256") == new.get("spec_freeze_sha256"), "Repair changed registration")
    require(approval.get("source_manifest_sha256") == sha(old_file), "Approved old manifest changed")
    finding_file = bound(root, approval["finding_path"])
    require(sha(finding_file) == approval["finding_sha256"], "C factual rejection changed")
    finding = load(finding_file)
    old_footers = {}
    for item in finding["literal_evidence"]:
        seed = item["seed"]
        require(seed not in old_footers or old_footers[seed] == item["footer_quote"], "Ambiguous original footer")
        old_footers[seed] = item["footer_quote"]
    seeds = registration["generation"]["seeds"]
    require(set(old_footers) == set(seeds) and set(approval["new_footers"]) == {str(s) for s in seeds},
            "Repair footer seed coverage incomplete")
    changes, unchanged, source_bindings = [], 0, []
    for kind, expected_ids in (("corpora", set(registration["plans"])),
                               ("templates", {aid + "-r001" for aid in registration["archetypes"]})):
        before = _source_group(root, old[kind], seeds, expected_ids)
        after = _source_group(root, new[kind], seeds, expected_ids)
        for seed in seeds:
            require(before[0][seed]["path"] != after[0][seed]["path"], "Repair must preserve versioned original sources")
            for rid, original in before[1][seed].items():
                old_footer, new_footer = old_footers[seed], approval["new_footers"][str(seed)]
                require(len(old_footer.split()) == len(new_footer.split()), "Approved repair changed footer token count")
                expected = deepcopy(original)
                count = original["description"].count(old_footer)
                require(count in (0, 1), "Unexpected repeated original footer")
                if count:
                    expected["description"] = original["description"].replace(old_footer, new_footer)
                    expected["queryContext"] = production_context(expected)
                require(after[1][seed][rid] == expected, f"Repair exceeded approved actual fields: {seed}/{rid}")
                expected_raw = before[2][seed][rid].replace(old_footer.encode(), new_footer.encode()) if count else before[2][seed][rid]
                require(after[2][seed][rid] == expected_raw, "Repair changed unapproved raw JSONL bytes")
                plan = (registration["plans"][rid] if kind == "corpora"
                        else registration["archetypes"][rid.split("-r")[0]])
                # This API proves only the approved delta and its word budgets;
                # unrelated pre-existing semantic/identity issues belong to stage one.
                budget = registration["generation"]["budgets"][plan["prose_budget"]]
                require(budget["min_words"] <= len(expected["description"].split()) <= budget["max_words"],
                        "Repair violated frozen description word budget")
                require(after[1][seed][rid]["queryContext"] == production_context(after[1][seed][rid]),
                        "Repair root projection is not production-derived")
                if count:
                    changes.append({"seed": seed, "dataset_id": rid,
                                    "changed_fields": ["description", "queryContext"],
                                    "before_raw_sha256": digest(before[2][seed][rid]),
                                    "after_raw_sha256": digest(after[2][seed][rid])})
                else:
                    unchanged += 1
            source_bindings.extend([{"kind": kind, "seed": seed, "before": before[0][seed], "after": after[0][seed]}])
    old_term, _, old_term_ref = _terminal_bundles(root, old, registration)
    new_term, _, new_term_ref = _terminal_bundles(root, new, registration)
    require(approval.get("source_terminals_sha256") == old_term_ref["sha256"], "Approved old terminal bytes changed")
    expected_term = deepcopy(old_term)
    for bundle in expected_term["bundles"]:
        old_footer, new_footer = old_footers[bundle["seed"]], approval["new_footers"][str(bundle["seed"])]
        require(bundle["metadata"]["description"].count(old_footer) == 1, "Growth bundle lacks unique rejected footer")
        bundle["metadata"]["description"] = bundle["metadata"]["description"].replace(old_footer, new_footer)
        bundle["metadata"]["queryContext"] = production_context(bundle["metadata"])
        if "projections" in bundle:
            bundle["projections"]["dataset"] = bundle["metadata"]["queryContext"]
    require(expected_term == new_term, "Repair altered terminal atoms/slots/structure beyond approved footer")
    old_bytes = bound(root, old_term_ref["path"]).read_bytes()
    for seed in seeds:
        old_bytes = old_bytes.replace(old_footers[seed].encode(), approval["new_footers"][str(seed)].encode())
    require(old_bytes == bound(root, new_term_ref["path"]).read_bytes(), "Terminal raw bytes changed outside exact footer replacement")
    return {"schema_version": 1, "status": "approved_footer_delta_verified",
            "pre_retrieval": True, "actual_text_validation_passed": False, "embeddings_allowed": False,
            "spec_freeze_sha256": sha(root / "spec-freeze.json"), "validator_sha256": sha(__file__),
            "approval": {"path": str(approval_file.relative_to(root)), "sha256": sha(approval_file)},
            "finding": {"path": approval["finding_path"], "sha256": sha(finding_file)},
            "before_manifest": {"path": str(old_file.relative_to(root)), "sha256": sha(old_file)},
            "after_manifest": {"path": str(new_file.relative_to(root)), "sha256": sha(new_file)},
            "source_bindings": source_bindings, "terminal_before": old_term_ref, "terminal_after": new_term_ref,
            "changed_actual_rows": len(changes), "unchanged_raw_rows": unchanged,
            "changed_terminal_bundles": len(new_term["bundles"]), "exact_changes": changes,
            "note": "Exact factual footer delta only. Fresh complete240 core/class semantic audit still required; no grade or query changed."}


def _lift_quote(text, quote, values_from, values_to):
    """Map a literal phrase through complete typed-slot spans, never free replace."""
    reference, spans, position = "", [], 0
    for match in PLACEHOLDER.finditer(text):
        reference += text[position:match.start()]
        start = len(reference)
        value = values_from[match.group(1)]
        reference += value
        spans.append((start, len(reference), match.group(1)))
        position = match.end()
    reference += text[position:]
    for occurrence in re.finditer(re.escape(quote), reference):
        start, end = occurrence.span()
        replacements, valid = [], True
        for left, right, slot in spans:
            if left < end and right > start:
                if not (start <= left and right <= end):
                    valid = False
                    break
                replacements.append((left - start, right - start, values_to[slot]))
        if valid:
            lifted = quote
            for left, right, value in reversed(replacements):
                lifted = lifted[:left] + value + lifted[right:]
            return lifted
    raise ValueError("Quotation absent from terminal or cuts inside a neutral slot")


def lift_observation(observation, bundle, replica, terminal_data):
    """Retain manual provenance; derived literal quotes are not new manual votes."""
    out = deepcopy(observation)
    aid = bundle["archetype_id"]
    before, after = _slot_values(aid, 1, terminal_data), _slot_values(aid, replica, terminal_data)
    template_fields = searchable(bundle["metadata"])

    def walk(value):
        if isinstance(value, dict):
            if "field" in value and "quote" in value:
                require(value["field"] in template_fields, "Review cites nonterminal field")
                value["quote"] = _lift_quote(template_fields[value["field"]], value["quote"], before, after)
            else:
                for child in value.values():
                    walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)
    walk(out)
    out["dataset_id"] = after["record_id"]
    return out


def validate_expansion(root, manifest_path, stage_validation_path):
    """Pure exhaustive row/projection/slot/label closure; no code from B imported."""
    registration = verify_registration(root)
    root = registration["root"]
    manifest_file, stage_file = input_path(root, manifest_path), input_path(root, stage_validation_path)
    manifest, saved = load(manifest_file), load(stage_file)
    require(manifest.get("schema_version") == 1
            and manifest.get("spec_freeze_sha256") == sha(root / "spec-freeze.json")
            and manifest.get("stage_validation_sha256") == sha(stage_file), "Expansion/stage binding mismatch")
    require(saved.get("status") == "stage_one_passed" and saved.get("validator_sha256") == sha(__file__),
            "Unverified/stale stage-one validation")
    stage_ref = saved["stage_one_manifest"]
    require(sha(bound(root, stage_ref["path"])) == stage_ref["sha256"], "Stage-one manifest changed")
    paths = [item["path"] for item in saved["manual_review_artifacts"]]
    repeated = validate_stage_one(root, stage_ref["path"], paths, [])
    require(repeated == saved, "Stage validation is not reproducible from source/manual artifacts")
    stage_manifest = load(bound(root, stage_ref["path"]))
    terminal_data, bundles, _ = _terminal_bundles(root, stage_manifest, registration)
    seeds = registration["generation"]["seeds"]
    levels = {x["total_records"]: x["growth_replicas_per_archetype"]
              for x in registration["generation"]["growth"]["levels"]}
    require(60 in levels, "Core60 level missing")
    sources, docs, raw = {}, {}, {}
    for item in manifest.get("corpora", []):
        key = item.get("seed"), item.get("catalog_size")
        require(key in {(s, n) for s in seeds for n in levels} and key not in sources,
                "Unknown/duplicate expansion seed/size")
        source = bound(root, item["path"])
        require(sha(source) == item.get("sha256"), "Expanded corpus bytes changed")
        records, raw_rows = jsonl_rows(source)
        expected = set(registration["plans"]) | {aid + f"-r{replica:03}" for aid in registration["archetypes"]
                                                    for replica in range(1, levels[key[1]] + 1)}
        require(set(records) == expected and len(records) == key[1], "Expanded ID/count mismatch")
        sources[key], docs[key], raw[key] = item, records, raw_rows
    require(set(sources) == {(s, n) for s in seeds for n in levels}, "All nine seed/size corpora required")
    evidence = {(item["seed"], item["dataset_id"]): item for item in saved["record_evidence"]}
    max_size = max(levels)
    matrices, expanded_evidence, bound_corpora = {}, [], []
    for seed in seeds:
        for size in levels:
            for rid, line in raw[(seed, size)].items():
                require(line == raw[(seed, max_size)][rid], "Cross-size raw row not byte-identical")
            bound_corpora.append({"seed": seed, "catalog_size": size, "path": sources[(seed, size)]["path"],
                                  "sha256": sources[(seed, size)]["sha256"], "dataset_count": size,
                                  "record_ids_sha256": canonical_sha(sorted(docs[(seed, size)]))})
        matrix = {}
        for rid, actual in docs[(seed, max_size)].items():
            if rid in registration["plans"]:
                original = evidence[(seed, rid)]
                require(digest(raw[(seed, max_size)][rid]) == original["raw_record_sha256"],
                        "Core raw source changed during expansion")
                audit = original["independent_derivation"]
                observed = original["observation"]
                binding = {"manual_source": original["source"], "manual_raw_record_sha256": original["raw_record_sha256"]}
            else:
                match = GROWTH_ID.fullmatch(rid)
                require(match is not None, "Malformed growth ID")
                aid, replica = "g" + match.group(1), int(match.group(2))
                require(replica <= 97, "Growth replica outside frozen domain")
                bundle = bundles[(seed, aid)]
                expected = render_terminal(bundle, replica, registration, terminal_data)
                require(actual == expected, f"Expanded entire metadata does not reconstruct: {seed}/{rid}")
                expected_bytes = (json.dumps(expected, sort_keys=True, separators=(",", ":"),
                                             ensure_ascii=False) + "\n").encode("utf-8")
                require(raw[(seed, max_size)][rid] == expected_bytes,
                        "Expanded whole raw row differs from canonical reviewed-terminal serialization")
                original = evidence[(seed, aid + "-r001")]
                observed = lift_observation(original["observation"], bundle, replica, terminal_data)
                audit = _audit_record(observed, actual, registration["archetypes"][aid], registration, True)
                require(audit["intent_grades"] == original["independent_derivation"]["intent_grades"],
                        "Safe-slot expansion changed semantic labels")
                binding = {"manual_representative": aid + "-r001", "manual_source": original["source"],
                           "manual_raw_record_sha256": original["raw_record_sha256"],
                           "accepted_bundle_sha256": canonical_sha(bundle), "typed_slots": _slot_values(aid, replica, terminal_data)}
            matrix[rid] = audit["intent_grades"]
            expanded_evidence.append({"seed": seed, "dataset_id": rid, "actual_record_sha256": canonical_sha(actual),
                                      "actual_raw_row_sha256": digest(raw[(seed, max_size)][rid]),
                                      "binding": binding, "manually_reviewed_contexts_or_safe_slot_lift": observed["contexts"],
                                      "branch_measurement_support": audit["branch_measurement_support"]})
        matrices[seed] = matrix
    first = matrices[seeds[0]]
    require(all(matrices[seed] == first for seed in seeds), "Cannot share seedless qrels: independent matrices differ")
    qrels = [{"query_id": qid, "dataset_id": rid, "grade": first[rid][query["intent_id"]]}
             for qid, query in sorted(registration["queries"].items()) for rid in sorted(first)]
    require(len(qrels) == len(registration["queries"]) * max_size, "Expanded qrels incomplete")
    for row in qrels:
        if row["grade"] == "U":
            require(registration["queries"][row["query_id"]]["kind"] == "ambiguous_ungraded", "Unresolved NEW scored pair")
    return {"schema_version": 1, "status": "expansion_validation_passed", "independent_validation": True,
            "pre_retrieval": True, "actual_text_validation_passed": True, "embeddings_allowed": False,
            "spec_freeze_sha256": sha(root / "spec-freeze.json"), "validator_sha256": sha(__file__),
            "expansion_manifest": {"path": str(manifest_file.relative_to(root)), "sha256": sha(manifest_file)},
            "stage_validation": {"path": str(stage_file.relative_to(root)), "sha256": sha(stage_file)},
            "corpora": sorted(bound_corpora, key=lambda x: (x["seed"], x["catalog_size"])),
            "seedless_qrels_shared_only_after_all_seed_matrices_equal": True, "qrels": qrels,
            "expanded_evidence": expanded_evidence, "legacy_diagnostic_incomplete": True,
            "legacy_unknown_pairs_unchanged": 12,
            "coverage": {"unique_actual_rows_closed": len(expanded_evidence),
                         "manual_core_records": saved["coverage"]["manual_core_records"],
                         "manual_complete_growth_bundles": saved["coverage"]["manual_complete_growth_bundles"],
                         "seedless_query_record_pairs": len(qrels)},
            "note": "Supplementary fixture validation only. Legacy U unchanged; no independent-topic/production claim. Main must separately approve immutable embedding/retrieval execution."}


def audit_vocabulary(root):
    """Unassociated global vocabulary; never emit claim/record/group/grade maps."""
    registration = verify_registration(root)
    generation = registration["generation"]
    claims = list(generation["canonical_claim_sets"].values())
    human = lambda value: value.replace("_", " ")
    definitions = generation["fact_semantics"]
    return {
        "schema_version": 1,
        "purpose": "Unassociated terminology only. Independently infer actual content; vocabulary membership proves no claim. No record roles, expected labels or claim-set associations supplied.",
        "source_specification_sha256": sha(Path(root) / "generation-spec.json"),
        "products": {key: definitions.get(key, human(key)) for key in sorted({c["product"] for c in claims})},
        "processes": {key: definitions.get(key, human(key)) for key in sorted({c["process"] for c in claims})},
        "facts": {key: definitions.get(key, "Documented row-associated " + human(key) + "; distinguish an actual measured/ledger variable from a topic mention or contextual provenance.")
                  for key in sorted({fact for c in claims for fact in c["facts"]})},
        "basis": {
            "observed_not_simulated": "Actual observed physical/experimental measurements, not hypothetical or simulated. Do not apply to an administrative ledger merely because its values were recorded.",
            "observed_administrative_records": "Observed ledger, inventory, registration, invoice or catalog entries; truthful administrative evidence, not physical trials.",
            "simulation_only": "Simulated/model-generated values without actual observations of the claimed phenomenon.",
            "contextual_topic_only": "Topic/context documented without collecting the requested measurement observations.",
            "U": "Unresolved, unsupported or contradictory basis; never automatically irrelevant zero."
        },
        "field_path_convention": {
            "dataset": ["title", "description", "keywords.0", "publisher.name", "queryContext"],
            "distribution": ["distributions.0.title", "distributions.0.description", "distributions.0.format", "distributions.0.queryContext"],
            "rule": "Use exact existing source field paths; indexes are zero-based and examples do not imply fields exist. Cite minimal literal phrases in actual content. IDs, structural controls and plan labels are not semantic evidence."
        }
    }


def exclusive_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, indent=2, sort_keys=True, ensure_ascii=False)
        stream.write("\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("vocabulary", "stage-one", "inspect-stage-one", "diagnostic-stage-one", "expansion", "footer-delta"))
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--core-review", type=Path, action="append", default=[])
    parser.add_argument("--template-review", type=Path, action="append", default=[])
    parser.add_argument("--stage-validation", type=Path)
    parser.add_argument("--old-manifest", type=Path)
    parser.add_argument("--approval", type=Path)
    parser.add_argument("--adjudication", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.action == "vocabulary":
        result = audit_vocabulary(args.root)
    elif args.action in {"stage-one", "inspect-stage-one"}:
        require(args.manifest is not None, "Stage-one manifest required")
        validate = validate_stage_one if args.action == "stage-one" else inspect_stage_one
        result = validate(args.root, args.manifest, args.core_review, args.template_review)
    elif args.action == "diagnostic-stage-one":
        require(args.manifest is not None and args.adjudication is not None, "Diagnostic source adjudication required")
        result = validate_diagnostic_stage_one(args.root, args.manifest, args.core_review,
                                               args.template_review, args.adjudication)
    elif args.action == "expansion":
        require(args.manifest is not None and args.stage_validation is not None, "Expansion inputs required")
        result = validate_expansion(args.root, args.manifest, args.stage_validation)
    else:
        require(args.manifest is not None and args.old_manifest is not None and args.approval is not None,
                "Footer delta inputs required")
        result = verify_footer_repair(args.root, args.old_manifest, args.manifest, args.approval)
    root = args.root.resolve()
    output = args.output.resolve() if args.output.is_absolute() else (root / args.output).resolve()
    require(output.is_relative_to(root), "Output escapes study root")
    exclusive_json(output, result)
    print(json.dumps({"path": str(output.relative_to(root)), "sha256": sha(output),
                      "status": result.get("status", "vocabulary_not_validation")}))


if __name__ == "__main__":
    main()
