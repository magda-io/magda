#!/usr/bin/env python3
"""Per-study immutable registration over the existing relevance harness.

No generation, embeddings, retrieval, grading or new metric framework. The
architecture is sealed before realization, then later artifact manifests bind
actual independent validation and execution inputs separately.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FILES = ("protocol.md", "query-spec.jsonl", "intents.jsonl", "generation-spec.json",
         "relevance-rubric.md", "decision-gates.json", "design-notes.md")
BASELINE = "ba18156201c50565c85c62f76469245925994ece"
THRESHOLDS = [.50, .48, .46, .45, .44, .42, .40]


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def jsonl(path):
    with Path(path).open(encoding="utf8") as stream:
        return [json.loads(line) for line in stream if line.strip()]


def verify(root=ROOT, manifest=None):
    root = Path(root).resolve()
    manifest = Path(manifest) if manifest else root / "spec-freeze.json"
    document = json.loads(manifest.read_text())
    if document.get("phase") != "before_new_generation_and_threshold_execution":
        raise ValueError("Unexpected registration phase")
    if document.get("production_baseline") != BASELINE or document.get("radial_min_scores") != THRESHOLDS:
        raise ValueError("Frozen baseline/thresholds differ")
    if set(document.get("spec_sha256", {})) != set(FILES):
        raise ValueError("Incomplete architecture registration")
    for name, expected in document["spec_sha256"].items():
        if sha(root / name) != expected:
            raise ValueError("Frozen architecture changed: " + name)
    if sha(root / "freeze.py") != document.get("freeze_tool_sha256"):
        raise ValueError("Registration checker changed")
    review = (root / document["independent_preflight_path"]).resolve()
    if not review.is_relative_to(root):
        raise ValueError("Independent preflight path escapes registration root")
    if sha(review) != document["independent_preflight_sha256"]:
        raise ValueError("Independent preflight changed")
    observed = json.loads(review.read_text())
    if observed.get("status") != "structural_pre_generation_passed" or observed.get("actual_text_validation_passed") is not False:
        raise ValueError("Require truthful structural preflight, not nonexistent actual-text approval")
    if observed.get("spec_sha256") != document["spec_sha256"]:
        raise ValueError("Independent preflight reviewed different architecture")
    return document


def create(root=ROOT):
    root = Path(root).resolve()
    target = root / "spec-freeze.json"
    if target.exists():
        raise ValueError("Do not overwrite a registration")
    review_path = root / "pre-generation-review.json"
    review = json.loads(review_path.read_text())
    hashes = {name: sha(root / name) for name in FILES}
    if review.get("status") != "structural_pre_generation_passed" or review.get("actual_text_validation_passed") is not False:
        raise ValueError("Independent structural review required; actual texts do not yet exist")
    if review.get("spec_sha256") != hashes:
        raise ValueError("Architecture differs from independent structural review")
    # The directory is a new study; artifacts may not predate registration.
    forbidden = (root / ".local/corpora", root / "validation-manifest.json", root / "results/rankings.jsonl")
    if any(path.exists() for path in forbidden):
        raise ValueError("Realization/execution artifact exists before registration")
    document = {"schema_version": 1, "created_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "phase": "before_new_generation_and_threshold_execution", "production_baseline": BASELINE,
                "raw_score_fusion_unchanged": True, "radial_min_scores": THRESHOLDS,
                "diagnostic_top_k": 10, "spec_sha256": hashes,
                "freeze_tool_sha256": sha(root / "freeze.py"),
                "independent_preflight_path": review_path.name,
                "independent_preflight_sha256": sha(review_path),
                "actual_text_validation_passed": False,
                "note": "Structural design only; separate independent actual-text validation and parent approval required before embeddings or retrieval."}
    with target.open("x", encoding="utf8") as stream:
        json.dump(document, stream, indent=2, sort_keys=True)
        stream.write("\n")
    return verify(root)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("create", "verify"))
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    print(json.dumps(create(args.root) if args.action == "create" else verify(args.root), indent=2, sort_keys=True))
