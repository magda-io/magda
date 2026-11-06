#!/usr/bin/env python3
"""Lossless-for-analysis projection of immutable replay rows; never runs search.

Original responses retain large facet top_hits vectors. Reuse parent count
projection and remove only hit metadata (available in the frozen corpus), while
checking every rank/score/timing field and operational facet count is retained.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


replay = load("compact_existing_replay", ROOT.parent / "run.py")
operational = load("compact_existing_counts", ROOT.parent / "analyze.py")


def compact(source, output):
    source, output = Path(source), Path(output)
    receipt = output.with_name(output.name + ".projection.json")
    if output.exists() or receipt.exists():
        raise ValueError("Do not overwrite original or projected experiment outputs")
    output.parent.mkdir(parents=True, exist_ok=True)
    before, after, count = hashlib.sha256(), hashlib.sha256(), 0
    with source.open("rb") as incoming, output.open("xb") as outgoing:
        for line in incoming:
            before.update(line)
            if not line.strip():
                continue
            row = json.loads(line)
            result = dict(row)
            result["hits"] = [{key: value for key, value in hit.items() if key != "metadata"}
                              for hit in row["hits"]]
            result["aggregations"] = replay.facet_counts(row.get("aggregations"))
            if operational.counts(result["aggregations"]) != operational.counts(row.get("aggregations")):
                raise ValueError("Compaction changed operational facet counts")
            if any(result[key] != value for key, value in row.items() if key not in ("hits", "aggregations")):
                raise ValueError("Compaction changed a ranking/timing identity field")
            payload = (json.dumps(result, separators=(",", ":"), allow_nan=False) + "\n").encode()
            outgoing.write(payload)
            after.update(payload)
            count += 1
    document = {"schema_version": 1, "source": str(source), "source_sha256": before.hexdigest(),
                "source_bytes": source.stat().st_size, "output": str(output),
                "output_sha256": after.hexdigest(), "output_bytes": output.stat().st_size,
                "rows": count, "searches_executed": 0, "originals_modified": False,
                "projection": "Only hit.metadata and facet top_hits sources/vectors removed; all IDs/ranks/scores/timings/other row fields and parent operational counts preserved.",
                "helper_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    with receipt.open("x") as stream:
        json.dump(document, stream, indent=2, sort_keys=True)
        stream.write("\n")
    return document


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    print(json.dumps(compact(args.source, args.output), sort_keys=True))
