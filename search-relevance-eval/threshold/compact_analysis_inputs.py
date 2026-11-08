#!/usr/bin/env python3
"""Extract the adapter's typed evidence manifest without loading duplicate arrays.

Input must be the adapter's compact or indented JSON. Actual arguments are loaded
and hash-verified by the unchanged analyzer from evidence.argument_files.
"""
import argparse
import json
import re
from pathlib import Path


def compact(source):
    # The adapter's sorted evidence object begins with its source pin. This
    # distinguishes it from ordinary dataset/quote fields called evidence.
    marker = re.compile(r'"evidence"\s*:\s*(\{\s*"adapter_source_sha256"\s*:)')
    tail = ''
    found = False
    decoder = json.JSONDecoder()
    with Path(source).open(encoding='utf8') as stream:
        while True:
            block = stream.read(1024 * 1024)
            if not block:
                raise ValueError('No complete top-level adapter evidence object')
            tail += block
            if not found:
                match = marker.search(tail)
                if match is None:
                    tail = tail[-256:]
                    continue
                tail = tail[match.start(1):]
                found = True
            try:
                evidence, end = decoder.raw_decode(tail)
            except json.JSONDecodeError:
                continue
            if not isinstance(evidence, dict) or not evidence.get('argument_files'):
                raise ValueError('Typed argument-file evidence required')
            return {'evidence': evidence}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--inputs', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    args = p.parse_args()
    result = compact(args.inputs)
    with args.output.open('x', encoding='utf8') as stream:
        json.dump(result, stream, sort_keys=True, indent=2)
        stream.write('\n')
    print(args.output)


if __name__ == '__main__':
    main()
