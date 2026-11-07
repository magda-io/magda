# Threshold execution integration (NEW #3887)

## Boundary / status

Code and offline unit mocks only. This work does **not** authorize or perform model calls, benchmark searches, native-score probes, `_analyze`, label assignment, ranking tuning, approval creation, or execution-input registration. No production source files or root replay implementation were edited by this specialist. The unresolved strict fixture failure remains a failure; any separately approved sweep is diagnostic-only, forced recommendation D, promotion forbidden.

The existing eight-arm primary runner, actual Scala exporter, and production raw request contracts remain authoritative. Primary exports use min_score .50/.48/.46/.45/.44/.42/.40 and actual k=10 diagnostic; boost50/root, implicit1/nested, functions, filters and all six kNN copies are untouched. Explicit `_none` bypass is permitted only after the parent-bound actual production-NOP pipeline parity report passes.

## Fixed integration bugs

- Preparation derives the model alias, dimension, image and inference identity from the inherited, source-hashed generation spec rather than an independent hardcode. The text cache is additionally namespaced by the complete embedding identity hash; the old global text-only cache is not silently imported. All stage inputs bind existing runtime-image provenance.
- Reused roots and every ordered child must match the inherited `prepare` source projection **in every non-vector field**, not just context text. Query IDs/text/splits/kinds/filters/all other non-vector metadata must match. Duplicate IDs, missing children, changed eligibility/quality/publisher/format, nonnumeric/Boolean/nonfinite/wrong-dimensional vectors fail. Source projection is exactly inherited removal of score/accessControl, public tenant0 and derived queryContext; it is not a label or ranking repair. Existing vector bytes are copied unchanged.
- All 13 registered cases are mandatory: NEW seeds38871/2/3 at60/1000/2000; LEGACY seeds39031/2/3 at180; one REAL case. Every case has a distinct owned index. No silent subset/skip is accepted.
- Required code/exporter/inherited-spec/baseline source closure, correctness report, case inputs, reuse inputs and provenance are hash-checked before action. Eight baseline production hashes stay exact. Preparation receipts bind the model identity and every prepared corpus/query file; exporter completion binds all27 files/case (9arms × requests/mapping/config).
- Every sbt runMain path/index argument is guarded against whitespace, quoting and command separators. A checkout/artifact path needing quoting fails closed before subprocess execution; shell argv quoting alone is not sufficient for sbt's second parser. Actual export index paths are verified, never hand-patched.
- `install` is separate and installs **all** cases before the first timing release. It records dataset counts, actual mapping hashes, index UUIDs, full vector-bearing corpus hashes and a stable root/ordered-child source-vector digest. `run` never installs or embeds. Metadata preflight checks UUID/count/mapping and prepared vector-file identity before a timing window. Vector digest is explicitly a **source-vector digest**, not an independent engine docvalue reread.
- NEW development tasks alone run before DEV decision. Heldout/diagnostic NEW tasks and every LEGACY/REAL task require an explicit, input-bound, dated immutable DEV decision, including NONE, bound to completed DEV artifacts. Original old query kind/filter metadata is preserved; old queries need not acquire a new split field.
- Completion checks cover every task×arm, one excluded warmup +10 measured requests, and complete per-request UTC/hash/all-hit receipts. Files are exclusive, and errors abort without retries, replacement runs or overwrite.
- Native child geometry now enforces eligible **parents as well as children**. Optional actual query-specific parent/child filter predicates must be supplied by the eventual collector when applicable. Native child identity uses parent ID plus actual distribution offset, rejects foreign parents/duplicates/truncation. Exact score script is `lang:knn`, `source:knn_score`, L2, unboosted.
- Full-window collectors request exact hit totals, retain parsed-JSON hashes/UTC/all-hit identities, and require corresponding primary hit IDs. They explicitly report primary-subset/window-HNSW discrepancies; they are not relabelled exact HNSW oracles. Unretrieved semantic scores are not label0.

## Parent-created input additions

The adapter intentionally does not create approval/input files. Parent registration must bind all files in `source_sha256` (repository-relative paths only), including execution/diagnostics/freeze/contract/root-run/Scala-exporter code, inherited generation spec, production-baseline manifest, spec freeze, actual correctness report, all corpus/query/reuse files and all provenance files.

