# Additional inherited-cohort eligibility capture

**Actual diagnostic capture is not run or authorized by this note.** Initial code
writing used no tests, subprocesses, source-hash scans, backend requests, source
outcomes or comparative metrics. After the parent explicitly confirmed all
primary/mixed timing windows ended and authorized offline checks, all 10 additional
unit tests passed (0.114 s). Only the collector's source SHA was computed; no actual
outcomes or backend were inspected. Actual capture still requires the parent's
public supplemental SHA approval after NEW geometry completes. This addendum does
not alter the frozen A/B/C gate; D remains forced and promotion prohibited.

## Fixed scope, before analysis

[additional_eligibility.py](<search-relevance-eval/threshold/additional_eligibility.py>)
uses all inherited frozen queries, not an outcome-selected subset:

| Cohort | Seeds | Catalog size | Queries per seed | Task cases |
| --- | --- | ---: | ---: | ---: |
| LEGACY | 39031, 39032, 39033 | 180 | 75 | 225 |
| REAL | 3901 | 494 | 15 | 15 |

Exactly 240 task cases. Each gets one actual Scala keyword request, reused across
seven actual uniform full-hybrid requests: `ms_050`, `ms_048`, `ms_046`, `ms_045`,
`ms_044`, `ms_042`, `ms_040`. Thus 1,920 diagnostic searches and 1,680 membership
rows. No native-score, isolated root/nested, mixed-role or top-k diagnostic search
is added. No primary rerun, embedding, installation, new DSL or new measurement
implementation is introduced. Installation-control metadata GETs from the existing
verification helper are not these 1,920 searches.

The original [collect.py](<search-relevance-eval/threshold/collect.py>) remains NEW
48 × 9 only. The original production source closure, execution inputs, approval,
query wording, filters, ranking variables and grades are untouched. LEGACY's 12 U
judgments remain U, never grade0. REAL remains unjudged: report source membership
counts, never derived false-positive counts.

## Approval and ordering

The CLI first calls the original locked
[execute.py](<search-relevance-eval/threshold/execute.py>) `gate`. It then verifies
original development, heldout and roles completions; the immutable NONE development
decision and its release references; actual complete NEW geometry and its raw-file
closure/calibration; every inherited frozen task, source export/config, and every
original eight-profile heldout outcome. These are read-only preconditions. Finally
it reuses `verify_installation` to guard the same index UUID/count/mapping and
immutable prepared vector-source bytes. Outputs are not opened before all gates
and verification succeed.

A **new**, separately parent-written `--diagnostic-approval` JSON is required. It
must not replace or amend the original approval/input manifest. Required fields:

```json
{
  "approved_by": "parent-agent",
  "action": "collect_all_inherited_eligibility",
  "execution_inputs_sha256": "ACTUAL_ORIGINAL_INPUT_MANIFEST_SHA256",
  "execution_approval_sha256": "ACTUAL_ORIGINAL_APPROVAL_SHA256",
  "code_sha256": "ACTUAL_ADDITIONAL_COLLECTOR_SOURCE_SHA256",
  "diagnostic_only": true,
  "promotion_allowed": false,
  "forced_recommendation": "D",
  "fixed_cohorts": ["LEGACY", "REAL"],
  "profiles": [0.50, 0.48, 0.46, 0.45, 0.44, 0.42, 0.40],
  "query_selection": "all_frozen_queries",
  "original_geometry_completion_sha256": "ACTUAL_FUTURE_COMPLETE_FILE_SHA256"
}
```

Optionally set `original_geometry_completion_path` to the actual completed NEW
geometry completion file (absolute path recommended). Otherwise the collector
expects `geometry/complete.json` inside the given artifact root. The file must
already exist, lie under that root, cover all nine NEW cases and 48 tasks each,
and match its bound actual release plus five raw streams. A planned placeholder
or incomplete geometry file is insufficient.

Only after explicit parent authorization, the invocation shape is:

```text
python3 search-relevance-eval/threshold/additional_eligibility.py \
  --approval ORIGINAL_APPROVAL \
  --inputs ORIGINAL_INPUT_MANIFEST \
  --artifact-root ORIGINAL_EXECUTION_ROOT \
  --development-record IMMUTABLE_NONE_DEV_RECORD \
  --output ORIGINAL_EXECUTION_ROOT/additional-eligibility \
  --diagnostic-approval NEW_PARENT_SUPPLEMENTAL_APPROVAL
```

