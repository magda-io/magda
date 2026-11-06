#!/usr/bin/env python3
"""Fail-closed preregistration gate: specs precede generation and retrieval.

No dataset text, embeddings or search requests are generated here. The frozen
matrix is design truth, not independently validated evidence; retrieval also
requires a separate corpus/label validation gate.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path

SPEC_FILES = ("protocol.md", "intents.jsonl", "query-spec.jsonl", "generation-spec.json",
              "relevance-rubric.md", "decision-gates.json", "architect-notes.md")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def jsonl(path):
    return [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]


def inspect(root):
    root = Path(root)
    generation = json.loads((root / "generation-spec.json").read_text())
    queries = jsonl(root / "query-spec.jsonl")
    intents = jsonl(root / "intents.jsonl")
    plans = generation["record_plans"]
    ids = [r["id"] for r in plans]
    qids = [q["id"] for q in queries]
    iids = [i["intent_id"] for i in intents]
    if len(ids) != 180 or len(set(ids)) != 180:
        raise ValueError("Freeze requires 180 distinct predeclared dataset IDs")
    if len(qids) != len(set(qids)) or len(iids) != len(set(iids)):
        raise ValueError("Duplicate query or intent IDs")
    if sum(r["suite"] == "A" for r in plans) != 100 or sum(r["suite"] == "B" for r in plans) != 80:
        raise ValueError("Suite sizes must be 100 and 80")
    family_counts = {f: sum(r["suite"] == "A" and r.get("domain", r.get("family")) == f for r in plans)
                     for f in ("cocoa", "confectionery", "beverage")}
    if family_counts != {"cocoa": 20, "confectionery": 50, "beverage": 30}:
        raise ValueError("Suite A must have exactly 20/50/30 records")
    seeds = generation["seeds"]
    if len(seeds) < 3 or len(set(seeds)) != len(seeds) or not all(isinstance(s, int) and not isinstance(s, bool) for s in seeds):
        raise ValueError("At least three distinct integer seeds must be fixed")
    matrix = generation["intent_doc_grades"]
    if set(matrix) != set(iids):
        raise ValueError("Grade matrix must cover every declared intent, and only declared intents")
    for intent, grades in matrix.items():
        if set(grades) != set(ids):
            raise ValueError("Every intent requires exhaustive design labels over all 180 IDs: " + intent)
        if any(not isinstance(g, int) or isinstance(g, bool) or g not in (0, 1, 2, 3) for g in grades.values()):
            raise ValueError("Design grades must be integers 0..3")
    groups = {}
    semantic, exact, ambiguous, negative = [], [], [], []
    for query in queries:
        if query["intent_id"] not in matrix or not query.get("query") or not query.get("success_criteria"):
            raise ValueError("Incomplete frozen query/criteria")
        groups.setdefault(query["intent_id"], set()).add(query["split"])
        kind = query["kind"]
        if kind == "semantic":
            semantic.append(query)
        elif kind == "exact":
            exact.append(query)
            target = set(query["authoritative_target_ids"])
            if not target or not target <= set(ids):
                raise ValueError("Exact-query authoritative IDs absent from frozen plan")
            if target != {i for i, grade in matrix[query["intent_id"]].items() if grade == 3}:
                raise ValueError("Exact design qrels and authoritative IDs disagree")
            near = set(query.get("near_identifier_ids", []))
            if not near or not near <= set(ids) or near & target:
                raise ValueError("Exact queries need distinct frozen near-identifier negatives")
        elif kind == "ambiguous":
            ambiguous.append(query)
        elif kind == "no_answer":
            negative.append(query)
        if kind in ("semantic", "functional"):
            grades = matrix[query["intent_id"]]
            if not any(g == 3 for g in grades.values()):
                raise ValueError("Positive-intent design lacks direct anchor")
            hard = [r for r in plans if query["intent_id"] in r.get("hard_negative_for_intent_ids", [])]
            if len(hard) < 2 or any(grades[r["id"]] >= 2 for r in hard):
                raise ValueError("Positive intent needs multiple declared, non-useful hard negatives: " + query["intent_id"])
    if any(len(splits) != 1 for splits in groups.values()):
        raise ValueError("Paraphrases of an intent may not cross development/held-out splits")
    if len(semantic) < 30 or len({q["intent_id"] for q in semantic}) < 10 or len(exact) < 20:
        raise ValueError("Query/intent coverage below ticket requirements")
    if len(ambiguous) < 4 or not negative:
        raise ValueError("Ambiguity/no-answer diagnostics must be separately declared")
    return {"record_ids": ids, "query_ids": qids, "intent_ids": iids, "seeds": seeds,
            "suite_counts": {"A": 100, "B": 80}, "suite_a_family_counts": family_counts,
            "queries_by_kind": {kind: sum(q["kind"] == kind for q in queries)
                                for kind in sorted({q["kind"] for q in queries})}}


def verify(root, manifest=None):
    root = Path(root)
    path = Path(manifest) if manifest else root / "spec-freeze.json"
    frozen = json.loads(path.read_text())
    if frozen.get("phase") != "before_dataset_generation_and_search":
        raise ValueError("Invalid freeze phase")
    actual = {name: sha(root / name) for name in SPEC_FILES}
    if actual != frozen["spec_sha256"]:
        raise ValueError("Frozen specification changed; preserve an explicit pre-run amendment, never silently regenerate")
    if sha(__file__) != frozen["freeze_tool_sha256"]:
        raise ValueError("Freeze checker changed; document an explicit implementation amendment before proceeding")
    if inspect(root) != frozen["design_summary"]:
        raise ValueError("Frozen design summary differs")
    return frozen


def create(root):
    root = Path(root)
    path = root / "spec-freeze.json"
    if path.exists():
        return verify(root)
    summary = inspect(root)
    manifest = {"schema_version": 1, "issue": 3903,
                "phase": "before_dataset_generation_and_search",
                "frozen_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "dependency_pr": "https://github.com/magda-io/magda/pull/3902",
                "framework_base_commit": "15533246b7679752cddbb82ccf702557842fe32f",
                "production_baseline_commit": "ba18156201c50565c85c62f76469245925994ece",
                "spec_sha256": {name: sha(root / name) for name in SPEC_FILES},
                "freeze_tool_sha256": sha(__file__), "design_summary": summary,
                "independent_label_validation": "required after generation, before retrieval"}
    with path.open("x", encoding="utf8") as stream:
        stream.write(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    return manifest


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("action", choices=("create", "verify"))
    p.add_argument("--root", type=Path, default=Path(__file__).resolve().parent)
    a = p.parse_args()
    result = create(a.root) if a.action == "create" else verify(a.root)
    print(json.dumps({"phase": result["phase"], "frozen_at_utc": result["frozen_at_utc"],
                      "record_count": len(result["design_summary"]["record_ids"]),
                      "query_count": len(result["design_summary"]["query_ids"])}))
