#!/usr/bin/env python3
"""Compatibility wrapper for the frozen analyzer's typed auxiliary mask input.

Only the duplicate top-level uncertainty_pairs transport key is removed, after
exact policy equality and canonical mask-SHA verification. Evidence references,
policy, qrels, grades, metrics and the immutable analyzer are unchanged.
"""
import argparse
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("threshold_frozen_report_core", HERE / "analyze.py")
analysis = importlib.util.module_from_spec(spec)
spec.loader.exec_module(analysis)


def report_arguments(payload):
    if "uncertainty_pairs" not in payload:
        return payload
    policy = payload.get("diagnostic_policy", {})
    auxiliary = payload["uncertainty_pairs"]
    if auxiliary != policy.get("uncertainty_pairs"):
        raise ValueError("Auxiliary uncertainty transport differs from policy; no fields removed")
    if analysis.digest(auxiliary) != policy.get("uncertainty_mask_sha256"):
        raise ValueError("Auxiliary uncertainty canonical SHA differs from preregistered mask")
    converted = dict(payload)
    del converted["uncertainty_pairs"]
    return converted


def run(inputs, output):
    inputs, output = Path(inputs).resolve(), Path(output).resolve()
    if output.exists() or output == inputs:
        raise ValueError("No overwrite/input collision")
    payload = analysis.load_analysis_payload(json.loads(inputs.read_text()), inputs.parent)
    report = analysis.build_report(**report_arguments(payload))
    with output.open("x", encoding="utf8") as stream:
        json.dump(report, stream, sort_keys=True, indent=2, allow_nan=False)
        stream.write("\n")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inputs", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    report = run(args.inputs, args.output)
    print(json.dumps(dict(output=args.output, decision=report["decision"]), sort_keys=True))


if __name__ == "__main__":
    main()
