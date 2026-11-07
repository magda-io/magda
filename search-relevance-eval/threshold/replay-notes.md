# Raw exported-variant replay (offline implementation notes)

## Scope and API

The reusable runner remains in [run.py](../run.py). Existing `run` retains its
seven default systems, pipeline creation, three measured repetitions, request
transformations and output format. Only its existing timer/receipt and
hash-rotation/interleave helpers are shared with the new raw runner.

```python
run_export_sets(args, request_sets, *, config_paths=None,
                validate_request_sets=None)
```

`request_sets` maps registered labels to actual Scala JSONL export paths;
`config_paths` declares one effective Scala config export per label. The default
validator is loaded by file path from [export_contract.py](export_contract.py),
without importing the higher-level adapter. An adapter can instead pass the
same validator callable explicitly; its signature is
`validate_request_sets(loaded_rows_by_label, config_paths=declared_paths)`.
The callable must enforce the external provenance/DSL contract and return a
JSON-serializable validation receipt. It is not an extension point for inventing
ranking DSL or relaxing the frozen experiment contract.

Registered labels are `ms_050`, `ms_048`, `ms_046`, `ms_045`, `ms_044`, `ms_042`,
`ms_040`, `topk10diag`. The external contract requires the .50 reference and
at least one comparison. The higher-level threshold adapter owns requiring all
eight labels, query-family gating, split/freeze checks, and depth/repetition
policy (10 each); generic replay only requires positive integer depth/repetitions.
The exported body size must already equal the requested depth. Replay never
changes it: Scala must export with `--limit 10` for the threshold study.

## CLI (interface example only; do not execute unfrozen target queries)

```text
python3 search-relevance-eval/run.py run-exports \
  --engine-url http://127.0.0.1:19200 \
  --index magda-relevance-eval-OWNED \
  --request-set ms_050=ACTUAL_050_JSONL --config-set ms_050=ACTUAL_050_CONFIG \
  --request-set ms_048=ACTUAL_048_JSONL --config-set ms_048=ACTUAL_048_CONFIG \
  --output NEW_OUTPUT_JSONL --raw-production-only \
  --depth 10 --repetitions 10 --seed 0
```

Labels/resource names above are placeholders, not an executable benchmark.
`--compact-output` defaults true; `--no-compact-output` retains final facet
payloads and optional `--corpus` hit metadata. Compact output removes only hit
metadata and facet top-hit payloads via the existing `facet_counts` helper;
IDs, scores, ranks, total hits, shard status and all ten latency samples remain.

## Raw pipeline override and future parity gate

No search pipeline is created, and no `experimental`/normalization projection
is called. Bodies remain the exact parsed Scala exports: root boost 50,
nested functions, filters, aggregation copies and vectors are not rewritten.
All exported HTTP query parameters are retained except `search_pipeline`:
explicit `--raw-production-only` overrides the known production
`magda-datasets-hybrid-search` parameter with `_none`. The index address is
replaced by the owned local index. Unknown pipeline names and body pipeline
specifications fail closed. `_none` also prevents inheriting an index-default
pipeline. Original and replay pipeline values plus the explicit override reason
are recorded in request provenance; the override is not concealed as an exact
parameter replay.

**Before any live study, the higher-level adapter must require an engine parity
receipt on old smoke fixtures proving the original production NOP pipeline and
`_none` have identical raw IDs/scores/counts.** This runner does not establish
that parity, does not create its pipeline, and its unit tests are not parity
or engine-performance evidence. Target specifications are still unfrozen:
no engine calls, embedding/model inference, new Scala benchmark exports or
benchmark generation were performed for this implementation.

## Schedule, failure and artifacts

Each query uses the legacy SHA-256 query-ID rotation across fixed label order,
then one excluded warmup per label. Each of ten measured rounds rotates that
order by the round offset and interleaves labels. Seed is recorded as context;
it does not silently change the legacy hash schedule. Every measured response
contributes a latency sample and ranking/score signature. All distinct repeat
signatures are retained and `repeat_instability` is true when they differ.

Validation of query-ID uniqueness/equal ID sets, config provenance and complete
DSL runs before artifact creation or requests. Local URL and owned-index guards
apply to direct API calls as well as CLI parsing. Existing artifacts or output
paths aliasing inputs/each other are rejected; none are silently overwritten.

New artifacts are:

- `OUTPUT`: compact final rows with all measured latency samples.
- `OUTPUT.requests.jsonl`: one `kind=export_set_validation` header with source
  and config file hashes/contract receipt, then one `kind=exported_request` per
  query/label with the original complete export and actual replay URL/body hash.
  Large DSL/vectors and full validation receipts are **not repeated per timing**.
- `OUTPUT.repetitions.jsonl` (or explicit `--raw-output`): append-only warmup and
  measured receipts using the existing `response_receipt`. Each retains the
  full parsed-response JSON hash, top-level ID/rank/score list, all nested/facet
  hit ID/rank/score signatures, facet counts, total hits, shards, `took`, timeout,
  measured elapsed time, request identity, seed and phase/repetition.

The ledger stores **receipts, not full raw response bodies or wire bytes**.
Its `parsed_json_sha256` hashes the full parsed response before compaction, and
`full_response_body_stored` is false. This avoids reproducing the prior large
facet `_source`/vector response artifact. The last full response is released
after each query/label is compacted.

Transport exceptions, search timeouts and failed shards abort immediately;
the receipt/error ledger and prewritten request provenance remain. No request
is automatically retried or rerun, and incomplete runs leave an empty reserved
final output rather than plausible completed rows.

Mock-only tests are in [test_threshold_replay.py](test_threshold_replay.py), with
legacy default/schedule checks in [test_run.py](../test_run.py). Mutated old
smoke rows are clearly unit fixtures, never claimed to be actual new exports.
