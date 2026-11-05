#!/usr/bin/env python3
"""Audit raw blind assessments, preserve them, and prepare blinded adjudication.

This tool reads only public packets and independent assessor output files. It
never reads rankings, private pair mappings, anchors, or final system metrics.
"""
import argparse
import hashlib
import json
import math
import pathlib
import random
from collections import Counter


def jsonl(path):
    return [json.loads(s) for s in pathlib.Path(path).read_text().splitlines() if s.strip()]


def prepare(jobs, output_dir):
    output_dir = pathlib.Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    packets = {}
    assessed = {"A": {}, "B": {}}
    missing = []
    raw = {"A": [], "B": []}
    for job in jobs:
        packet = json.loads(pathlib.Path(job["packet"]).read_text())
        expected = {row["pair_id"] for row in packet["pairs"]}
        if len(expected) != job["pairs"]:
            raise ValueError("Packet count mismatch")
        for row in packet["pairs"]:
            packets[row["pair_id"]] = {"task": packet["task"], **row}
        if not pathlib.Path(job["output"]).exists():
            missing.append(job["output"])
            continue
        records = jsonl(job["output"])
        got = [row["pair_id"] for row in records]
        if len(got) != len(set(got)) or set(got) != expected:
            raise ValueError("Assessment pair IDs incomplete/duplicated for " + job["output"])
        for row in records:
            if row.get("grade") not in (0, 1, 2, 3, "U") or isinstance(row.get("grade"), bool) or not row.get("evidence"):
                raise ValueError("Invalid grade or missing evidence")
            if row["pair_id"] in assessed[job["role"]]:
                raise ValueError("Duplicate pair/role across groups")
            assessed[job["role"]][row["pair_id"]] = row
            raw[job["role"]].append(row)
    if missing:
        raise ValueError("Incomplete independent judging; missing files: " + json.dumps(missing))
    if set(assessed["A"]) != set(assessed["B"]) or set(packets) != set(assessed["A"]):
        raise ValueError("Pair population differs")
    agreed_by_grade = {}
    conflicts = set()
    for pair_id in sorted(packets):
        a, b = assessed["A"][pair_id]["grade"], assessed["B"][pair_id]["grade"]
        if a != b:
            conflicts.add(pair_id)
        elif isinstance(a, int):
            agreed_by_grade.setdefault(a, []).append(pair_id)
    agreed = [v for group in agreed_by_grade.values() for v in group]
    target = max(1, math.ceil(.1 * len(agreed))) if agreed else 0
    rng = random.Random(5901)
    for group in agreed_by_grade.values():
        rng.shuffle(group)
    audit = []
    # Round-robin grade strata, then random within each stratum.
    while len(audit) < target:
        for grade in sorted(agreed_by_grade):
            if agreed_by_grade[grade] and len(audit) < target:
                audit.append(agreed_by_grade[grade].pop())
    selected = sorted(conflicts | set(audit))
    rng.shuffle(selected)
    review_jobs = []
    for start in range(0, len(selected), 8):
        subset = selected[start:start + 8]
        group = hashlib.sha256("\n".join(subset).encode()).hexdigest()[:16]
        packet_path = output_dir / ("review-" + group + ".json")
        output_path = output_dir / ("review-" + group + ".jsonl")
        payload = []
        for pair_id in subset:
            # Do not label whether a pair was a conflict or common-mode audit.
            payload.append({**packets[pair_id], "assessment_a": assessed["A"][pair_id], "assessment_b": assessed["B"][pair_id]})
        packet_path.write_text(json.dumps({"format_note": "Same blind evidence and two initial assessments; no ranks, system or anchors. Join verbatim_chunks losslessly. Empty omitted fields mean not stated.", "pairs": payload}, ensure_ascii=False, indent=2) + "\n")
        review_jobs.append({"packet": str(packet_path.resolve()), "output": str(output_path.resolve()), "count": len(subset), "group": group})
    for role in ("A", "B"):
        (output_dir / ("judge-" + role + ".jsonl")).write_text("".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in sorted(raw[role], key=lambda x: x["pair_id"])))
    manifest = {"pairs": len(packets), "conflict_pairs": sorted(conflicts), "agreed_numeric_pairs": len(agreed), "common_mode_audit_pairs": sorted(audit), "seed": 5901, "review_jobs": review_jobs, "raw_assessment_sha256": {role: hashlib.sha256((output_dir / ("judge-" + role + ".jsonl")).read_bytes()).hexdigest() for role in ("A", "B")}}
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--jobs", required=True)
    p.add_argument("--output-dir", required=True)
    args = p.parse_args()
    manifest = prepare(json.loads(pathlib.Path(args.jobs).read_text()), args.output_dir)
    print(json.dumps({k: v for k, v in manifest.items() if k not in ("conflict_pairs", "common_mode_audit_pairs", "review_jobs")}, indent=2))
