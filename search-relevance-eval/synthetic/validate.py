#!/usr/bin/env python3
"""Independent pre-retrieval actual-text/evidence gate; no generator/search imports.

Semantic observations come from fresh-context manual review of actual searchable
fields, not generator fact tags. This program checks their provenance, literal
quotes and coverage, independently derives grades, and compares frozen qrels.
Substring checking cannot prove entailment: a passed manual semantic review is
mandatory, and its signed-off observations are retained in the evidence artifact.
"""
import argparse
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
SEARCH_ROOTS = {"title", "description", "keywords", "publisher", "queryContext",
                "temporal", "spatial", "distributions"}
DIST_FIELDS = {"title", "description", "format", "queryContext"}
LEAK = re.compile(r"\b(?:grade[ _:=]+[0-3]|(?:intent|query)[ _-]?id\s*[:=]|"
                  r"hard_negative_for_intent_ids|positive_anchor_intent_ids|"
                  r"canonical_claims|intent_doc_grades|wrong_process|wrong_product|"
                  r"contradicted_measurement)\b", re.I)


def require(ok, message):
    if not ok:
        raise ValueError(message)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def jsonl(path):
    return [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]


def unique(rows, key, label):
    require(all(key in r for r in rows), f"Missing {label} key")
    out = {r[key]: r for r in rows}
    require(len(out) == len(rows), f"Duplicate {label}")
    return out


def bound(root, relative):
    require(isinstance(relative, str) and relative and not Path(relative).is_absolute(),
            "Artifact paths must be nonempty and relative")
    root = Path(root).resolve()
    path = (root / relative).resolve()
    require(path.is_relative_to(root), "Artifact path escapes synthetic root")
    require(path.is_file(), f"Missing artifact: {relative}")
    return path


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
    """Only actual searchable metadata; structural IDs/claim tags never evidence."""
    out = {}
    for key in SEARCH_ROOTS:
        if key not in doc:
            continue
        if key == "distributions":
            for n, distribution in enumerate(doc[key]):
                for field in DIST_FIELDS:
                    if field in distribution:
                        out.update(strings(distribution[field], f"distributions.{n}.{field}"))
        else:
            out.update(strings(doc[key], key))
    return out


def quote_check(evidence, fields, label):
    require(isinstance(evidence, list) and evidence, f"Missing searchable evidence: {label}")
    for item in evidence:
        require(isinstance(item, dict), f"Invalid evidence: {label}")
        field, quote = item.get("field"), item.get("quote")
        require(field in fields and isinstance(quote, str) and quote.strip(),
                f"Non-searchable/empty evidence: {label}/{field}")
        require(quote in fields[field], f"Quote absent from actual field: {label}/{field}")


def positive_quote_check(evidence, fields, label):
    quote_check(evidence, fields, label)
    # Fail closed on explicit absence/denial in a claimed positive quotation.
    # Use minimal supporting phrases; a reviewer can report uncertainty instead.
    denial = re.compile(r"\b(?:no|not|without|unavailable|missing|omitted|excluded|unmeasured|never)\b", re.I)
    require(not any(denial.search(item["quote"]) for item in evidence),
            f"Positive evidence contains explicit denial/absence: {label}")


def assertion(item, fields, label):
    require(isinstance(item, dict) and isinstance(item.get("value"), str)
            and item["value"], f"Missing independent observation: {label}")
    quote_check(item.get("evidence"), fields, label)
    return item["value"]


def production_context(doc, distribution=False):
    # Independently transcribed from ElasticSearchIndexer.scala:755-775.
    title = doc.get("title") if doc.get("title") is not None else "None"
    description = doc.get("description") if doc.get("description") is not None else "None"
    if distribution:
        fmt = doc.get("format") if doc.get("format") is not None else "None"
        return f"Title: {title}\nFormat: {fmt}\nDescription: {description}\n"
    return f"Title: {title}\nDescription: {description}\n"


def token_present(text, token):
    # A parent token is not an exact occurrence inside a component/version SKU.
    return re.search(r"(?<![\w.:-])" + re.escape(token) +
                     r"(?!(?:[\w:-]|\.[A-Za-z0-9]))", text, re.I) is not None


def formats_in(doc):
    available = set()
    for d in doc.get("distributions", []):
        value = d.get("format", "")
        for value in value if isinstance(value, list) else [value]:
            available.update(re.findall(r"\b(?:CSV|JSON|PDF|XLSX|XML|GEOJSON)\b", str(value).upper()))
    return available


def check_record(doc, plan, queries):
    rid = doc["identifier"]
    require(isinstance(doc.get("title"), str) and doc["title"].strip(), f"Missing title: {rid}")
    require(isinstance(doc.get("description"), str) and doc["description"].strip(), f"Missing description: {rid}")
    require(doc.get("queryContext") == production_context(doc), f"Non-production root queryContext: {rid}")
    require(doc.get("publishingState") in (None, "published"), f"Unpublished corpus record: {rid}")
    require(doc.get("quality") == 1 and doc.get("hasQuality") is True, f"Non-neutral quality: {rid}")
    distributions = doc.get("distributions")
    require(isinstance(distributions, list) and 1 <= len(distributions) <= 3,
            f"Distribution count outside frozen range: {rid}")
    for d in distributions:
        require(d.get("queryContext") == production_context(d, True),
                f"Non-production distribution queryContext: {rid}")
        require(d.get("downloadURL") or d.get("accessURL"), f"Distribution not downloadable: {rid}")
    fields = searchable(doc)
    for field, text in fields.items():
        require(not LEAK.search(text), f"Label/answer-key leakage: {rid}/{field}")
        for q in queries.values():
            require(q["kind"] == "exact" or q["query"].casefold() not in text.casefold()
                    or len(q["query"].split()) < 4,
                    f"Full target query copied into metadata: {rid}/{q['id']}/{field}")
    required_formats = set(plan["distribution_requirements"]["required_formats"])
    require(formats_in(doc) == required_formats, f"Unsupported/missing actual distribution format: {rid}")
    identity = plan.get("identifier_requirements")
    if identity:
        target = identity["authoritative_identifier"]
        scope = identity["identifier_scope"]
        if scope == "distribution_only":
            allowed = {f: t for f, t in fields.items() if f.startswith("distributions.")}
            forbidden = {f: t for f, t in fields.items() if not f.startswith("distributions.")}
        elif scope == "title_only":
            # A title may be duplicated only by the exact production-derived context.
            allowed = {"title": doc["title"]}
            forbidden = {f: t for f, t in fields.items() if f not in ("title", "queryContext")}
        else:
            allowed = {"description": doc["description"]}
            forbidden = {}
        require(any(token_present(t, target) for t in allowed.values()), f"Authoritative ID absent in scope: {rid}")
        require(not any(token_present(t, target) for t in forbidden.values()), f"Identifier scope leakage: {rid}")
        if identity.get("exact_title"):
            require(doc["title"] == identity["exact_title"], f"Frozen exact title missing: {rid}")
    return fields


def review_record(observation, doc, plan, reviewers):
    rid = doc["identifier"]
    require(observation.get("reviewer_id") in reviewers, f"Unknown reviewer: {rid}")
    require(observation.get("semantic_review_passed") is True and
            observation.get("exhaustive_searchable_review") is True,
            f"Fresh exhaustive semantic review incomplete: {rid}")
    require(observation.get("issues") == [] and observation.get("no_answer_claims") == [],
            f"Unresolved issue or no-answer conjunction supported: {rid}")
    fields = searchable(doc)
    contexts = observation.get("contexts")
    require(isinstance(contexts, list) and contexts, f"Missing independently observed context: {rid}")
    normalized = []
    for n, context in enumerate(contexts):
        label = f"{rid}/context{n}"
        product = assertion(context.get("product"), fields, label + "/product")
        process = assertion(context.get("process"), fields, label + "/process")
        basis = assertion(context.get("basis"), fields, label + "/basis")
        require(basis in ("representative_measurements_not_simulation", "simulation_only",
                          "observed_administrative_records", "contextual_topic_only"),
                f"Unresolved empirical basis: {label}")
        facts = context.get("facts")
        require(isinstance(facts, dict), f"Missing independently observed measurements: {label}")
        for fact, evidence in facts.items():
            positive_quote_check(evidence, fields, label + "/" + fact)
        require(context.get("distribution_content_verified") is True,
                f"Distribution/content association not manually checked: {label}")
        normalized.append({"product": product, "process": process, "basis": basis, "facts": set(facts)})
    negatives = observation.get("hard_negatives", {})
    required_negatives = set(plan.get("hard_negative_for_intent_ids", []))
    require(required_negatives <= set(negatives), f"Missing named hard-negative explanations: {rid}")
    for intent in required_negatives:
        item = negatives[intent]
        require(isinstance(item.get("reason"), str) and item["reason"].strip(),
                f"Missing hard-negative reasoning: {rid}/{intent}")
        quote_check(item.get("evidence"), fields, rid + "/hard-negative/" + intent)
    identity = None
    if plan.get("identifier_requirements"):
        identity = assertion(observation.get("identity"), fields, rid + "/identity")
        require(identity == plan["identifier_requirements"]["authoritative_identifier"],
                f"Independently observed identity disagrees: {rid}")
        require(any(token_present(item["quote"], identity) for item in observation["identity"]["evidence"]),
                f"Identity quotation does not identify authoritative string: {rid}")
    return normalized, identity