Input fields, in addition to the original skeleton:

```json
{
  "embedding_runtime_provenance": ["repository-relative/existing-image-runtime-receipt.json"],
  "mixed_role_pairs": [[0.5,0.5],[0.45,0.45],[0.45,0.5],[0.5,0.45]],
  "cases": [{
    "cohort": "LEGACY",
    "seed": 39031,
    "catalog_size": 180,
    "index": "magda-relevance-eval-parent-registered-owned-name",
    "corpus": "repository-relative/original-corpus.jsonl",
    "queries": "repository-relative/original-queries.jsonl",
    "reuse_embedded_corpus": "repository-relative/existing-embedded-corpus.jsonl",
    "reuse_embedded_queries": "repository-relative/existing-embedded-queries.jsonl",
    "reuse_embedding": {
      "model": "Alibaba-NLP/gte-base-en-v1.5",
      "image_digest": "sha256:7faca54ae24ce1c03d4213d3a3c2109ff57b23c644e4d22523e1c861201fb6ec",
      "dimension": 768,
      "corpus_sha256": "ACTUAL_EXISTING_EMBEDDED_FILE_HASH",
      "queries_sha256": "ACTUAL_EXISTING_EMBEDDED_FILE_HASH",
      "provenance": ["repository-relative/existing-original-vector-provenance.json"]
    }
  }]
}
```

The reuse object is a **new parent-approved attestation over old immutable files**, not a fabricated claim that old receipts originally contained every modern field. Both reuse files are mandatory together. Omit all reuse fields for newly prepared NEW vectors. No placeholder strings above are valid inputs. Existing original receipts/spec/bundle manifests provide the provenance chain; keep any model-revision limitation explicit.

For mixed-role execution the approval additionally requires `mixed_role_diagnostics_allowed: true`. The immutable DEV record requires `inputs_sha256`, `development_completion_sha256`, `created_utc` with timezone, `immutable_before_heldout: true`, and explicit `selected_threshold` (a registered number or `"NONE"`/null). Forced-D diagnostics require NONE/null, `forced_recommendation: "D"`, `promotion_allowed: false`. Its timestamp must follow completed DEV. Heldout release seals its byte hash; later role execution rejects a changed decision.

## Stage order (parent authorization still required)

Global CLI options precede each subcommand. All operational artifacts must stay under threshold/.local, and a fresh root is required; partial failure is retained, not rerun automatically.

```text
python3 -B search-relevance-eval/threshold/execute.py [global-options] check-gate
python3 -B search-relevance-eval/threshold/execute.py [global-options] prepare
python3 -B search-relevance-eval/threshold/execute.py [global-options] export
python3 -B search-relevance-eval/threshold/execute.py [global-options] --allow-local-writes install
python3 -B search-relevance-eval/threshold/execute.py [global-options] --allow-local-writes run --split development
# Parent/analysis creates the immutable DEV decision (including diagnostic NONE).
python3 -B search-relevance-eval/threshold/execute.py [global-options] --allow-local-writes run --split heldout --development-record <parent-record>
python3 -B search-relevance-eval/threshold/execute.py [global-options] --allow-local-writes role-run --development-record <same-parent-record>
# Geometry/keyword/window probes must come after ALL primary+role latency windows.
```

`export` invokes the actual exporter for all9arms×13indices=117 runMain tasks before installation/timing. No new model/index/DSL selection is inferred from returned results. Query bodies, vectors and thresholds remain literal source artifacts.

## Mixed-role replay implementation

The matched .50/.50 and .45/.45 controls reuse actual primary ms_050/ms_045. Only mixed (.45,.50),(.50,.45) are replayed separately, all50 NEW tasks at all9NEW cases after both primary phases. They are diagnostic-only, promotion-ineligible counterfactuals: exact literal threshold leaves changed in actual uniform .50 source, never represented as independent Scala mixed exports.

A fresh private load of the **unchanged** root runner replaces only that instance's registry with the two fixed diagnostic labels. The live/default primary8 registry remains unchanged. The same `run_export_sets`, deterministic rotation/interleave, single-request executor, timing loop, one warmup, ten measured repetitions, `_none` raw mode and compact all-hit UTC receipts execute them. No second timing loop, root-source patch, pipeline PUT or experimental ranking dispatcher is added. The strict callback rechecks actual baseline/config byte hashes, all frozen task IDs, exact six-leaf role contract and exact declared counterfactual metadata. Both config paths honestly refer to the original uniform .50 config; no mixed-global-config provenance is invented.

