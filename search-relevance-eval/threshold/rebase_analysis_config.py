#!/usr/bin/env python3
"""Rebase adapter configuration paths only; never change raw data or hashes."""
import argparse
import json
from pathlib import Path


def rebase(config, workspace, output_dir):
    old = Path(config['workspace'])
    new = Path(workspace).resolve()
    output = Path(output_dir).resolve()
    if not old.is_absolute() or not output.is_relative_to(new):
        raise ValueError('Require absolute original workspace and output under new workspace')
    def visit(value):
        if isinstance(value, dict):
            return {k: visit(v) for k, v in value.items()}
        if isinstance(value, list):
            return [visit(v) for v in value]
        if isinstance(value, str) and (value == str(old) or value.startswith(str(old) + '/')):
            return str(new) + value[len(str(old)):]
        return value
    updated = visit(config)
    updated['output_dir'] = str(output)
    return updated


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--workspace', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--output-config', type=Path, required=True)
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    result = rebase(config, args.workspace, args.output_dir)
    # Only new configuration is written; raw source bytes and immutable receipts
    # retain their original paths/provenance. The adapter revalidates all hashes.
    with args.output_config.open('x') as stream:
        json.dump(result, stream, indent=2, sort_keys=True)
        stream.write('\n')
    print(args.output_config)


if __name__ == '__main__':
    main()
