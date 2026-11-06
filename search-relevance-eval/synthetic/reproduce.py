#!/usr/bin/env python3
"""One-command local rerun, using the shared gated exporter/replay/analyzer.

Requires the committed independent evidence/manifest/approval from a completed
study. It never invents reviewer observations or bypasses a missing validation.
Docker setup is opt-in and uses this suite's isolated Compose project only.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent


def load(name, path):
    # Permit the generator's package-relative freeze import without leaking a
    # nested directory into global test/module resolution.
    original_path = list(sys.path)
    sys.path.insert(0, str(ROOT.parent))
    try:
        spec = importlib.util.spec_from_file_location("synthetic." + name, path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path[:] = original_path


def command(args):
    print("+", " ".join(map(str, args)), flush=True)
    subprocess.run(list(map(str, args)), cwd=REPO, check=True)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--artifact-root", type=Path, default=ROOT / ".local/reproduction")
    p.add_argument("--engine-url", default="http://127.0.0.1:19210")
    p.add_argument("--embedding-url", default="http://127.0.0.1:13010")
    p.add_argument("--sbt", default="sbt")
    p.add_argument("--compose", action="store_true", help="Start only this suite's pinned local services after the independent gate passes")
    p.add_argument("--allow-local-writes", action="store_true")
    p.add_argument("--diagnostic-only", action="store_true", help="Explicit supplementary replay with U preserved and recommendation forced C; never satisfies the original confirmatory protocol")
    p.add_argument("--validate-only", action="store_true", help="Regenerate and verify frozen text/qrels/evidence with no network or subprocess services")
    a = p.parse_args(argv)
    execute = load("synthetic_reproduce_execution", ROOT / "execute.py")
    execute.replay.local_url(a.engine_url)
    execute.replay.local_url(a.embedding_url)
    execute.freeze_tool.verify(ROOT)
    manifest = ROOT / ("diagnostic-validation.json" if a.diagnostic_only else "validation-manifest.json")
    approval = ROOT / ("diagnostic-execution-approval.json" if a.diagnostic_only else "execution-approval.json")
    policy = ROOT / "diagnostic-execution-policy.json"
    if not manifest.is_file() or not approval.is_file():
        raise ValueError("Independent completed-study validation and hash-bound execution approval are required; do not fabricate them")
    validation = json.loads(manifest.read_text())
    paths = {(ROOT / row["path"]).resolve().parent for row in validation["corpora"]}
    if any(not path.is_relative_to((ROOT / ".local").resolve()) for path in paths):
        raise ValueError("Registered generated corpora must stay inside the suite's .local artifact directory")
    if len(paths) != 1:
        raise ValueError("The deterministic corpus variants must share their registered output directory")
    # Generate via the existing deterministic generator, never a second dataset recipe.
    generator = load("synthetic_reproduce_generation", ROOT / "generate.py")
    generator.run(next(iter(paths)), root=ROOT, verify_existing=True)
    validator = load("synthetic_reproduce_validation", ROOT / "validate.py")
    evidence_path = ROOT / validation["validation_evidence_path"]
    wrapper = json.loads(evidence_path.read_text())
    raw = wrapper.get("manual_evidence_artifact")
    if raw:
        if validator.sha(ROOT / raw["path"]) != raw["sha256"]:
            raise ValueError("The archived original semantic observations were altered")
        if wrapper.get("validator_sha256") != validator.sha(ROOT / "validate.py"):
            raise ValueError("The independent validator no longer matches its archived evidence")
    raw_path = ROOT / raw["path"] if raw else evidence_path
    if a.diagnostic_only:
        actual = validator.validate_diagnostic(ROOT, raw_path, ROOT / validation["uncertainty_mask_path"],
                                               ROOT / validation["validated_qrels_path"])
    else:
        actual = validator.validate(ROOT, raw_path)
    if raw:
        actual["validation_evidence_path"] = validation["validation_evidence_path"]
        actual["validation_evidence_sha256"] = validator.sha(evidence_path)
    if actual != validation:
        raise ValueError("Recomputed actual-text validation does not match the registered independent manifest")
    if a.diagnostic_only:
        execute.diagnostic_gate(ROOT / "spec-freeze.json", manifest, approval, policy)
    else:
        execute.gate(ROOT / "spec-freeze.json", manifest, approval)
    if a.validate_only:
        print("Frozen generation, complete independent evidence and execution gate verified; no retrieval performed")
        return 0
    if not a.allow_local_writes:
        raise ValueError("Explicit --allow-local-writes is required before starting local services or replay")
    if a.artifact_root.exists() and any(a.artifact_root.iterdir()):
        raise ValueError("Use a new empty artifact root; do not overwrite prior experiment results")
    if a.compose:
        if a.engine_url != "http://127.0.0.1:19210" or a.embedding_url != "http://127.0.0.1:13010":
            raise ValueError("Compose mode uses only its declared loopback ports19210/13010")
        command(["docker", "compose", "-f", ROOT / "compose.yaml", "up", "-d", "--wait"])
    common = [sys.executable, ROOT / "execute.py", "--freeze", ROOT / "spec-freeze.json",
              "--validation", manifest, "--approval", approval]
    if a.diagnostic_only:
        common += ["--diagnostic-policy", policy, "--allow-incomplete-diagnostic-replay"]
    command(common + ["controls", "--engine-url", a.engine_url,
                      "--output", a.artifact_root / "controls-primary.json", "--allow-local-writes"])
    command(common + ["quality-spatial-probe", "--engine-url", a.engine_url,
                      "--output", a.artifact_root / "quality-spatial.json", "--sbt", a.sbt,
                      "--allow-local-writes"])
    command(common + ["prepare", "--artifact-root", a.artifact_root,
                      "--embedding-url", a.embedding_url, "--cache", ROOT / ".local/gte-q8-cache"])
    command(common + ["run", "--artifact-root", a.artifact_root, "--engine-url", a.engine_url,
                      "--sbt", a.sbt, "--allow-local-writes"])
    runs = [a.artifact_root / str(row["seed"]) / "runs.jsonl" for row in validation["corpora"]]
    correctness = ROOT / "results/correctness.json"
    if not correctness.is_file():
        raise ValueError("Rankings are retained, but no frozen correctness attestation is available; do not claim a promotion decision")
    analysis = [sys.executable, ROOT / "analyze.py", "--queries", ROOT / "query-spec.jsonl",
                "--qrels", ROOT / validation["validated_qrels_path"] if a.diagnostic_only else ROOT / "qrels.jsonl",
                "--generation-spec", ROOT / "generation-spec.json",
                "--validation-manifest", manifest, "--correctness", correctness,
                "--output", a.artifact_root / "analysis.json"]
    if a.diagnostic_only:
        analysis += ["--diagnostic-policy", policy, "--uncertainty-mask", ROOT / validation["uncertainty_mask_path"]]
    for path in runs:
        analysis += ["--runs", path]
    command(analysis)
    print("Reproduction results:", a.artifact_root / "analysis.json")
    print("Local services/indexes are retained for inspection; remove only exact owned resources when finished.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
