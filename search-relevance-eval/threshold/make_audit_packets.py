#!/usr/bin/env python3
"""Blind, lossless actual-text audit packets; mechanical projection only.

Never import the generator or expose proposed per-record labels, claim-set IDs,
roles or plans. Bind original JSONL bytes and independently verified duplicate
production contexts. Global query criteria/ontology are not record judgments.
"""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def wrapped(value):
    if isinstance(value, str) and len(value) > 550:
        return {"text_chunks": [value[start:start + 550] for start in range(0, len(value), 550)]}
    if isinstance(value, dict):
        return {key: wrapped(item) for key, item in value.items()}
    if isinstance(value, list):
        return [wrapped(item) for item in value]
    return value


def context(document, child=False):
    prefix = "Title: " + (document.get("title") or "None") + "\n"
    if child:
        prefix += "Format: " + (document.get("format") or "None") + "\n"
    return prefix + "Description: " + (document.get("description") or "None") + "\n"


def create(manifest_path, output):
    manifest_path, output = Path(manifest_path).resolve(), Path(output).resolve()
    manifest = json.loads(manifest_path.read_text())
    if output.exists():
        raise ValueError("Do not overwrite an earlier blinded packet set")
    output.mkdir(parents=True)
    # Criteria, never expected positive IDs or per-record grades/roles.
    queries = [json.loads(line) for line in (ROOT / "query-spec.jsonl").read_text().splitlines() if line.strip()]
    intents = [json.loads(line) for line in (ROOT / "intents.jsonl").read_text().splitlines() if line.strip()]
    criteria = [{key: value for key, value in row.items() if key in (
        "intent_id", "kind", "required_claims", "required_absent_claim", "identity", "scope", "policy")}
        for row in intents]
    criterion_path = output / "query-criteria.json"
    criterion_path.write_text(json.dumps({"queries": [{key: value for key, value in row.items()
        if key in ("id", "query", "kind", "intent_id", "authoritative_target_ids", "near_identifier_ids")}
        for row in queries], "intent_criteria": criteria}, indent=2, ensure_ascii=False) + "\n")
    by_seed = {}
    for family in ("corpora", "templates"):
        for source in manifest[family]:
            path = ROOT / source["path"]
            if sha(path) != source["sha256"]:
                raise ValueError("Audit source bytes differ from manifest")
            records = []
            for number, line in enumerate(path.read_bytes().splitlines(keepends=True), 1):
                if not line.strip():
                    continue
                record = json.loads(line)
                if record.get("queryContext") != context(record):
                    raise ValueError("Root production context is not an exact duplicate")
                if any(child.get("queryContext") != context(child, True) for child in record.get("distributions", [])):
                    raise ValueError("Child production context is not an exact duplicate")
                view = dict(record)
                view.pop("queryContext", None)
                view["distributions"] = [dict(child) for child in record.get("distributions", [])]
                for child in view["distributions"]:
                    child.pop("queryContext", None)
                records.append({"seed": source["seed"], "dataset_id": record["identifier"],
                    "source_path": source["path"], "source_sha256": source["sha256"], "source_line": number,
                    "raw_record_sha256": hashlib.sha256(line).hexdigest(),
                    "canonical_record_sha256": hashlib.sha256(json.dumps(record, sort_keys=True,
                        separators=(",", ":"), ensure_ascii=False).encode()).hexdigest(),
                    "context_duplication_verified": "Root Title/Description and each child Title/Format/Description exactly match production projection including final LF; only duplicated contexts omitted from view.",
                    "actual_searchable_metadata": wrapped(view)})
            by_seed.setdefault(source["seed"], {})[family] = records
    index = []
    for seed, groups in sorted(by_seed.items()):
        if len(groups["corpora"]) != 60 or len(groups["templates"]) != 20:
            raise ValueError("Require all60 core and20 class representatives per seed")
        for half in range(2):
            records = groups["corpora"][half * 30:(half + 1) * 30] + groups["templates"][half * 10:(half + 1) * 10]
            path = output / ("packet-" + str(seed) + "-" + str(half + 1) + ".json")
            packet = {"schema_version": 1, "blind": True, "record_count": 40,
                "stage_manifest_sha256": sha(manifest_path),
                "query_criteria_path": str(criterion_path.relative_to(ROOT)),
                "query_criteria_sha256": sha(criterion_path),
                "prompt_path": "validation-prompt.md", "prompt_sha256": sha(ROOT / "validation-prompt.md"),
                "rubric_path": "relevance-rubric.md", "rubric_sha256": sha(ROOT / "relevance-rubric.md"),
                "vocabulary_path": "audit-vocabulary.json", "vocabulary_sha256": sha(ROOT / "audit-vocabulary.json"),
                "sources": list({row["source_path"]: {"path": row["source_path"], "sha256": row["source_sha256"]}
                                 for row in records}.values()), "records": records}
            path.write_text(json.dumps(packet, indent=2, ensure_ascii=False) + "\n")
            index.append({"path": str(path.relative_to(ROOT)), "sha256": sha(path), "seed": seed, "records": 40})
    result = {"schema_version": 1, "stage_manifest_sha256": sha(manifest_path),
              "builder_sha256": sha(__file__), "query_criteria_path": str(criterion_path.relative_to(ROOT)),
              "query_criteria_sha256": sha(criterion_path), "packets": index,
              "record_count": 240, "record_grades_exposed": False, "generator_imported": False}
    (output / "packet-manifest.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(create(args.manifest, args.output), indent=2))