def derive_grade(intent, rid, contexts, available_formats):
    """Independent rubric implementation. No plan facts, roles or labels read."""
    kind = intent["kind"]
    if kind == "exact":
        return 3 if rid in intent["authoritative_target_ids"] else 0
    if kind == "no_answer":
        return 0  # Exhaustive manual conjunction-absence checks are mandatory above.
    if kind == "ambiguous":
        return max((intent["process_grade_rules"].get(c["process"], 0) for c in contexts), default=0)
    required = intent["required_claims"]
    if required["formats_any"] and not set(required["formats_any"]) & available_formats:
        return 0
    grades = []
    for context in contexts:
        # Administrative/context-only observations are valid independent findings,
        # but do not satisfy the scored experimental-measurement requirement.
        if (context["product"] != required["product"] or context["process"] != required["process"]
                or context["basis"] != required["constraint"]):
            continue
        supported = len(set(required["facts"]) & context["facts"])
        grades.append(min(supported, 3))
    return max(grades, default=0)


def validate_qrels(rows, queries, ids):
    out = {}
    for row in rows:
        key = (row.get("query_id"), row.get("dataset_id"))
        require(key[0] in queries and key[1] in ids and key not in out, "Unknown/duplicate qrel pair")
        grade = row.get("grade")
        require(type(grade) is int and grade in (0, 1, 2, 3), "Qrel must have a numeric judged grade 0..3")
        out[key] = grade
    require(set(out) == {(q, rid) for q in queries for rid in ids}, "Qrels lack exhaustive 75x180 coverage")
    return out


def variation_check(corpora, generation):
    """Observable variation thresholds complement mandatory semantic seed review."""
    seeds = list(generation["seeds"])
    ids = list(corpora[seeds[0]])
    changed_lengths = changed_distributions = 0
    for rid in ids:
        records = [corpora[s][rid] for s in seeds]
        lengths = [len(r["description"].split()) for r in records]
        changed_lengths += max(lengths) - min(lengths) >= 10
        changed_distributions += len({len(r["distributions"]) for r in records}) > 1
    require(changed_lengths / len(ids) >= .6, "Insufficient independent description-length variation")
    require(changed_distributions / len(ids) >= .3, "Insufficient independent distribution-count variation")
    for seed, docs in corpora.items():
        for rid, doc in docs.items():
            sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", doc["description"])
                         if len(s.strip().split()) >= 5]
            require(max(Counter(sentences).values(), default=0) <= 1,
                    f"Repeated-sentence padding: {seed}/{rid}")
        lengths = [len(d["description"].split()) for d in docs.values()]
        for low, high in ((45, 75), (90, 140), (160, 220)):
            require(sum(low <= n <= high for n in lengths) / len(docs) >= .2,
                    f"Frozen description length band underrepresented: {seed}/{low}-{high}")
        require(all(45 <= n <= 220 for n in lengths), f"Description outside frozen limits: {seed}")
        require(sum(len(d["distributions"]) > 1 for d in docs.values()) / len(docs) >= .3,
                f"Insufficient nested distribution variation: {seed}")
        templates = Counter(re.sub(r"\d+(?:\.\d+)?", "#", d["title"].casefold()) for d in docs.values())
        require(max(templates.values()) <= 5, f"Repeated title template: {seed}")
        publishers = {json.dumps(d.get("publisher"), sort_keys=True) for d in docs.values()}
        require(len(publishers) >= 12, f"Insufficient publisher variety: {seed}")
    return {"length_variation_records": changed_lengths, "distribution_variation_records": changed_distributions}