## Executable post-latency collector

A separate `collect.py` CLI requires `geometry_diagnostics_allowed: true`, forced-D diagnostic approval, source-hashed collector/query-spec, completed DEV/heldout/roles artifacts, the unchanged NONE DEV-record bytes, and installed-index metadata closure. It is never invoked by prepare/export/run/role-run. All9 NEW cases and all48 non-ambiguous frozen queries are mandatory; no relevance judgments are read. REAL is excluded from native/geometry assertions and remains unjudged.

Additional required input references are `new_validation_manifest`, `legacy_validation_manifest`, and `real_bundle_manifest` (repository-relative, source-hashed). Gate validates actual NEW9/LEGACY3 corpus path/count/SHA against independent closure metadata; row receipts, NEW expanded evidence and qrels are hashed, never parsed for grades. LEGACY query bytes must equal the original independent manifest hash. REAL raw/embedded corpus and query hashes must match all four original reproduction-bundle members. This backs the known/U evidence Boolean with actual metadata and does not imply REAL relevance validation.

Full CLI example (paths are parent-created, not supplied by this work):

```text
python3 -B search-relevance-eval/threshold/collect.py \
  --approval search-relevance-eval/threshold/execution-approval.json \
  --inputs search-relevance-eval/threshold/execution-inputs.json \
  --artifact-root search-relevance-eval/threshold/.local/execution \
  --output search-relevance-eval/threshold/.local/execution/geometry \
  --development-record <same-parent-immutable-NONE-record> \
  --engine-url http://127.0.0.1:19200
```

Before full geometry, a fixed calibration runs first10 sorted source dataset IDs against first sorted DEV query in each case, on the already installed source vectors; exact engine `knn_score` must equal `1/(1+sum((q-d)^2))` within preregistered1e-5. This is not a score-selected boundary test and does not create/index a new benchmark or model input. Thereafter each numeric task gets complete root and authorized-child exact scores, actual full keyword membership from the Scala keyword export, seven actual full-hybrid collections, and seven literal root/nested branch isolations. The isolated branches copy the actual production main kNN wrapper (boost/filter intact); nested isolation also retains parent eligibility. No isolated body is replayed as a primary ranking arm. Retrieved Faiss branch scores are compared with unboosted exact geometry, with discrepancies retained separately; nested maximum can differ when HNSW omits the best child.

Outputs stream incrementally: native rows, full eligibility rows, typed source-vector inventory, every HTTP receipt (including error/incomplete responses), fixed calibration results; final completion hashes all files. Native rows include dataset/query identity, exact root score, all child identifiers/offsets/authorization/scores/dimensions/projection hashes, root dimension/projection hash and frozen query-vector hash. Projection hashes use exact UTF-8 queryContext bytes; vector hashes use canonical JSON. The source inventory is grounded in the independently closed corpus manifest but is not falsely described as a new independent C review of model outputs. Approximate HNSW/full-window membership differences from primary top10 are explicitly recorded and cause downstream completeness gates to remain nonpassing; no result is silently zero-labelled. No automatic retry/rerun/overwrite is provided.

## Offline verification

```text
python3 -B -m unittest discover -s search-relevance-eval/threshold -p 'test_execute.py' -v
python3 -B -m unittest discover -s search-relevance-eval/threshold -p 'test_diagnostics.py' -v
python3 -B -m unittest discover -s search-relevance-eval/threshold -p 'test_collect.py' -v
```

Final scoped result: 21 execution integration tests +8 collector tests +5 existing diagnostic tests passed (34 total). All service calls in integration tests are mocks; temporary fixture approval-shaped files are isolated to test-owned temporary repositories and are not study authorization. Existing 3-D smoke fixtures exercise contracts; no study corpus, new vectors, qrels, labels or rankings are loaded. One initial `py_compile` attempt failed because system Python attempted an out-of-workspace bytecode-cache write; it was not escalated/retried. Tests use `-B` and do not write that cache.
