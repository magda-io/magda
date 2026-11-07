#!/usr/bin/env python3
"""Offline reproduction of registered, nonpromotional threshold evidence only.

No execution mode exists: both --validate-only and --diagnostic-only are required.
C's locked pure API reconstructs actual metadata and labels from original review
observations, not retrieval outcomes. Strict fixture validation remains failed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import types

ROOT = Path(__file__).resolve().parent
# Published registration/C receipts, not hashes accepted from replacement code.
LOCKED_SHA256 = {
    "spec-freeze.json": "d8746926b03e4e94e78c7d777d9868db0ffb997aa4d99c01d2551224ded0c84e",
    "freeze.py": "aafe07b2d7238509c2e782b76e8d7dcb721d9ea9b2f4421795661b0e2b9dcf86",
    "validate.py": "abfc7d5a3264e5c02f4f30ee82a673bbe940a6d999aae5456983d82c68a225ae",
    "diagnostic_expansion.py": "14ce0dcbe0a39e7f17dda284076f6701e0fdf08f65db5e4979e52f608c5bdef0",
    "diagnostic-stage-one-validation.json": "5a42a5e31eeec82489801e30ca8ed11201de7a727d033f58f622eedaad66f735",
    "diagnostic-validation-manifest.json": "8c7ac3766bead6be33493fcaf49480cc66e2dd74333fe772fff6a44811384b29",
    "generation-source-closure.json": "94dc74c98dbd35586f0418d27ce18df098ac071ecf2cfae65dd55bb5b2fa840a",
    "parent-expansion-approval.json": "05219a1ba1c9ba159c2c2fb2650683e0ec965c7acbf74d4d8479866e137029f0",
    "review-source-archive.json": "6f29f9aa300f779d2f181b3333583ef4c5232af2d629d46dc8abebda7dd9320c",
    "review-source-archive.tar.gz": "ebc7da24576106a7bbe514877413259a03106b0e92d9d2de16e6e1af69a21e93",
    "../synthetic/reproduce.py": "d4dee404cfde185ccf3f16250bd14f99cd8bc563a3f19fa2743aee3cd2c60525",
}


def require(ok, message):
    if not ok:
        raise ValueError(message)


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_locked_inputs(root):
    for relative, expected in LOCKED_SHA256.items():
        path = root / relative
        require(path.is_file(), "Missing locked reproduction input: " + relative)
        require(sha(path) == expected, "Locked reproduction input changed: " + relative)


def load_locked(root, relative):
    """Check exact bytes before execution, with no bytecode or implementation imports."""
    path = (root / relative).resolve()
    source = path.read_bytes()
    require(hashlib.sha256(source).hexdigest() == LOCKED_SHA256[relative],
            "Locked reproduction code changed: " + relative)
    module = types.ModuleType("_threshold_reproduction_" + path.stem)
    module.__file__ = str(path)
    exec(compile(source, str(path), "exec"), module.__dict__)
    return module


def compare_jsonl(root, rows, reference):
    """Stream C's canonical bytes against the original sidecar; never write it."""
    relative = reference["path"]
    require(isinstance(relative, str) and not Path(relative).is_absolute(), "Sidecar path must be relative")
    path = (root / relative).resolve()
    require(path.is_relative_to(root) and path.is_file(), "Missing/escaping diagnostic sidecar: " + relative)
    digest = hashlib.sha256()
    count = 0
    with path.open("rb") as stream:
        for row in rows:
            encoded = (json.dumps(row, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode("utf-8")
            require(stream.readline() == encoded, "Recomputed diagnostic sidecar bytes differ: " + relative)
            digest.update(encoded)
            count += 1
        require(not stream.read(1), "Extra diagnostic sidecar bytes: " + relative)
    require(count == reference["row_count"] and digest.hexdigest() == reference["sha256"],
            "Recomputed diagnostic sidecar count/SHA differs: " + relative)
    return {"path": relative, "sha256": digest.hexdigest(), "row_count": count}


def validate(root=ROOT):
    """Restore missing exact sources, then reproduce both C stages and legacy gate."""
    root = Path(root).resolve()
    # Reject any replacement validator or receipt before running even the loader.
    verify_locked_inputs(root)
    load_locked(root, "freeze.py").verify(root)
    legacy = load_locked(root, "../synthetic/reproduce.py")
    # Existing safe/exclusive extractor checks the pinned archive and all member
    # names, types, sizes and SHA256s; altered existing files are never replaced.
    legacy.restore_review_sources(root)
    registered = json.loads((root / "diagnostic-validation-manifest.json").read_text())
    expansion = load_locked(root, "diagnostic_expansion.py")
    # Internally calls locked validate_diagnostic_stage_one with the archived
    # reproduction_inputs and compares its ENTIRE dictionary to the stage receipt.
    result = expansion.validate_diagnostic_expansion(
        root, registered["source_expansion_manifest"]["path"],
        registered["source_diagnostic_stage_validation"]["path"])
    actual = dict(result["manifest"])
    for name, rows in (("qrels", result["qrels"]), ("expanded_evidence", result["evidence"])):
        actual[name] = compare_jsonl(root, rows, registered[name])
    require(actual == registered, "Recomputed complete diagnostic expansion manifest differs")
    require(actual["diagnostic_only"] is True and actual["forced_recommendation"] == "D"
            and actual["promotion_allowed"] is False and actual["actual_text_validation_passed"] is False
            and actual["original_strict_conformance_failed"] is True,
            "Diagnostic reproduction cannot waive strict failure or authorize promotion")
    # The existing legacy CLI's validate-only path regenerates only its frozen
    # deterministic fixtures/evidence, preserves all12 U, and never starts services.
    # Supply argv directly: do not change process-global argv or spawn a command.
    require(legacy.main(["--diagnostic-only", "--validate-only"]) == 0,
            "Original eight-family legacy diagnostic validation failed")
    return {
        "status": "offline_diagnostic_reproduction_verified",
        "diagnostic_only": True, "forced_recommendation": "D", "promotion_allowed": False,
        "actual_text_validation_passed": False, "original_strict_conformance_failed": True,
        "actual_rows": actual["actual_rows_programmatically_closed_all_sizes"],
        "qrel_pairs": actual["total_query_record_seed_size_pairs"],
        "known_pairs": actual["known_pair_count"], "scoped_U": actual["scored_unknown_pair_count"],
        "intentional_U": actual["intentional_ambiguity_pair_count"],
        "legacy_unknown_pairs_unchanged": actual["legacy_unknown_pairs_unchanged"],
        "retrieval_performed": False, "execution_authorized": False,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--validate-only", action="store_true")
    parser.add_argument("--diagnostic-only", action="store_true")
    args = parser.parse_args(argv)
    if not (args.validate_only and args.diagnostic_only):
        parser.error("Require --diagnostic-only --validate-only; original strict validation FAILED (forced D, no promotion). No execution mode is provided.")
    print(json.dumps(validate(), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