def verify_freeze(root):
    spec = importlib.util.spec_from_file_location("independent_freeze_gate", root / "freeze.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.verify(root)


def validate(root, evidence_path, derived_audit=None):
    root = Path(root).resolve()
    frozen = verify_freeze(root)
    generation = json.loads((root / "generation-spec.json").read_text())
    intents = unique(jsonl(root / "intents.jsonl"), "intent_id", "intent")
    queries = unique(jsonl(root / "query-spec.jsonl"), "id", "query")
    plans = unique(generation["record_plans"], "id", "plan")
    evidence_path = Path(evidence_path).resolve()
    require(evidence_path.is_relative_to(root), "Evidence must live under synthetic root")
    evidence = json.loads(evidence_path.read_text())
    require(evidence.get("schema_version") == 1 and evidence.get("pre_retrieval") is True
            and evidence.get("independent_of_generator") is True, "Invalid independent evidence provenance")
    require(evidence.get("spec_freeze_sha256") == sha(root / "spec-freeze.json"), "Evidence references another freeze")
    reviewers = unique(evidence.get("reviewers", []), "id", "reviewer")
    require(reviewers, "No fresh-context manual reviewers")
    for reviewer in reviewers.values():
        require(reviewer.get("context_id") and reviewer.get("model") and "parameters" in reviewer
                and reviewer.get("role") == "independent_semantic_auditor"
                and reviewer.get("rankings_seen") is False and reviewer.get("generator_context") is False,
                "Reviewer lacks independent fresh-context provenance")
    query_reviews = unique(evidence.get("query_reviews", []), "query_id", "query review")
    require(set(query_reviews) == set(queries), "Independent paraphrase review incomplete")
    for qid, review in query_reviews.items():
        require(review.get("intent_id") == queries[qid]["intent_id"] and review.get("equivalent") is True
                and review.get("reviewer_id") in reviewers and review.get("rationale"),
                f"Unresolved query-intent equivalence: {qid}")
    for artifact in evidence.get("source_review_artifacts", []):
        require(sha(bound(root, artifact["path"])) == artifact["sha256"], "Original manual review artifact changed")
    for artifact in evidence.get("prefreeze_audit_artifacts", []):
        require(sha(bound(root, artifact["path"])) == artifact["sha256"], "Pre-freeze audit artifact changed")
    if evidence.get("query_review_artifact"):
        artifact = evidence["query_review_artifact"]
        require(sha(bound(root, artifact["path"])) == artifact["sha256"], "Original query-equivalence review changed")
    qrels_path = root / "qrels.jsonl"
    qrels = validate_qrels(jsonl(qrels_path), queries, plans)
    for (qid, rid), grade in qrels.items():
        require(grade == generation["intent_doc_grades"][queries[qid]["intent_id"]][rid],
                f"Qrel silently changed frozen expectation: {qid}/{rid}")
    audit_corpora = unique(evidence.get("corpora", []), "seed", "evidence corpus")
    require(set(audit_corpora) == set(generation["seeds"]), "All three seed audits required")
    corpora, manifest_corpora, failures = {}, [], []
    for seed in generation["seeds"]:
        audit = audit_corpora[seed]
        path = bound(root, audit["path"])
        require(audit["sha256"] == sha(path), f"Evidence corpus bytes changed: {seed}")
        docs = unique(jsonl(path), "identifier", "corpus ID")
        require(set(docs) == set(plans) and len(docs) == 180, f"Corpus ID/count mismatch: {seed}")
        observations = unique(audit.get("records", []), "dataset_id", "record review")
        require(set(observations) == set(docs), f"Full seed semantic review missing: {seed}")
        manual_variation = audit.get("variation_review", {})
        require(manual_variation.get("passed") is True and manual_variation.get("reviewer_id") in reviewers
                and manual_variation.get("rationale"), f"Manual seed variation review incomplete: {seed}")
        duplicates = Counter()
        derived = {qid: {} for qid in queries}
        for rid, doc in docs.items():
            fields = check_record(doc, plans[rid], queries)
            duplicates[(doc["title"], doc["description"])] += 1
            contexts, _ = review_record(observations[rid], doc, plans[rid], reviewers)
            for qid, query in queries.items():
                intent = intents[query["intent_id"]]
                grade = derive_grade(intent, rid, contexts, formats_in(doc))
                derived[qid][rid] = grade
                if qrels[(qid, rid)] != grade:
                    failures.append({"seed": seed, "query_id": qid, "dataset_id": rid,
                                     "proposed_grade": qrels[(qid, rid)], "independent_grade": grade})
                if grade >= 2:
                    for token in intent.get("absent_positive_tokens", []):
                        require(not any(re.search(r"(?<!\w)" + re.escape(token) + r"(?!\w)", text, re.I)
                                        for text in fields.values()), f"Prohibited positive token: {seed}/{rid}/{token}")
        require(max(duplicates.values()) == 1, f"Duplicate searchable records: {seed}")
        for qid, query in queries.items():
            if query["kind"] in ("semantic", "functional"):
                require(any(g == 3 for g in derived[qid].values()), f"No independently verified grade3: {seed}/{qid}")
            if query["kind"] == "exact":
                require(set(query["authoritative_target_ids"]) <= set(docs), f"Exact target missing: {seed}/{qid}")
        if derived_audit is not None:
            matrix = {iid: derived[intent["paraphrase_query_ids"][0]] for iid, intent in intents.items()}
            anchors, hard_negatives = [], []
            for iid, grades in matrix.items():
                intent = intents[iid]
                for rid, grade in grades.items():
                    if grade != 3:
                        continue
                    observation = observations[rid]
                    if intent["kind"] == "exact":
                        citations = list(observation["identity"]["evidence"])
                        citations.append({"field": "title", "quote": docs[rid]["title"]})
                    else:
                        citations = []
                        for context in observation["contexts"]:
                            if intent["kind"] == "ambiguous":
                                if intent["process_grade_rules"].get(context["process"]["value"], 0) == 3:
                                    citations.extend(context["process"]["evidence"])
                            else:
                                req = intent["required_claims"]
                                if (context["product"]["value"] == req["product"]
                                        and context["process"]["value"] == req["process"]
                                        and context["basis"]["value"] == req["constraint"]
                                        and set(req["facts"]) <= set(context["facts"])):
                                    for key in ("product", "process", "basis"):
                                        citations.extend(context[key]["evidence"])
                                    for fact in req["facts"]:
                                        citations.extend(context["facts"][fact])
                                    for index, distribution in enumerate(docs[rid]["distributions"]):
                                        if distribution.get("format") in req["formats_any"]:
                                            citations.append({"field": f"distributions.{index}.format", "quote": distribution["format"]})
                    anchors.append({"intent_id": iid, "query_ids": intent["paraphrase_query_ids"],
                                    "dataset_id": rid, "grade": 3, "evidence": citations})
            for rid, plan in plans.items():
                for iid in plan.get("hard_negative_for_intent_ids", []):
                    hard_negatives.append({"intent_id": iid, "dataset_id": rid,
                        "independent_grade": matrix[iid][rid], **observations[rid]["hard_negatives"][iid]})
            derived_audit[str(seed)] = {"intent_doc_grades": matrix, "grade3_anchors": anchors,
                "named_hard_negative_evidence": hard_negatives,
                "answerability": {qid: {"grade3_ids": [rid for rid, grade in grades.items() if grade == 3],
                                       "useful_ids": [rid for rid, grade in grades.items() if grade >= 2]}
                                  for qid, grades in derived.items()}}
        corpora[seed] = docs
        manifest_corpora.append({"seed": seed, "path": str(path.relative_to(root)), "sha256": sha(path),
            "dataset_count": len(docs), "record_ids_sha256": hashlib.sha256(
                json.dumps(sorted(docs), separators=(",", ":")).encode()).hexdigest(), "answerability_passed": True})
    require(not failures, "Independent actual-text grades disagree with frozen qrels: " + json.dumps(failures[:20]))
    variation_check(corpora, generation)
    return {"schema_version": 1, "status": "passed", "independent_validation": True, "pre_retrieval": True,
            "spec_freeze_sha256": sha(root / "spec-freeze.json"), "query_spec_sha256": sha(root / "query-spec.jsonl"),
            "qrels_sha256": sha(qrels_path), "qrels_path": "qrels.jsonl", "corpora": manifest_corpora,
            "validation_evidence_path": str(evidence_path.relative_to(root)), "validation_evidence_sha256": sha(evidence_path),
            "unsupported_grade3_count": 0, "missing_positive_queries": [], "exact_targets_missing": []}


def build_packets(root, corpus_paths, output_dir, ids_per_packet=10):
    """Project actual text into fresh-auditor packets, never generate observations.

    Taxonomy is unassociated vocabulary, not per-record plan claims or grades.
    Each packet covers the same stable IDs across all three independent seeds.
    Duplicated production contexts are omitted only after exact raw verification;
    all independently authored searchable text remains in the projected fields.
    """
    root, output_dir = Path(root).resolve(), Path(output_dir).resolve()
    require(output_dir.is_relative_to(root), "Audit packets must stay under synthetic root")
    verify_freeze(root)
    generation = json.loads((root / "generation-spec.json").read_text())
    plans = unique(generation["record_plans"], "id", "plan")
    intents = jsonl(root / "intents.jsonl")
    queries = unique(jsonl(root / "query-spec.jsonl"), "id", "query")
    require(set(corpus_paths) == set(generation["seeds"]), "Packet preparation needs every seed")
    docs, sources = {}, {}
    for seed, relative in corpus_paths.items():
        path = bound(root, relative)
        docs[seed] = unique(jsonl(path), "identifier", "packet corpus ID")
        require(set(docs[seed]) == set(plans), "Packet corpus IDs incomplete")
        for rid, doc in docs[seed].items():
            check_record(doc, plans[rid], queries)
        sources[seed] = {"path": str(path.relative_to(root)), "sha256": sha(path)}
    taxonomy = {"products": sorted({p["product"] for p in plans.values()}),
                "processes": sorted({p["process"] for p in plans.values()}),
                "measurement_facts": sorted({f for i in intents for f in i.get("required_claims", {}).get("facts", [])})}
    output_dir.mkdir(parents=True, exist_ok=True)
    packet_paths = []
    ids = sorted(plans)
    for start in range(0, len(ids), ids_per_packet):
        selected = ids[start:start + ids_per_packet]
        records = []
        for seed in generation["seeds"]:
            for rid in selected:
                doc = docs[seed][rid]
                fields = searchable(doc)
                # These contexts are exact duplicates of included raw metadata;
                # check_record has already rejected redaction/insertion.
                fields = {f: t for f, t in fields.items() if f != "queryContext" and not f.endswith(".queryContext")}
                records.append({"seed": seed, "dataset_id": rid, "fields": fields,
                    "declared_contrast_intents_to_review_independently": plans[rid].get("hard_negative_for_intent_ids", []),
                    "identity_review_required": plans[rid].get("identifier_requirements") is not None})
        packet = {"schema_version": 1, "spec_freeze_sha256": sha(root / "spec-freeze.json"),
            "sources": sources, "taxonomy_vocabulary_not_per_record_claims": taxonomy,
            "intents": intents, "records": records,
            "record_review_schema": {
                "seed": "copy actual seed", "dataset_id": "copy actual stable ID", "reviewer_id": "fresh reviewer ID",
                "semantic_review_passed": "true only after actual exhaustive review; false if unresolved",
                "exhaustive_searchable_review": "true only if all actual projected fields reviewed",
                "contexts": [{"product": {"value": "independently inferred concept", "evidence": [{"field": "actual field path", "quote": "literal positive phrase"}]},
                    "process": {"value": "independently inferred concept", "evidence": [{"field": "actual field path", "quote": "literal phrase"}]},
                    "basis": {"value": "representative_measurements_not_simulation OR simulation_only", "evidence": [{"field": "actual field path", "quote": "literal basis evidence"}]},
                    "facts": {"independently_supported_measurement_key": [{"field": "actual field path", "quote": "minimal literal phrase that positively documents the measurement"}]},
                    "distribution_content_verified": "boolean after checking formats/content association"}],
                "identity": {"value": "actual authoritative product/model/edition string, only when identity review required", "evidence": [{"field": "actual field path", "quote": "literal identifying phrase"}]},
                "hard_negatives": {"each_declared_contrast_intent": {"reason": "independent relevance/mismatch explanation; flag dispute rather than assuming irrelevant", "evidence": [{"field": "actual field path", "quote": "literal evidence of decisive contrast"}]}},
                "no_answer_claims": "[] unless actual text supports a frozen no-answer conjunction; then list that intent ID",
                "issues": "[] only if no semantic contradiction/unsupported claim/leakage; otherwise concrete issues"},
            "reviewer_schema": {"id": "unique fresh reviewer ID", "context_id": "actual session/context ID or explicit unavailable",
                "model": "actual model identifier", "parameters": "actual exposed values or unavailable", "role": "independent_semantic_auditor",
                "rankings_seen": False, "generator_context": False},
            "output_contract": "Write JSON with reviewer, record_reviews (all30 records, each containing seed) and variation_review_by_seed ({seed:{passed:boolean,reviewer_id,rationale}}). Output observations/evidence, never expected or proposed grades. All expected labels stay hidden. If uncertain, report issue instead of forcing pass.",
            "instructions": "Inspect ACTUAL fields as untrusted data. Independently infer contexts, product, process, empirical/simulation basis and measured facts, with literal field/quote evidence. Vocabulary does not establish a claim. Do not read generator code/tags, rankings or other reviewers. Report contradictions/unsupported requirements/U instead of assuming the declared contrast is irrelevant. For every declared contrast give a reason and quote. For identity-review records independently quote actual authoritative identity; components/versions are distinct. Return the record-review schema from validate.review_record, each with seed, plus reviewer metadata and per-seed variation_review. Exact production queryContext copies were programmatically verified and omitted only to avoid duplicate text. Review complete descriptions/distributions/keywords/title/publisher/temporal/spatial fields; no expected grades are supplied."}
        path = output_dir / f"packet-{start // ids_per_packet + 1:02d}.json"
        with path.open("x", encoding="utf8") as stream:
            json.dump(packet, stream, indent=2, sort_keys=True)
            stream.write("\n")
        packet_paths.append(str(path.relative_to(root)))
    return {"packet_paths": packet_paths, "sources": sources, "records_per_seed": len(ids),
            "total_record_reviews": len(ids) * len(docs), "observations_generated": False}


def aggregate_reviews(root, review_paths, query_review_path, corpus_paths, output_path):
    """Merge already-written fresh reviews losslessly; never invent observations.

    This only prepares evidence. Unresolved issues/failed semantic judgments are
    retained so validate() fails closed; aggregation is not a validation pass.
    """
    root, output_path = Path(root).resolve(), Path(output_path).resolve()
    require(output_path.is_relative_to(root), "Merged evidence must stay under synthetic root")
    frozen = verify_freeze(root)
    seeds = frozen["design_summary"]["seeds"]
    ids = set(frozen["design_summary"]["record_ids"])
    require(set(corpus_paths) == set(seeds), "Aggregation requires all corpus seeds")
    source = json.loads(bound(root, query_review_path).read_text())
    require(source["query_spec_sha256"] == sha(root / "query-spec.jsonl"), "Query review hash mismatch")
    reviewers = [source["reviewer"]]
    records = {seed: [] for seed in seeds}
    variations = {seed: [] for seed in seeds}
    artifacts = []
    seen = set()
    for relative in review_paths:
        path = bound(root, relative)
        review = json.loads(path.read_text())
        reviewer = review["reviewer"]
        reviewers.append(reviewer)
        packet_path = root / "auditoutputs/packets-v2" / Path(relative).name
        packet = json.loads(packet_path.read_text())
        require(packet["spec_freeze_sha256"] == sha(root / "spec-freeze.json"),
                f"Fresh reviewer packet references another specification: {relative}")
        for seed in seeds:
            packet_source = packet["sources"][str(seed)]
            require(packet_source["sha256"] == sha(bound(root, corpus_paths[seed])),
                    f"Manual review packet corpus hash no longer current: {relative}/{seed}; explicit delta re-audit required")
        expected_pairs = {(row["seed"], row["dataset_id"]) for row in packet["records"]}
        rows = review["record_reviews"]
        require(len(rows) == 30 and {(row.get("seed"), row.get("dataset_id")) for row in rows} == expected_pairs,
                f"Fresh packet must review all30 assigned actual records: {relative}")
        for row in rows:
            seed, rid = row.get("seed"), row.get("dataset_id")
            require(seed in records and rid in ids and (seed, rid) not in seen,
                    f"Unknown/duplicate manual observation: {relative}/{seed}/{rid}")
            require(row.get("reviewer_id") == reviewer["id"], f"Record reviewer provenance mismatch: {relative}/{rid}")
            seen.add((seed, rid))
            records[seed].append(row)
        by_seed = review["variation_review_by_seed"]
        require(set(by_seed) == {str(seed) for seed in seeds}, f"Seed variation review incomplete: {relative}")
        for seed in seeds:
            judgement = by_seed[str(seed)]
            require(judgement.get("reviewer_id") == reviewer["id"], f"Variation provenance mismatch: {relative}")
            variations[seed].append(judgement)
        artifacts.append({"path": relative, "sha256": sha(path)})
    unique(reviewers, "id", "fresh reviewer")
    require(seen == {(seed, rid) for seed in seeds for rid in ids}, "All540 independent manual observations required")
    corpora = []
    for seed in seeds:
        path = bound(root, corpus_paths[seed])
        judged = variations[seed]
        corpora.append({"seed": seed, "path": corpus_paths[seed], "sha256": sha(path),
            "records": sorted(records[seed], key=lambda row: row["dataset_id"]),
            "variation_review": {"passed": all(j.get("passed") is True for j in judged),
                "reviewer_id": judged[0]["reviewer_id"],
                "rationale": "Combined independent packet seed-variation judgments; originals retained below, not overwritten.",
                "packet_reviews": judged}})
    evidence = {"schema_version": 1, "status": "pending_independent_programmatic_validation",
        "spec_freeze_sha256": sha(root / "spec-freeze.json"), "pre_retrieval": True,
        "independent_of_generator": True, "reviewers": reviewers,
        "query_reviews": source["query_reviews"], "corpora": corpora,
        "source_review_artifacts": artifacts,
        "query_review_artifact": {"path": query_review_path, "sha256": sha(bound(root, query_review_path))},
        "prefreeze_audit_artifacts": [{"path": "auditoutputs/prefreeze-v2.json", "sha256": sha(root / "auditoutputs/prefreeze-v2.json")}],
        "limitation": "Fresh model contexts are correlated, not independent human judgments. Literal quote checks complement but do not replace the recorded semantic observations."}
    with output_path.open("x", encoding="utf8") as stream:
        json.dump(evidence, stream, indent=2, sort_keys=True)
        stream.write("\n")
    return {"path": str(output_path.relative_to(root)), "sha256": sha(output_path),
            "manual_record_reviews": len(seen), "query_reviews": len(source["query_reviews"]),
            "validation_passed": False}


def canonical_record_sha(doc):
    return hashlib.sha256(json.dumps(doc, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def leaf_changes(before, after, prefix=""):
    if isinstance(before, dict) and isinstance(after, dict):
        return [path for key in set(before) | set(after)
                for path in leaf_changes(before.get(key), after.get(key), f"{prefix}.{key}" if prefix else key)]
    if isinstance(before, list) and isinstance(after, list) and len(before) == len(after):
        return [path for index, (a, b) in enumerate(zip(before, after))
                for path in leaf_changes(a, b, f"{prefix}.{index}")]
    return [] if before == after else [prefix]


def verify_fixture_delta(root, old_paths, new_paths, request_paths):
    """Verify full raw record equality and exact approved field-level repair scope."""
    root = Path(root).resolve()
    requests = [json.loads(bound(root, p).read_text()) for p in request_paths]
    approved = {}
    for request in requests:
        for patch in request["patches"]:
            key = patch["seed"], patch["dataset_id"]
            approved.setdefault(key, []).append(patch)
    result, old_docs, new_docs = [], {}, {}
    require(set(old_paths) == set(new_paths), "Delta seed sets differ")
    for seed in old_paths:
        old_path, new_path = bound(root, old_paths[seed]), bound(root, new_paths[seed])
        old_docs[seed] = unique(jsonl(old_path), "identifier", "old corpus ID")
        new_docs[seed] = unique(jsonl(new_path), "identifier", "new corpus ID")
        require(set(old_docs[seed]) == set(new_docs[seed]), "Delta changed stable identities")
        # Exact JSONL rows must also remain byte-identical when a record is unmodified.
        old_lines = {json.loads(line)["identifier"]: line for line in old_path.read_bytes().splitlines(keepends=True) if line.strip()}
        new_lines = {json.loads(line)["identifier"]: line for line in new_path.read_bytes().splitlines(keepends=True) if line.strip()}
        for rid, before in old_docs[seed].items():
            after = new_docs[seed][rid]
            changed = leaf_changes(before, after)
            key = seed, rid
            if not changed:
                require(old_lines[rid] == new_lines[rid], f"Unmodified record bytes rewritten: {seed}/{rid}")
                continue
            require(key in approved, f"Unapproved fixture record changed: {seed}/{rid}")
            allowed = set()
            for patch in approved[key]:
                require(patch["before_corpus_sha256"] == sha(old_path)
                        and patch["before_record_sha256"] == canonical_record_sha(before),
                        f"Approved repair before-hash mismatch: {seed}/{rid}")
                if "allowed_changed_fields" in patch:
                    explicit = set(patch["allowed_changed_fields"])
                    require(explicit == {"title", "queryContext"}, "Unrecognized explicit repair field scope")
                    allowed.update(explicit)
                elif patch["issue"].startswith("Simulation-only"):
                    for item in patch["actual_evidence"]:
                        if item["field"].startswith("distributions.") and item["field"].endswith(".title"):
                            allowed.update((item["field"], item["field"].rsplit(".", 1)[0] + ".queryContext"))
                else:
                    allowed.update(("description", "queryContext"))
            require(set(changed) <= allowed, f"Repair exceeded approved fields: {seed}/{rid}/{set(changed) - allowed}")
            require(after["queryContext"] == production_context(after), f"Patched root context incorrect: {seed}/{rid}")
            require(all(d["queryContext"] == production_context(d, True) for d in after["distributions"]),
                    f"Patched child context incorrect: {seed}/{rid}")
            result.append({"seed": seed, "dataset_id": rid, "changed_fields": sorted(changed),
                           "before_record_sha256": canonical_record_sha(before),
                           "after_record_sha256": canonical_record_sha(after)})
    return result, old_docs, new_docs


def build_delta_packets(root, corpus_paths, pairs, output_dir, records_per_packet=8,
                        prior_review_paths=(), packet_prefix="delta"):
    """Lossless actual-text projection for explicitly selected repair/adjudication pairs."""
    root, output_dir = Path(root).resolve(), Path(output_dir).resolve()
    require(output_dir.is_relative_to(root), "Delta packets must stay under synthetic root")
    verify_freeze(root)
    template = json.loads((root / "auditoutputs/packets-v2/packet-01.json").read_text())
    generation = json.loads((root / "generation-spec.json").read_text())
    plans = unique(generation["record_plans"], "id", "plan")
    queries = unique(jsonl(root / "query-spec.jsonl"), "id", "query")
    docs, sources = {}, {}
    for seed, relative in corpus_paths.items():
        path = bound(root, relative)
        docs[seed] = unique(jsonl(path), "identifier", "delta corpus ID")
        sources[str(seed)] = {"path": relative, "sha256": sha(path)}
    prior = {}
    for relative in prior_review_paths:
        artifact = json.loads(bound(root, relative).read_text())
        for observation in artifact["record_reviews"]:
            prior[(observation["seed"], observation["dataset_id"])] = {
                "original_review_path": relative, "original_review_sha256": sha(bound(root, relative)),
                "previous_issues": observation.get("issues", []),
                "previous_context_observations": observation.get("contexts", [])}
    selected = sorted(set(pairs))
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for start in range(0, len(selected), records_per_packet):
        packet = dict(template)
        packet["sources"] = sources
        packet["frozen_relevance_rubric_path"] = "relevance-rubric.md"
        packet["frozen_relevance_rubric_sha256"] = sha(root / "relevance-rubric.md")
        packet["full_frozen_relevance_rubric_lines"] = (root / "relevance-rubric.md").read_text().splitlines()
        packet["frozen_queries_without_qrels"] = list(queries.values())
        packet["records"] = []
        for seed, rid in selected[start:start + records_per_packet]:
            require(seed in docs and rid in docs[seed], "Unknown delta audit pair")
            doc = docs[seed][rid]
            check_record(doc, plans[rid], queries)
            fields = {f: t for f, t in searchable(doc).items() if f != "queryContext" and not f.endswith(".queryContext")}
            record = {"seed": seed, "dataset_id": rid, "fields": fields,
                "actual_record_sha256": canonical_record_sha(doc),
                "declared_contrast_intents_to_review_independently": plans[rid].get("hard_negative_for_intent_ids", []),
                "identity_review_required": plans[rid].get("identifier_requirements") is not None}
            if (seed, rid) in prior:
                record["prior_independent_review_for_adjudication_not_expected_labels"] = prior[(seed, rid)]
            packet["records"].append(record)
        packet["output_contract"] = ("Write JSON with reviewer, sources (copy packet path/hash references), record_reviews for EXACTLY "
            + str(len(packet["records"])) + " assigned actual(seed,dataset_id) records, and variation_review_by_seed for every reviewed seed. "
            "Use existing record_review_schema. Review full frozen rubric and actual text. Report independently supported topical context separately from measurements/ledger process when both are explicitly documented; diagnostic ambiguity imposes no empirical-measurement condition. "
            "Prior observations/issues are evidence to challenge, NOT labels to obey. Do not view expected per-record grades or generator code. If unresolved, preserve U/issues rather than force pass. Never modify an old review artifact.")
        path = output_dir / f"{packet_prefix}-{start // records_per_packet + 1:02d}.json"
        with path.open("x", encoding="utf8") as stream:
            json.dump(packet, stream, indent=2, sort_keys=True)
            stream.write("\n")
        paths.append(str(path.relative_to(root)))
    return {"packet_paths": paths, "sources": sources, "actual_record_reviews_requested": len(selected),
            "semantic_observations_generated": False}


def rebase_reviews_with_delta(root, base_evidence_path, new_corpus_paths, request_paths,
                              delta_review_paths, output_path, adjudication_pairs=()):
    """Reuse only identical raw records; substitute only fresh, bound delta reviews.

    The immutable base evidence retains all original observations, including U.
    Independent replacements are supplied by reviewers, never inferred from labels.
    Each delta review JSON must include sources keyed seed with path/sha256, reviewer,
    record_reviews and variation_review_by_seed for its reviewed seed subset.
    """
    root, output_path = Path(root).resolve(), Path(output_path).resolve()
    require(output_path.is_relative_to(root), "Rebased evidence must stay under synthetic root")
    base_path = bound(root, base_evidence_path)
    evidence = json.loads(base_path.read_text())
    require(evidence["spec_freeze_sha256"] == sha(root / "spec-freeze.json"), "Base evidence freeze differs")
    old_paths = {c["seed"]: c["path"] for c in evidence["corpora"]}
    for corpus in evidence["corpora"]:
        require(corpus["sha256"] == sha(bound(root, corpus["path"])), "Base audited corpus changed")
    changes, old_docs, new_docs = verify_fixture_delta(root, old_paths, new_corpus_paths, request_paths)
    changed_pairs = {(c["seed"], c["dataset_id"]) for c in changes}
    permitted = changed_pairs | set(adjudication_pairs)
    replacements, artifacts, variations = {}, [], {}
    equivalent_source_records, source_cache = [], {}
    target_lines = {seed: {json.loads(line)["identifier"]: line for line in bound(root, relative).read_bytes().splitlines(keepends=True) if line.strip()}
                    for seed, relative in new_corpus_paths.items()}
    reviewer_map = unique(evidence["reviewers"], "id", "base reviewer")
    for relative in delta_review_paths:
        path = bound(root, relative)
        delta = json.loads(path.read_text())
        reviewer = delta["reviewer"]
        if reviewer["id"] in reviewer_map:
            require(reviewer_map[reviewer["id"]] == reviewer, "Adjudication reviewer provenance changed")
        else:
            reviewer_map[reviewer["id"]] = reviewer
        for row in delta["record_reviews"]:
            pair = row["seed"], row["dataset_id"]
            require(pair in permitted and pair not in replacements, "Unexpected/duplicate delta observation")
            source = delta["sources"][str(pair[0])]
            source_path = bound(root, source["path"])
            if source["path"] not in source_cache:
                source_cache[source["path"]] = {"sha256": sha(source_path), "rows": {
                    json.loads(line)["identifier"]: line for line in source_path.read_bytes().splitlines(keepends=True) if line.strip()}}
            actual_source = source_cache[source["path"]]
            require(source["sha256"] == actual_source["sha256"], "Declared manual-review source bytes changed")
            if source["sha256"] != sha(bound(root, new_corpus_paths[pair[0]])):
                require(actual_source["rows"].get(pair[1]) == target_lines[pair[0]][pair[1]],
                        "Delta reviewer read stale record bytes; changed record requires fresh review")
                equivalent_source_records.append({"seed": pair[0], "dataset_id": pair[1],
                    "source_path": source["path"], "source_sha256": source["sha256"],
                    "target_path": new_corpus_paths[pair[0]],
                    "target_sha256": sha(bound(root, new_corpus_paths[pair[0]])),
                    "entire_record_row_including_line_ending_byte_identical": True})
            require(row["reviewer_id"] == reviewer["id"], "Delta reviewer ID mismatch")
            replacements[pair] = row
        for seed_text, judgement in delta["variation_review_by_seed"].items():
            if "reviewer_id" in judgement:
                require(judgement["reviewer_id"] == reviewer["id"], "Delta variation reviewer mismatch")
            # Small delta batches may honestly contain no same-ID cross-seed
            # counterparts. Preserve their scope observations, not a fabricated
            # global variance certification. Full-scope original judgments remain.
            scoped = dict(judgement)
            scoped["artifact_reviewer_id"] = reviewer["id"]
            scoped["artifact_path"] = relative
            scoped["is_cross_seed_certification"] = type(judgement.get("passed")) is bool
            variations.setdefault(int(seed_text), []).append(scoped)
        artifacts.append({"path": relative, "sha256": sha(path)})
    require(changed_pairs <= set(replacements), "Every changed fixture record needs fresh actual-text re-audit")
    reuse_count = 0
    for corpus in evidence["corpora"]:
        seed = corpus["seed"]
        rows = []
        for old_observation in corpus["records"]:
            pair = seed, old_observation["dataset_id"]
            if pair in replacements:
                rows.append(replacements[pair])
            else:
                require(old_docs[seed][pair[1]] == new_docs[seed][pair[1]], "Stale manual observation reused on changed metadata")
                rows.append(old_observation)
                reuse_count += 1
        corpus.update({"path": new_corpus_paths[seed], "sha256": sha(bound(root, new_corpus_paths[seed])), "records": rows})
        delta_variations = variations.get(seed, [])
        if any(s == seed for s, _ in changed_pairs):
            require(delta_variations, f"Patched seed needs fresh variation review: {seed}")
        prior_variation = corpus["variation_review"]
        corpus["variation_review"] = {"passed": prior_variation["passed"] is True
            and all(j["passed"] is True for j in delta_variations if j["is_cross_seed_certification"]),
            "reviewer_id": prior_variation["reviewer_id"], "rationale": "Original unchanged-record seed review plus fresh delta-review judgments; all originals retained.",
            "original_review": prior_variation, "delta_reviews": delta_variations}
    evidence["reviewers"] = list(reviewer_map.values())
    evidence["source_review_artifacts"].extend(artifacts)
    evidence["source_review_artifacts"].append({"path": base_evidence_path, "sha256": sha(base_path)})
    evidence["fixture_delta_rebase"] = {"changes": changes, "unchanged_raw_records_reused": reuse_count,
        "fresh_replacement_observations": len(replacements),
        "independently_proven_unchanged_review_source_records": equivalent_source_records,
        "patch_request_artifacts": [{"path": p, "sha256": sha(bound(root, p))} for p in request_paths],
        "adjudication_pairs": [list(pair) for pair in sorted(set(adjudication_pairs))],
        "status": "pending_full_independent_validation_not_passed"}
    with output_path.open("x", encoding="utf8") as stream:
        json.dump(evidence, stream, indent=2, sort_keys=True)
        stream.write("\n")
    return {"path": str(output_path.relative_to(root)), "sha256": sha(output_path),
            "changed_records": len(changed_pairs), "unchanged_observations_reused": reuse_count,
            "validation_passed": False}


def apply_variation_adjudications(root, evidence_path, supersessions, output_path):
    """Apply explicit, full-scope independent superseding variation judgments.

    supersessions = [{old_review_path, new_review_path}]. A new artifact may be a
    full resumed review or variation-only {reviewer,sources,reviewed_pairs,
    variation_review_by_seed}; it must have reviewed the exact original pair scope
    against CURRENT corpus hashes. Original false judgments are preserved, never
    changed in-place or silently treated as true after fixture repair.
    """
    root, output_path = Path(root).resolve(), Path(output_path).resolve()
    require(output_path.is_relative_to(root), "Variation evidence must stay under synthetic root")
    original_path = bound(root, evidence_path)
    evidence = json.loads(original_path.read_text())
    current_sources = {c["seed"]: c for c in evidence["corpora"]}
    source_artifacts = {a["path"]: a for a in evidence["source_review_artifacts"]}
    replacements, records = {}, []
    previous_history = evidence.get("variation_adjudication_history", [])
    for link in previous_history:
        require(sha(bound(root, link["old_review_path"])) == link["old_review_sha256"]
                and sha(bound(root, link["new_review_path"])) == link["new_review_sha256"],
                "Prior variation supersession artifact changed")
        replacements[link["old_review_path"]] = link["new_review_path"]
    reviewers = unique(evidence["reviewers"], "id", "variation reviewer")
    for instruction in supersessions:
        old_relative, new_relative = instruction["old_review_path"], instruction["new_review_path"]
        require(old_relative in source_artifacts, "Superseded variation review not bound by original evidence")
        old_path, new_path = bound(root, old_relative), bound(root, new_relative)
        require(source_artifacts[old_relative]["sha256"] == sha(old_path), "Original variation artifact changed")
        old, new = json.loads(old_path.read_text()), json.loads(new_path.read_text())
        require("variation_review_by_seed" in old and "variation_review_by_seed" in new,
                "Variation adjudication missing independent judgments")
        old_pairs = ({(r["seed"], r["dataset_id"]) for r in old["record_reviews"]}
                     if "record_reviews" in old else {tuple(pair) for pair in old["reviewed_pairs"]})
        new_pairs = ({(r["seed"], r["dataset_id"]) for r in new["record_reviews"]}
                     if "record_reviews" in new else {tuple(pair) for pair in new["reviewed_pairs"]})
        if new_pairs != old_pairs:
            full_original_path = root / "auditoutputs/reviews-v2" / Path(old_relative).name
            require(full_original_path.is_file(), "Superseding variation review must cover exact original record scope")
            full_original = json.loads(full_original_path.read_text())
            full_pairs = {(r["seed"], r["dataset_id"]) for r in full_original["record_reviews"]}
            require(old_pairs <= new_pairs == full_pairs and new["reviewer"]["id"] == old["reviewer"]["id"]
                    == full_original["reviewer"]["id"],
                    "Superseding variation review must cover exact original record scope")
        require(set(old["variation_review_by_seed"]) <= set(new["variation_review_by_seed"])
                == {str(seed) for seed, _ in new_pairs},
                "Superseding variation seed scope differs")
        reviewer = new["reviewer"]
        reviewers.setdefault(reviewer["id"], reviewer)
        for seed in {s for s, _ in old_pairs}:
            current = current_sources[seed]
            supplied = new["sources"][str(seed)]
            require(supplied["sha256"] == current["sha256"] == sha(bound(root, current["path"])),
                    "Variation adjudication does not bind current actual corpus")
            judgment = new["variation_review_by_seed"][str(seed)]
            require(judgment["reviewer_id"] == reviewer["id"] and judgment.get("rationale"),
                    "Variation adjudication provenance/rationale missing")
        require(old_relative not in replacements, "Variation artifact superseded twice")
        replacements[old_relative] = new_relative
        source_artifacts[new_relative] = {"path": new_relative, "sha256": sha(new_path)}
        records.append({"old_review_path": old_relative, "old_review_sha256": sha(old_path),
                        "new_review_path": new_relative, "new_review_sha256": sha(new_path),
                        "reviewed_pairs": [list(pair) for pair in sorted(old_pairs)]})
    # Reconstruct judgments from original source artifacts, replacing only explicit
    # supersession links. This retains all other false/unknown observations.
    effective = {seed: [] for seed in current_sources}
    superseding_paths = {x["new_review_path"] for x in previous_history + records}
    for relative, artifact in source_artifacts.items():
        if relative in superseding_paths:
            continue
        data = json.loads(bound(root, relative).read_text())
        if "variation_review_by_seed" not in data:
            continue
        terminal, visited = relative, set()
        while terminal in replacements:
            require(terminal not in visited, "Cyclic variation supersession")
            visited.add(terminal)
            terminal = replacements[terminal]
        active = data if terminal == relative else json.loads(bound(root, terminal).read_text())
        for seed, judgment in active["variation_review_by_seed"].items():
            if type(judgment.get("passed")) is not bool:
                continue  # A delta scope description is not a cross-seed certification.
            effective[int(seed)].append({"source_path": relative, **judgment})
    for corpus in evidence["corpora"]:
        judgments = effective[corpus["seed"]]
        require(judgments, "No independent variation judgments remain")
        corpus["variation_review"] = {"passed": all(j.get("passed") is True for j in judgments),
            "reviewer_id": judgments[0]["reviewer_id"],
            "rationale": "Explicit independently superseding full-scope judgments; all original artifacts remain bound.",
            "effective_judgments": judgments, "previous_review": corpus["variation_review"]}
    evidence["variation_adjudication_history"] = evidence.get("variation_adjudication_history", []) + records
    evidence["reviewers"] = list(reviewers.values())
    source_artifacts[evidence_path] = {"path": evidence_path, "sha256": sha(original_path)}
    evidence["source_review_artifacts"] = list(source_artifacts.values())
    with output_path.open("x", encoding="utf8") as stream:
        json.dump(evidence, stream, indent=2, sort_keys=True)
        stream.write("\n")
    return {"path": str(output_path.relative_to(root)), "sha256": sha(output_path),
            "superseded_judgments": len(records), "validation_passed": False}


def _diagnostic_manual_evidence(root, evidence_path):
    path = Path(evidence_path).resolve()
    require(path.is_relative_to(root), "Diagnostic evidence escapes synthetic root")
    seen = set()
    while True:
        require(path not in seen, "Cyclic manual evidence wrapper")
        seen.add(path)
        data = json.loads(path.read_text())
        if "manual_evidence_artifact" not in data:
            return data
        artifact = data["manual_evidence_artifact"]
        path = bound(root, artifact["path"])
        require(sha(path) == artifact["sha256"], "Wrapped manual evidence changed")


def _diagnostic_contexts(row, doc, plan, reviewers):
    """Parse quoted observations without falsely clearing the original record U.

    A metadata-quality or scope issue is retained in evidence. Pair certainty is
    checked separately against explicit intent masks; this is NOT a record pass.
    """
    rid, fields = doc["identifier"], searchable(doc)
    require(row.get("reviewer_id") in reviewers and row.get("exhaustive_searchable_review") is True,
            f"Diagnostic actual-field review incomplete: {rid}")
    require(row.get("no_answer_claims") == [], f"No-answer conjunction not independently absent: {rid}")
    require(isinstance(row.get("contexts"), list) and row["contexts"], f"Missing observations: {rid}")
    contexts = []
    for number, context in enumerate(row["contexts"]):
        label = f"{rid}/diagnostic-context{number}"
        item = {key: assertion(context.get(key), fields, label + "/" + key)
                for key in ("product", "process", "basis")}
        facts = context.get("facts")
        require(isinstance(facts, dict), f"Missing observed fact set: {label}")
        for fact, citations in facts.items():
            positive_quote_check(citations, fields, label + "/" + fact)
        require(item["basis"] in ("representative_measurements_not_simulation", "simulation_only",
                                   "observed_administrative_records", "contextual_topic_only"),
                f"Unresolved diagnostic basis extraction: {label}")
        item["facts"] = set(facts)
        item["distribution_content_verified"] = context.get("distribution_content_verified") is True
        contexts.append(item)
    for iid in plan.get("hard_negative_for_intent_ids", []):
        negative = row.get("hard_negatives", {}).get(iid, {})
        require(negative.get("reason"), f"Missing diagnostic hard-negative reasoning: {rid}/{iid}")
        quote_check(negative.get("evidence"), fields, rid + "/" + iid)
    if plan.get("identifier_requirements"):
        identity = assertion(row.get("identity"), fields, rid + "/diagnostic-identity")
        require(identity == plan["identifier_requirements"]["authoritative_identifier"],
                f"Unresolved identity extraction/schema: {rid}")
        require(any(token_present(c["quote"], identity) for c in row["identity"]["evidence"]),
                f"Identity quotation omits actual identifier: {rid}")
    return contexts


def _diagnostic_grade(intent, rid, contexts, available_formats):
    grade = derive_grade(intent, rid, contexts, available_formats)
    if intent["kind"] in ("semantic", "functional"):
        req = intent["required_claims"]
        uncertain = re.compile(r"(?:^U(?:$|[_ :])|unknown|unspecified|uncertain|unresolved)", re.I)
        if grade > 0:
            require(any(c["product"] == req["product"] and c["process"] == req["process"]
                        and c["basis"] == req["constraint"] and c["distribution_content_verified"]
                        and len(set(req["facts"]) & c["facts"]) == grade for c in contexts),
                    f"Positive lacks independently verified content association: {intent['intent_id']}/{rid}")
        elif req["formats_any"] and not set(req["formats_any"]) & available_formats:
            pass  # A documented wrong format alone is decisive.
        else:
            for c in contexts:
                if not any(uncertain.search(c[key]) for key in ("product", "process", "basis")):
                    continue
                decisive = (c["basis"] in ("simulation_only", "observed_administrative_records", "contextual_topic_only")
                    or (not uncertain.search(c["process"]) and c["process"] != req["process"])
                    or (not uncertain.search(c["product"]) and c["product"] != req["product"]))
                require(decisive, f"Unmasked unresolved observation could affect grade: {intent['intent_id']}/{rid}")
    return grade


def _diagnostic_state(root, evidence_path, uncertainty_mask_path, derived_audit=None):
    root = Path(root).resolve()
    verify_freeze(root)
    evidence = _diagnostic_manual_evidence(root, evidence_path)
    generation = json.loads((root / "generation-spec.json").read_text())
    queries = unique(jsonl(root / "query-spec.jsonl"), "id", "query")
    intents = unique(jsonl(root / "intents.jsonl"), "intent_id", "intent")
    plans = unique(generation["record_plans"], "id", "record plan")
    require(evidence.get("pre_retrieval") is True and evidence.get("independent_of_generator") is True
            and evidence.get("spec_freeze_sha256") == sha(root / "spec-freeze.json"),
            "Diagnostic evidence lacks separated pre-retrieval provenance")
    reviewers = unique(evidence["reviewers"], "id", "diagnostic reviewer")
    for reviewer in reviewers.values():
        require(reviewer.get("role") == "independent_semantic_auditor" and reviewer.get("context_id")
                and reviewer.get("model") and "parameters" in reviewer
                and reviewer.get("rankings_seen") is False and reviewer.get("generator_context") is False,
                "Diagnostic reviewer lacks independent fresh-context provenance")
    query_reviews = unique(evidence["query_reviews"], "query_id", "query equivalence")
    require(set(query_reviews) == set(queries), "All75 independently reviewed query equivalents required")
    for qid, row in query_reviews.items():
        require(row.get("equivalent") is True and row.get("intent_id") == queries[qid]["intent_id"]
                and row.get("reviewer_id") in reviewers and row.get("rationale"), "Unresolved query equivalence")
    query_artifact = evidence["query_review_artifact"]
    query_path = bound(root, query_artifact["path"])
    require(sha(query_path) == query_artifact["sha256"]
            and json.loads(query_path.read_text())["query_reviews"] == evidence["query_reviews"],
            "Independent query-equivalence source changed")
    observed_sources = {}
    for artifact in evidence["source_review_artifacts"]:
        path = bound(root, artifact["path"])
        require(sha(path) == artifact["sha256"], "Original diagnostic review artifact changed")
        data = json.loads(path.read_text())
        for row in data.get("record_reviews", []):
            sources = data.get("sources")
            if sources is None:
                packet_path = root / "auditoutputs/packets-v2" / path.name
                require(packet_path.is_file(), "Original manual review source packet missing")
                packet = json.loads(packet_path.read_text())
                require(packet["spec_freeze_sha256"] == sha(root / "spec-freeze.json"), "Original packet freeze mismatch")
                sources = packet["sources"]
            observed_sources.setdefault((row["seed"], row["dataset_id"]), []).append((row, sources[str(row["seed"])]))
    for artifact in evidence.get("prefreeze_audit_artifacts", []):
        require(sha(bound(root, artifact["path"])) == artifact["sha256"], "Pre-freeze diagnostic provenance changed")
    original = validate_qrels(jsonl(root / "qrels.jsonl"), queries, plans)
    for (qid, rid), grade in original.items():
        require(grade == generation["intent_doc_grades"][queries[qid]["intent_id"]][rid], "Original frozen qrels changed")
    mask_path = Path(uncertainty_mask_path).resolve()
    require(mask_path.is_relative_to(root), "Uncertainty mask escapes synthetic root")
    masks = {}
    for row in jsonl(mask_path):
        key = row.get("seed"), row.get("intent_id"), row.get("dataset_id")
        require(key[0] in generation["seeds"] and key[1] in intents and key[2] in plans
                and key not in masks and isinstance(row.get("reason"), str) and row["reason"].strip(),
                "Unknown/duplicate/unreasoned explicit uncertainty case")
        masks[key] = row
    require(masks, "Incomplete diagnostic mode must preserve explicit uncertainty")
    audits = unique(evidence["corpora"], "seed", "diagnostic corpus audit")
    require(set(audits) == set(generation["seeds"]), "All three diagnostic seed reviews required")
    all_docs, manifest_corpora, expanded, mismatches, source_cache = {}, [], [], [], {}
    manual_count, anchor_evidence, hard_negative_evidence = 0, [], []
    for seed in generation["seeds"]:
        audit = audits[seed]
        path = bound(root, audit["path"])
        require(sha(path) == audit["sha256"], "Audited diagnostic corpus changed")
        docs = unique(jsonl(path), "identifier", "diagnostic record")
        require(set(docs) == set(plans) and len(docs) == 180, "Diagnostic ID/count mismatch")
        raw_rows = {json.loads(line)["identifier"]: line for line in path.read_bytes().splitlines(keepends=True) if line.strip()}
        observations = unique(audit["records"], "dataset_id", "diagnostic actual-text review")
        require(set(observations) == set(docs), "All540 diagnostic record reviews required")
        require(audit["variation_review"].get("passed") is True, f"Independent variation adjudication incomplete: {seed}")
        grades = {qid: {} for qid in queries}
        for rid, doc in docs.items():
            check_record(doc, plans[rid], queries)
            row = observations[rid]
            supported_source = False
            for candidate, source in observed_sources.get((seed, rid), []):
                if candidate != row:
                    continue
                source_path = bound(root, source["path"])
                if source["path"] not in source_cache:
                    source_cache[source["path"]] = (sha(source_path), {
                        json.loads(line)["identifier"]: line for line in source_path.read_bytes().splitlines(keepends=True) if line.strip()})
                source_sha, source_rows = source_cache[source["path"]]
                require(source_sha == source["sha256"], "Declared independent review source mutated")
                if source_rows.get(rid) == raw_rows[rid]:
                    supported_source = True
                    break
            require(supported_source, f"Current observation has no raw-artifact/current-record closure: {seed}/{rid}")
            contexts = _diagnostic_contexts(row, doc, plans[rid], reviewers)
            manual_count += 1
            fields = searchable(doc)
            for iid, intent in intents.items():
                if (seed, iid, rid) in masks:
                    for citation in masks[(seed, iid, rid)].get("evidence", []):
                        if isinstance(citation, dict) and "field" in citation and "quote" in citation:
                            quote_check([citation], fields, f"uncertainty/{seed}/{iid}/{rid}")
                    grade = "U"
                else:
                    grade = _diagnostic_grade(intent, rid, contexts, formats_in(doc))
                for qid in intent["paraphrase_query_ids"]:
                    grades[qid][rid] = grade
                    if grade != "U" and grade != original[(qid, rid)]:
                        mismatches.append({"seed": seed, "query_id": qid, "dataset_id": rid,
                            "independent_grade": grade, "frozen_expected_grade": original[(qid, rid)]})
                    expanded.append({"seed": seed, "query_id": qid, "dataset_id": rid, "grade": grade})
                if grade == 3:
                    anchor_evidence.append({"seed": seed, "intent_id": iid, "dataset_id": rid,
                        "query_ids": intent["paraphrase_query_ids"], "independent_observation_contexts": row["contexts"],
                        "identity_evidence": row.get("identity"), "actual_format_evidence": [
                            {"field": f"distributions.{index}.format", "quote": d["format"]}
                            for index, d in enumerate(doc["distributions"]) if isinstance(d.get("format"), str)]})
                if type(grade) is int and grade >= 2:
                    for token in intent.get("absent_positive_tokens", []):
                        require(not any(re.search(r"(?<!\w)" + re.escape(token) + r"(?!\w)", text, re.I)
                                        for text in fields.values()), f"Prohibited diagnostic positive token: {seed}/{rid}/{token}")
            for iid in plans[rid].get("hard_negative_for_intent_ids", []):
                hard_negative_evidence.append({"seed": seed, "intent_id": iid, "dataset_id": rid,
                    "grade": grades[intents[iid]["paraphrase_query_ids"][0]][rid], **row["hard_negatives"][iid]})
        for qid, query in queries.items():
            if query["kind"] in ("semantic", "functional"):
                require(any(type(g) is int and g == 3 for g in grades[qid].values()), f"Diagnostic positive anchor missing: {seed}/{qid}")
            if query["kind"] == "exact":
                require(all(grades[qid][rid] == 3 for rid in query["authoritative_target_ids"]), "Exact diagnostic target uncertain/missing")
        if derived_audit is not None:
            derived_audit[str(seed)] = {"query_doc_grades": grades, "original_record_issues_preserved": {
                rid: r.get("issues", []) for rid, r in observations.items() if r.get("issues") or not r.get("semantic_review_passed")}}
        all_docs[seed] = docs
        manifest_corpora.append({"seed": seed, "path": audit["path"], "sha256": sha(path), "dataset_count": 180,
            "record_ids_sha256": hashlib.sha256(json.dumps(sorted(docs), separators=(",", ":")).encode()).hexdigest(),
            "answerability_passed": True})
    require(not mismatches, "Known diagnostic grades disagree; do NOT auto-mask extraction disagreements: " + json.dumps(mismatches[:30]))
    require(manual_count == 540 and len(expanded) == 40500, "Diagnostic pair/review coverage incomplete")
    variation_check(all_docs, generation)
    if derived_audit is not None:
        derived_audit["grade3_anchor_evidence"] = anchor_evidence
        derived_audit["named_hard_negative_evidence"] = hard_negative_evidence
        derived_audit["expanded_rows"] = expanded
    return root, manifest_corpora, expanded, masks


def validate_diagnostic(root, evidence_path, uncertainty_mask_path, validated_qrels_path, derived_audit=None):
    """Pure independent supplementary gate; NEVER returns strict passed status.

    The explicit mask is manually adjudicated before retrieval. Every remaining
    label is independently derived from quoted fresh observations and must match
    frozen expectations. This API does not create or mutate any artifact.
    """
    root, corpora, expanded, masks = _diagnostic_state(root, evidence_path, uncertainty_mask_path, derived_audit)
    validated_path = Path(validated_qrels_path).resolve()
    evidence_path, mask_path = Path(evidence_path).resolve(), Path(uncertainty_mask_path).resolve()
    require(validated_path.is_relative_to(root), "Validated diagnostic qrels escape synthetic root")
    supplied = {}
    for row in jsonl(validated_path):
        key = row.get("seed"), row.get("query_id"), row.get("dataset_id")
        require(key not in supplied and (type(row.get("grade")) is int and row["grade"] in (0, 1, 2, 3)
                                        or row.get("grade") == "U"), "Duplicate/invalid diagnostic qrel")
        supplied[key] = row["grade"]
    independently_derived = {(r["seed"], r["query_id"], r["dataset_id"]): r["grade"] for r in expanded}
    require(supplied == independently_derived, "Diagnostic qrels do not equal independently derived known/U labels")
    unknown_count = sum(g == "U" for g in independently_derived.values())
    return {"schema_version": 1, "status": "incomplete_diagnostic_only", "independent_validation": True,
        "pre_retrieval": True, "full_validation_passed": False, "promotion_allowed": False,
        "forced_recommendation": "C", "manual_record_reviews": 540, "query_equivalence_reviews": 75,
        "spec_freeze_sha256": sha(root / "spec-freeze.json"), "query_spec_sha256": sha(root / "query-spec.jsonl"),
        "qrels_path": "qrels.jsonl", "qrels_sha256": sha(root / "qrels.jsonl"),
        "validated_qrels_path": str(validated_path.relative_to(root)), "validated_qrels_sha256": sha(validated_path),
        "uncertainty_mask_path": str(mask_path.relative_to(root)), "uncertainty_mask_sha256": sha(mask_path),
        "validation_evidence_path": str(evidence_path.relative_to(root)), "validation_evidence_sha256": sha(evidence_path),
        "corpora": corpora, "known_qrels_match_frozen": True, "total_query_doc_pairs": 40500,
        "known_pair_count": 40500 - unknown_count, "unknown_pair_count": unknown_count,
        "uncertain_intent_document_units": len(masks), "known_unsupported_grade3_count": 0,
        "missing_positive_queries": [], "exact_targets_missing": []}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=ROOT / "validation-manifest.json")
    parser.add_argument("--audit-output", type=Path, default=ROOT / "auditoutputs/validation-evidence.json")
    args = parser.parse_args()
    derived_audit = {}
    result = validate(args.root, args.evidence, derived_audit)
    # No passed file can be emitted until every independent gate above succeeds.
    root = args.root.resolve()
    require(args.output.resolve().parent == root, "Manifest must be in synthetic root")
    require(args.audit_output.resolve().is_relative_to(root), "Audit output must stay under synthetic root")
    report = {"schema_version": 1, "status": "passed", "independent_validation": True,
        "pre_retrieval": True, "spec_freeze_sha256": result["spec_freeze_sha256"],
        "validator_sha256": sha(__file__), "manual_evidence_artifact": {
            "path": result["validation_evidence_path"], "sha256": result["validation_evidence_sha256"]},
        "independent_derivation": derived_audit,
        "grade_derivation_rule": "Independently observed actual-text product/process/basis and measurements; no generator grade function or fact tags imported.",
        "complete_intent_doc_pairs_per_seed": 8100, "complete_query_doc_pairs_per_seed": 13500,
        "synthetic_design_truth_not_human_judgments": True}
    with args.audit_output.open("x", encoding="utf8") as stream:
        json.dump(report, stream, indent=2, sort_keys=True)
        stream.write("\n")
    result["validation_evidence_path"] = str(args.audit_output.resolve().relative_to(root))
    result["validation_evidence_sha256"] = sha(args.audit_output)
    with args.output.open("x", encoding="utf8") as stream:
        json.dump(result, stream, indent=2, sort_keys=True)
        stream.write("\n")
    print(json.dumps({"status": result["status"], "corpora": len(result["corpora"])}))


if __name__ == "__main__":
    main()
