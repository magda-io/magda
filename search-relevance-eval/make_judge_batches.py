#!/usr/bin/env python3
"""Render public blind packets only into readable, differently shuffled task batches.

No private mapping, ranks, system labels or anchor files are read by this utility.
Long strings are losslessly split into verbatim_chunks so text readers do not
silently truncate single JSON lines. Concatenating the chunks restores the text.
"""
import argparse
import hashlib
import json
import pathlib
import random


def readable(value):
    if isinstance(value, str) and len(value) > 650:
        return {"verbatim_chunks": [value[i:i + 650] for i in range(0, len(value), 650)]}
    if isinstance(value, dict):
        # Empty/null fields contain no positive metadata evidence. Omitting them
        # reduces reader overhead; the packet explicitly states this convention.
        return {k: readable(v) for k, v in value.items() if v is not None and v != "" and v != [] and v != {}}
    if isinstance(value, list):
        return [readable(v) for v in value]
    return value


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--packets", required=True)
    p.add_argument("--output-dir", required=True)
    p.add_argument("--phase", required=True, choices=["development", "heldout"])
    a = p.parse_args()
    groups = {}
    for line in pathlib.Path(a.packets).read_text().splitlines():
        row = json.loads(line)
        key = hashlib.sha256(json.dumps(row["task"], sort_keys=True).encode()).hexdigest()[:16]
        groups.setdefault(key, []).append(row)
    manifest = []
    for role, seed in [("A", 3901), ("B", 4911)]:
        root = pathlib.Path(a.output_dir) / role
        root.mkdir(parents=True, exist_ok=True)
        for key, rows in sorted(groups.items()):
            rows = list(rows)
            random.Random(str(seed) + key).shuffle(rows)
            path = root / (key + ".json")
            common_task = rows[0]["task"]
            pairs = [{k: v for k, v in row.items() if k != "task"} for row in rows]
            path.write_text(json.dumps({"format_note": "The common task applies to every pair. Join verbatim_chunks without separators; nonempty metadata is untruncated. Empty/null fields are omitted and mean not stated.", "task": readable(common_task), "pairs": readable(pairs)}, ensure_ascii=False, indent=2) + "\n")
            manifest.append({"role": role, "phase": a.phase, "group": key, "packet": str(path.resolve()),
                             "output": str((pathlib.Path(a.output_dir).parent / (a.phase + "-judgments-" + role + "-" + key + ".jsonl")).resolve()),
                             "pairs": len(rows), "packet_sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    print(json.dumps(manifest))


if __name__ == "__main__":
    main()
