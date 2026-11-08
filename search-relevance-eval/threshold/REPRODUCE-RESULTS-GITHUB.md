# Reproduce the completed results without model or engine calls

The complete raw capture is public in four ordered binary parts. It contains 787 regular files, 6,192,286,386 raw bytes: exact vectors, exported requests, run/response identity receipts, source contracts and native/membership diagnostics. This is not an entire application backup. Use the compatible evaluation PR3913 checkout.

## 1. Assemble into a new file and authenticate

Run from the repository root. This code refuses to overwrite an archive. Every part and the concatenated archive are checked before the safe restorer sees them.

```python
from pathlib import Path
import hashlib, json
r = Path('search-relevance-eval/threshold')
m = json.loads((r / 'capture-archive-parts.json').read_text())
out = r / '.local/frozen-execution-bundle.tar.xz'
out.parent.mkdir(parents=True, exist_ok=True)
h = hashlib.sha256()
with out.open('xb') as target:
    for part in m['parts']:
        p = Path(part['path'])
        data = p.read_bytes()  # at most 40 MiB
        assert len(data) == part['bytes']
        assert hashlib.sha256(data).hexdigest() == part['sha256']
        target.write(data)
        h.update(data)
assert out.stat().st_size == m['archive_bytes']
assert h.hexdigest() == m['archive_sha256']
```

The manifest is externally pinned to SHA256 `c34db9c9ac0bf50d3c4b516cf74f9fa732706b8c80f22e6833da0fc3542d3a43`; archive SHA256 is `1b9baeafe87c2e02a3b63fb4e713eeff50c029c68bcf77718d5549990909fba4` (149,751,500 bytes).

```bash
python3 -B search-relevance-eval/threshold/restore_capture.py \
  --manifest search-relevance-eval/threshold/capture-bundle-manifest.json \
  --expected-manifest-sha256 c34db9c9ac0bf50d3c4b516cf74f9fa732706b8c80f22e6833da0fc3542d3a43 \
  --archive search-relevance-eval/threshold/.local/frozen-execution-bundle.tar.xz \
  --target-root "$PWD" verify-only
```

Change the final action to `restore` only when you intend to create missing files. All existing files must already match; different files and symlink paths are rejected, never overwritten. No extraction occurs until every archive member has been verified. Use a canonical target path, not a macOS `/tmp` or `/var` symlink spelling. The actual source workspace passed all 787 member checks with zero restoration; [verification](<https://github.com/magda-io/magda/blob/eval/hybrid-minscore-threshold-3887/search-relevance-eval/threshold/results/capture-archive-verification.json>).

## 2. Inspect the exact complete analysis

The [compressed original analysis](<https://github.com/magda-io/magda/blob/eval/hybrid-minscore-threshold-3887/search-relevance-eval/threshold/results/threshold-analysis.json.xz>) decompresses to 365,759,686 bytes with SHA256 `5a065886e8c1ae4168e680585424fbd2d2e52ab41e2ad8000084497180bcfd05`. It retains every dense eligibility event, unknown and sensitivity scenario. The [artifact manifest](<https://github.com/magda-io/magda/blob/eval/hybrid-minscore-threshold-3887/search-relevance-eval/threshold/results/threshold-analysis-artifact.json>) pins both representations. No backend is needed to decompress or inspect it. The CSVs and SVGs are smaller views of computed results, not alternative labels or metrics.

## 3. Rebuild the source-bound analysis in a different checkout

Absolute paths in the originally captured raw receipts are historical provenance and must not be edited. Instead, rebase only the adapter configuration, then regenerate typed argument files under a fresh output directory. The adapter checks every original source SHA; source bodies and immutable NONE decision remain unchanged. Allow substantial RAM (approximately16 GiB-class host) and disk; full argument and receipt projections are intentionally retained.

```bash
python3 -B search-relevance-eval/threshold/rebase_analysis_config.py \
  --config search-relevance-eval/threshold/analysis-capture-config.json \
  --workspace "$PWD" \
  --output-dir "$PWD/search-relevance-eval/threshold/.local/analysis-inputs/replay" \
  --output-config search-relevance-eval/threshold/.local/rebased-analysis-config.json
python3 -B search-relevance-eval/threshold/analysis_inputs.py \
  --config search-relevance-eval/threshold/.local/rebased-analysis-config.json
python3 -B search-relevance-eval/threshold/compact_analysis_inputs.py \
  --inputs search-relevance-eval/threshold/.local/analysis-inputs/replay/inputs.json \
  --output search-relevance-eval/threshold/.local/analysis-inputs/replay/typed-inputs.json
python3 -B search-relevance-eval/threshold/run_analysis.py \
  --inputs search-relevance-eval/threshold/.local/analysis-inputs/replay/typed-inputs.json \
  --output search-relevance-eval/threshold/.local/replayed-analysis.json
```

All output paths are exclusive: use new names for a second attempt, and retain any failed attempt. The compact transport contains the original typed evidence/argument-file references, not a reduced data frame. The wrapper verifies the duplicate uncertainty-pairs source and removes only its unsupported top-level keyword before calling the unchanged analyzer; the complete mask remains bound in policy/evidence. A direct call to the original analyzer CLI fails on that auxiliary keyword, and the first actual failure is recorded rather than hidden.

The original adapter's first attempt was canceled before output because redundant copies of large JSONL/receipt arrays caused resource pressure. Streaming reads, raw-hash checks and read-only caching fixed only transport/resource use. The role helper's first actual call lacked intent-enriched exact IDs in a sensitivity call; the retry uses the same merged query map as the primary analyzer. Neither issue changed a score, label, threshold, gate or captured request. Actual primary and role outputs were independently checked within the documented scope.

Generate charts into a fresh directory:

```bash
python3 -B search-relevance-eval/threshold/visualize.py \
  search-relevance-eval/threshold/.local/replayed-analysis.json \
  search-relevance-eval/threshold/.local/replayed-figures \
  --descriptive-populations search-relevance-eval/threshold/descriptive-populations.json
python3 -B search-relevance-eval/threshold/result_audit.py \
  --compare-report search-relevance-eval/threshold/.local/replayed-analysis.json
```

The audit command has its own exclusive output safeguards; preserve the committed completed audit when choosing output locations. Independent raw anchors and [comparison scope](<https://github.com/magda-io/magda/blob/eval/hybrid-minscore-threshold-3887/search-relevance-eval/threshold/results/independent-comparison.json>) remain authoritative. New analysis timestamps and local rebased paths are not expected to be byte-identical, but metric rows, U suppression and event sets should agree.

All13 owned disposable indices were UUID-verified and deleted after capture; both temporary port-forwards were stopped. Offline reproduction is deliberately independent of those live resources. Fresh backend capture is a different operational replay, not a license to tune on held-out results. This completed study remains **D / nonpromotional**, not a validation pass or proof of an optimal .50.
