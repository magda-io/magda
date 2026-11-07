# #3887 first realization — stage one only

## Authority and exposure

B first attempted the requested root-level freeze read/verify; that path was absent. The study is under `search-relevance-eval/threshold`. B then read its checker and successfully ran `python3 threshold/freeze.py verify` from the evaluation directory, before reading all seven frozen architecture files. The generation specification was read completely in nine consecutive read-tool ranges, lines 1–5539 (the task's 5498-line estimate excluded later frozen material). Public registration: `56aa147db`; registration created 2026-11-07T01:30:01.793737+00:00; independent structural review SHA256 `01584f4b4f929748a0d3393109bd5513c46c146bb4c48da04fb84f8a49026ce5`.

Only this generator, its offline tests, these notes and new private stage-one artifacts are owned by B. No frozen file, production file, inherited corpus, U label, existing result or sibling evaluator is changed. No catalog access, backend request, embedding, analyzer, native comparison, model-service call, old ranking inspection or score selection occurs. Text is authored here as the first realization, not selected from candidates using scores. Planned labels remain design expectations and are **not** claimed independently validated by B.

## Complete stage-one outputs

Default directory: `threshold/.local/stage-one` relative to the evaluation directory.

- Three `core-{seed}.jsonl` files: exactly t001–t060, 180 actual records total.
- Three `growth-{seed}.jsonl` files: g01-r001–g20-r001, 60 actual representatives total.
- `terminal-templates.json`: exactly 60 complete archetype×seed metadata bundles. No sentence-fragment grammar, optional semantic branches or callbacks.
- `manifest.json`: actual creation UTC, exact source/spec/file hashes, all 240 raw and canonical record hashes, inventory and truthful no-execution attestations.

JSONL rows are full DataSet metadata, not envelopes containing labels. Plan/seed/archetype/claim references exist only in the terminal sidecar. Source fields are a closed subset of the actual production DataSet/Distribution types in `Misc.scala`; quality and hasQuality are dataset-only. Parent and children have tenantId 0 and publishingState published. accessControl, spatial and temporal are absent. URLs use reserved.invalid and assert no public data exists there. The metadata explicitly describes fictional physical observations rather than fabricated claims about real surveys or simulated scientific results. Administrative controls remain plainly administrative rather than masquerading as measurement evidence.

## Reconstruction agreement

Manifest `corpora`, `templates` and `terminal_templates` paths resolve from the threshold directory, not the process CWD. Each source entry binds its full-file SHA256 and record count. Two distinct record conventions must not be conflated:

1. `raw_record_sha256`: SHA256 of exact source JSONL row bytes **including** the trailing LF.
2. `canonical_record_sha256`: SHA256 of JSON with sort_keys=True, separators=(',', ':'), ensure_ascii=False, UTF-8, **without** a newline.

The generator writes precisely canonical-record bytes plus LF. Full-file SHA256 covers the entire JSONL. Manifest/source-file hashes are not interchangeable with row hashes.

Each terminal bundle contains the entire metadata object, including fixed structural fields, distributions and literal derived queryContext. Placeholders are literal `{{record_id}}`, `{{station}}`, `{{year}}`, `{{month}}`; every occurrence is declared in `slot_bindings` as a JSON pointer plus slot name. Root and nested projections are not separately injected or rewritten. Exact pointer allowlists reject a new slot or a known slot placed in an unauthorized field. A reviewer can reconstruct using JSON and the following rules without importing B code:

- record_id = archetype ID + `-r` + three-digit replica, structural identifiers and reserved.invalid URLs only;
- station = `Station ` + three-digit replica, publisher.name and exactly one provenance clause in description (therefore also its literal derived queryContext), never title;
- year = decimal `2010 + ((replica-1) % 16)`;
- month = decimal `1 + ((replica-1) % 12)`;
- year/month appear exclusively in `Metadata release: YEAR, month MONTH.`; they are not observation coverage or row-associated measurement-clock facts;
- CSV first and JSON second, exactly two growth distributions; no format substitution or semantic variation across replicas;
- all other bytes and fields remain immutable.

Stage-one actual representatives use replica 1: Station 001, release year 2010, month 1. The domain formulas describe a possible later expansion; this program has **no stage-two materialization API or CLI**, and its renderer emits r001 only. No full growth rows are produced now. Expansion requires independent C actual-text approval, accepted immutable terminal SHA and explicit parent authorization, followed by a separate guarded implementation. There is no --skip or equivalent bypass.

## Projection and wording

The generator imports only the existing pure `run.context` function for projections. Its fallback matches the inspected production `ElasticSearchIndexer.constructDatasetQueryContext` and `constructDistributionQueryContext`: root Title/Description and nested Title/Format/Description with exact line breaks and trailing LF. All generated title/description values are nonempty, so Option/default distinctions cannot change the result. Derived strings are computed from those exact source fields, never hand-inserted query terms. Code, schema and production projection source hashes are bound in the manifest.

Three fixed authored styles correspond to seeds 38871/38872/38873. A stdlib Random stream keyed by SHA256 of experiment/seed/record/stream selects allowed titles and publishers, without shared mutable PRNG state. Styles vary scope phrasing, measurement terminology, sentence structure and file documentation; they do not change canonical claims. Description equality across seeds is explicitly tested. Generic file organization language necessarily recurs across this controlled catalog; it explains actual cross-file interpretation rather than adding unrelated topics. Domain-specific technical paragraphs explain the frozen scope and contrasts. Diversity is three styles over fixed canonical claims, not independent phenomena.

Compact descriptions are 35–70 words, ordinary 65–115, technical 110–170, growth 30–65, nested descriptions 25–65, and titles at most 12 words. Initial in-memory structural QA found no word-budget violations; there was no repair/reroll of an on-disk realization. The technical root descriptions intentionally explain scope, file navigation and limits without listing measurements; those measurements occur only in the first nested description. Root-measurement records do the reverse. Formal lexical and identity-scope checks are structural QA, not semantic validation. In particular, independence/audit must decide whether prose is sufficiently natural and low-overlap; it is not tuned to obtain a score band.

## Safe execution and independent review

From the evaluation directory:

```sh
python3 -m unittest discover -s threshold -p test_generate.py
python3 threshold/generate.py
python3 threshold/generate.py --verify-existing
python3 threshold/freeze.py verify
```

Default reruns verify existing manifest/source hashes and exact first-realization bytes, returning without writes. Creation uses exclusive file handles after a nonempty-directory refusal. A hash mismatch, incomplete first realization or changed source is an error; no overwrite, cleanup, reseeding or silent regeneration occurs. Preserve rejected artifacts and document old/new hashes before any separately authorized pre-score repair. Ordinary tests use temporary directories and never call a backend or modify the retained private realization.

Independent C must read all 180 core and 60 full growth representatives, compare all frozen facts/omissions and every intended grade/exclusion, audit negative absence and source scopes, and bind reviewed terminal bytes. B's tests do not label that work complete and do not import C code or consume C gold plans. After acceptance, terminal strings must remain unchanged; future growth must be reconstructed independently across every complete row and projection. Stage-one generation alone authorizes neither expansion nor embeddings/search.
