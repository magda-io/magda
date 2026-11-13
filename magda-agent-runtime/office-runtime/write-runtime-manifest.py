#!/usr/bin/env python3
"""Write runtime.json for DSH's load_workspace_dependencies tool.

DSH's `@deepseek-ai/dsh-tool-workspace-dependencies` describes a bundled
Python payload by `<payload>/runtime.json` and `<payload>/dependencies/python`.
MAGDA's payload is a read-only virtual environment over Debian's
/usr/bin/python3, so the manifest records that interpreter's version and the
installed distributions the Office skills rely on.

Run at image build time with the payload interpreter:
    <payload>/dependencies/python/bin/python3 write-runtime-manifest.py \
        --arch "$(node -p process.arch)" --out <payload>/runtime.json
"""

import argparse
import importlib.metadata
import json
import platform
import re
import sys

# Libraries named by the load_workspace_dependencies tool description and the
# office-docx/pptx/xlsx skills. Their runtime dependencies are added below.
ROOTS = ["python-docx", "python-pptx", "openpyxl", "XlsxWriter", "Pillow", "lxml", "numpy", "pandas"]


def normalise(name):
    return re.sub(r"[-_.]+", "-", name).lower()


def closure(roots):
    found = {}
    pending = list(roots)
    while pending:
        name = pending.pop()
        if normalise(name) in {normalise(n) for n in found}:
            continue
        try:
            dist = importlib.metadata.distribution(name)
        except importlib.metadata.PackageNotFoundError:
            if name in roots:
                raise SystemExit(f"write-runtime-manifest: required distribution {name} is not installed")
            continue  # e.g. a dependency only needed on other Python versions
        found[dist.metadata["Name"]] = dist.version
        for requirement in dist.requires or []:
            if ";" in requirement and "extra" in requirement.split(";", 1)[1]:
                continue
            match = re.match(r"\s*([A-Za-z0-9][A-Za-z0-9._-]*)", requirement)
            if match:
                pending.append(match.group(1))
    return dict(sorted(found.items(), key=lambda item: normalise(item[0])))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--arch", required=True, choices=["x64", "arm64"], help="Node.js process.arch")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    if sys.prefix == sys.base_prefix:
        raise SystemExit("write-runtime-manifest: run with the payload's virtual environment interpreter")
    manifest = {
        "desktopVersion": "magda-agent-runtime",
        "platform": "linux",
        "arch": args.arch,
        "python": platform.python_version(),
        "pythonPackages": closure(ROOTS),
    }
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")
    print(json.dumps(manifest))


if __name__ == "__main__":
    main()
