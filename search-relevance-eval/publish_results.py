#!/usr/bin/env python3
"""Compact a full metric report without changing any computed metric values.

Raw inputs are already separate, SHA256-listed artifacts. Avoid duplicating
those inputs and initial grade payloads; keep every scenario/metric row. Array
entries are formatted one per line for a reviewable Git diff.
"""
import argparse
import copy
import json
import pathlib


def compact(report):
    report = copy.deepcopy(report)
    report.pop("raw_records", None)
    report["resolved_judgments"] = [{k: v for k, v in row.items() if k not in ("judge_a", "judge_b", "adjudication")}
                                     for row in report.get("resolved_judgments", [])]
    report["raw_record_storage"] = ("Original queries, rankings, pair mapping, judge A/B, adjudication and family inputs "
                                    "are committed separately and SHA256-listed in evidence_files. Use report_results.py "
                                    "to regenerate the full raw-embedded JSON.")
    return report


def render(report):
    fields = []
    for key, value in sorted(report.items()):
        prefix = "  " + json.dumps(key) + ": "
        if isinstance(value, list) and value:
            body = "[\n" + ",\n".join("    " + json.dumps(row, sort_keys=True, ensure_ascii=False, allow_nan=False) for row in value) + "\n  ]"
        else:
            body = json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False, allow_nan=False).replace("\n", "\n  ")
        fields.append(prefix + body)
    return "{\n" + ",\n".join(fields) + "\n}\n"


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", required=True)
    p.add_argument("--output", required=True)
    a = p.parse_args()
    if pathlib.Path(a.input).resolve() == pathlib.Path(a.output).resolve():
        raise ValueError("Preserve the full source report separately")
    original = json.loads(pathlib.Path(a.input).read_text())
    value = compact(original)
    text = render(value)
    assert json.loads(text) == value
    pathlib.Path(a.output).write_text(text)


if __name__ == "__main__":
    main()