The default engine URL is the inherited local endpoint; `--engine-url` can specify
that same originally installed endpoint. Do not execute this command or the tests
while any primary/mixed timing window is active. The source binding intentionally
lives in the supplemental approval: no amendment to the original immutable
source closure is needed to authorize this new file.

## Requests, evidence and failure behavior

The existing [diagnostics.py](<search-relevance-eval/threshold/diagnostics.py>)
`fetch_exhaustive`/`timed_probe` path copies the actual exported request. Its
standard response projection/window changes are the only DSL changes; functional
filters, including inherited CSV/etc filters, remain literal. It explicitly sends
`search_pipeline=_none`. Actual Scala keyword construction is validated by the
existing keyword contract, not approximated by a selector built here. Each hybrid
retains its actual exported source configuration.

The exclusive output directory must not exist, even empty. Its four outputs are:
`additional-eligibility.jsonl`, `receipts.jsonl`, `release.json`, `complete.json`.
These names describe future artifacts, not files created by this code-writing
step. No overwrite or retry is supported. Each response/error receipt is flushed
by `receipt_sink` **before** the shared completeness checker can reject a response.
A request failure leaves release/partial streams and no completion file.

Each membership row records cohort/seed/size/query/system, keyword and hybrid IDs,
actual source/config and projected-request hashes, explicit raw mode and full
window size, and every original top10 ID missing from the hybrid collector. It
contains **no invented empty root/nested vector fields**. The shared receipt
retains all observed hit signatures, parsed-JSON hash, request UTC interval and
auxiliary HTTP timing; these timings never enter primary latency samples.

`complete: true` on a row means the full response passed the existing exact-total,
no-timeout/no-shard-failure, no-truncation/duplicate checks. It does **not** assert
that approximate HNSW search is an exact eligible-ID oracle. If primary IDs are
missing, preserve the actual IDs unchanged: `source_primary_top10_subset: false`
and the missing-ID list. The source-case and final completion instead have
`complete: false`, `capture_complete: true` and
`capture_status: complete_capture_with_window_discrepancies`. This is a complete
capture with a truthful source-window discrepancy, not a forged eligibility pass
or an automatic retry. With no discrepancies the status is `complete_capture`.

Completion binds the release and both raw streams, actual source files/outcomes,
all four corpus cases, 240 task cases, 1,680 rows, 1,920 receipts, exact seven
profiles, per-case query IDs/counts and their hashes, plus a global task-case-ID
list hash. Registration is explicitly
`additional_postregistration_diagnostic_not_frozen_ABC_gate`.

## Analysis boundary

Keep this separate stream out of the NEW-only eligibility analyzer/catalog.
`observed_membership_attribution` is an analysis-only set helper, not a metric or
labeler. It uses the **full** `ms_050` ID set (not its primary top10) to distinguish
observed new admission, and the separately captured keyword set to distinguish
observed vector-introduced membership. Root-versus-nested attribution is not
available from these eight searches; exact vector membership is never claimed.
Missing-primary flags survive the helper and must not become ineligibility claims.

Only a later, separately authorized analysis may join independently known LEGACY
grade0 judgments to this helper for false-positive source attribution. Keep U
separate and REAL entirely unjudged. No qrel file or grade is read by collection.

## Offline tests — 10 passed after explicit parent authorization

[test_additional_eligibility.py](<search-relevance-eval/threshold/test_additional_eligibility.py>)
uses tiny fake source envelopes, mocked diagnostics, a rejecting live-HTTP mock,
and temporary directories. It covers fixed selection, permission/overwrite gates,
keyword reuse and exact eight-search scheduling, literal filter preservation,
window-discrepancy status, 240/1,680/1,920 final counts, durable error receipts with
no completion/retry, and baseline-full-set attribution without relevance claims.
Authorized command (completed successfully):

```text
python3 -m unittest threshold.test_additional_eligibility -v
```

Run from `search-relevance-eval`; 10 tests passed in 0.114 seconds, with no live
HTTP or actual outcome access. The collector source SHA256 is
`2b5297f31c074f523695db825c885c4b6772f22723134ccda33375a484cab7e0`.
No actual diagnostic execution was authorized or performed.
