# Independent code review — threshold analyzer

## Scope and disposition

**Review of code, not experiment results. Not ready for promotional conclusions.** No actual corpora, manual reviews, gold-grade outcomes, `.local` score outputs, backend/model implementation or search endpoint were read. Only this new review file is owned/changed by this reviewer; no analyzer or test changes were made.

Reviewed checkout HEAD `56aa147db4889bb89537c6c0642e7a6bf67c00a2`, branch `eval/hybrid-minscore-threshold-3887`. Baseline source SHA-256:

- [Analyzer](<search-relevance-eval/threshold/analyze.py>): `60d1c6a9c874dc827805b39aaf401afc5c6442a829b4bbda594dd25d590ef279`
- [Tests](<search-relevance-eval/threshold/test_analyze.py>): `0fd42b6423d5ce7747a670b8d1bd5189fc3bad1d1e4f65e426d5abfb9bd717e9`

Locations below refer to that reviewed revision; concurrent fixes may move them. Parent has received findings for relay to the implementation owner. Acceptance by parent is not verification of a fix.

Read the frozen [protocol](<search-relevance-eval/threshold/protocol.md>) and [decision gates](<search-relevance-eval/threshold/decision-gates.json>), [analyzer](<search-relevance-eval/threshold/analyze.py>), [analyzer tests](<search-relevance-eval/threshold/test_analyze.py>), pertinent existing [synthetic scoring](<search-relevance-eval/synthetic/analyze.py#L222-L270>) and [core evaluator](<search-relevance-eval/evaluate.py#L135-L155>) helpers, plus integration-only portions of [execution adapter](<search-relevance-eval/threshold/execute.py>) and [export contract](<search-relevance-eval/threshold/export_contract.py>).

## Findings, in priority order

### 1. P0 — separately approved forced-D policy is not consumed

**Location:** [build_report:852–934](<search-relevance-eval/threshold/analyze.py#L852-L934>), especially [decision call:918–923](<search-relevance-eval/threshold/analyze.py#L918-L923>).

The analyzer has no explicit diagnostic-policy parameter/verification. An evidence object containing `diagnostic_only:true`, `promotion_allowed:false`, `forced_recommendation:'D'`, and `original_strict_conformance_failed:true` is merely echoed. None of these fields constrains `decide`. The existing [execution adapter:71–76](<search-relevance-eval/threshold/execute.py#L71-L76>) permits separately approved forced-D diagnostics when original fixture conformance failed, but that approval does not reach the analyzer decision.

**Executed invented-unit reproduction:** shrink gates to one seed/core60 and five invented queries (three semantic paraphrases, one unrelated negative, one OR-lookalike), retain all seven primary systems plus topk, provide matching full qrels/run/receipt/native/eligibility inventories, and mock only inherited `legacy_report` as `complete:true` to isolate NEW control flow. Supply the four policy fields above alongside current required evidence flags. Result: **recommendation `A`, problems `[]`**. No actual benchmark outcomes were used. This same reproduction had no mixed-axis runs and no receipt hit/surface bodies (finding 5).

**Required boundary:** accept a separately registered, source-bound, pre-score diagnostic-only policy and make its forced-D/no-promotion status unconditional. Do not satisfy the original strict path by inventing validation/correctness passes. Leave the original frozen normal-workflow A/B/C gates unchanged. The parent-reported original unsatisfiable design constraint and scoped NEW U are context supplied by parent, not independently inspected outcomes.

### 2. P1 — byte hashes and in-memory hashes are not linked to one source of truth

**Locations:** [payload_problems:407–411](<search-relevance-eval/threshold/analyze.py#L407-L411>), [verify_bindings:414–426](<search-relevance-eval/threshold/analyze.py#L414-L426>), [legacy binding validation:959–967](<search-relevance-eval/threshold/analyze.py#L959-L967>), [CLI:1024–1028](<search-relevance-eval/threshold/analyze.py#L1024-L1028>).

The CLI hashes declared source-file bytes, but does not parse those files to derive the canonical objects used for analysis. `payload_problems` independently compares each payload against a digest supplied by the same manifest. It therefore cannot establish that the qrels/runs/etc. payload is the content of its claimed immutable source. Replacing a payload and its self-declared `input_sha256` leaves the independent source byte binding untouched and valid.

Additionally, the CLI independently hashes only outer `evidence.bindings`. The legacy bundle's `bindings` are passed straight to `validate_bindings`; their `observed_sha256` values are never recomputed by this CLI. The original U mask is checked against another caller-supplied list from that bundle, not the parsed original mask. Counts of 12 U plus a self-consistent replacement mask do not prove the original 12 identities remained unchanged.

**Tiny reproduction:** `validate_bindings({'x': {'expected_sha256': H, 'observed_sha256': H}}, ('x',))` returns `[]` without reading any file. Independently, `payload_problems({'input_sha256': {'qrels': digest([2])}}, qrels=[2])` returns `[]`, irrespective of whether the source file bound as qrels actually contains `[1]`. These helpers are currently the entire connection checked by the CLI.

**Required boundary:** derive canonical payload proof from independently loaded, hash-verified artifact contents, including nested legacy source closure, and compare actual loaded objects. Preserve the original U mask/labels and frozen validation status. Opaque manifest booleans and two unrelated self-declared hashes must not authorize promotion.

### 3. P1 — incomplete DEV choice records pass verification; chronology is asserted, not checked against event sources

**Locations:** [selection verifier:747–772](<search-relevance-eval/threshold/analyze.py#L747-L772>), [existing accepting test:307–314](<search-relevance-eval/threshold/test_analyze.py#L307-L314>).

The verifier requires only some check for each candidate, not the complete registered DEV seed/size/query/gate coverage. It does not require or recompute `dev_input_sha256`, architecture hashes, corpus/vector/DSL hashes, check values/limits, or rejected-candidate reasons. A self-rehashed record containing one `{system, passed:true}` per candidate is accepted. The test currently codifies that acceptance.

**Executed tiny reproduction:**

```python
record = dict(
    selection_valid=True, gates_sha256=m.digest(g),
    chosen_system_or_none='ms_048', parent_acknowledgment='main',
    timestamp_before_first_heldout_request='2026-11-07T01:30:00Z',
    all_DEV_gate_values=[dict(system=s, passed=True)
                        for s in ('ms_048', 'ms_046')])
record['record_sha256'] = m.digest(record)
evidence = dict(
    first_heldout_event_utc='2026-11-07T02:00:00Z',
    dev_record_sha256_before_heldout=record['record_sha256'],
    first_legacy_event_utc='2026-11-07T01:00:00Z')
assert m._selection_problems(record, evidence, g) == []
```

This has no canonical DEV input hash or real gate matrix and even supplies an earlier legacy event. Only the declared held timestamp is examined; neither held diagnostic scoring nor any legacy-score access is independently ordered against a source-bound release ledger. The selector also accepts `heldout_not_executed:true` without a corresponding legacy-not-inspected boundary.

**Required boundary:** reconstruct/verify complete DEV-only evidence with exact registered coverage and recompute strict `.48` then `.46` selection before accepting the immutable record. Check actual source-bound release/event order before any held retrieval, native/keyword scoring or legacy outcome access. A diagnostic NONE record must be explicit policy-bound status, not fictitious successful candidate checks.

### 4. P1 — DEV selection can omit every critical exact control

**Locations:** [inventory:656–684](<search-relevance-eval/threshold/analyze.py#L656-L684>), [DEV checks:719–728](<search-relevance-eval/threshold/analyze.py#L719-L728>).

`development=True` skips all query-kind count checks. It validates semantic and negative intent sets but never consumes `inventory.development_exact_cluster` or `heldout_exact_clusters`. Exact checks are emitted only for queries actually supplied. Omitting all three tx01 DEV queries therefore creates no failed or undefined exact check and is not an inventory problem.

**Executed tiny reproduction using the original frozen gates:** build query dictionaries for exactly the expected six DEV semantic queries (three each in t01/t02) and the expected four DEV negatives, with **zero exact queries**. Supply the registered 3×3 corpus descriptor grid using invented nested ID sets. Result:

```text
DEV exact queries: 0
DEV inventory problems: []
```

Thus a complete run/receipt grid over that reduced query set can still select a candidate without any DEV exact safety evidence.

**Required boundary:** require the registered DEV three exact queries/tx01 cluster and whole-cluster split, plus the full held exact cluster inventory in the final report. Validate expected query identities, not just a total of twelve exact rows later.

### 5. P1 — mandatory mixed-axis and repeated-surface evidence can be replaced by two booleans

**Locations:** [boolean evidence gates:886–893](<search-relevance-eval/threshold/analyze.py#L886-L893>), [expected request grid:897–901](<search-relevance-eval/threshold/analyze.py#L897-L901>), [receipt validation:775–807](<search-relevance-eval/threshold/analyze.py#L775-L807>).

The expected run/receipt grid includes seven primary systems and topk only. Neither mixed-axis diagnostic is required or analyzed. `mandatory_branch_diagnostics_complete:true` substitutes for their actual requests, results, native membership, pair coverage and latency evidence.

Receipt hashes are syntax-checked but not joined to retained response objects. `hits` are optional, and even ranking comparison is conditional on the last measured receipt containing them. No required counts/facets/nested offsets/child authorization identities or independently expected surface truth are consumed. The repeated-surface safety gate is just `all_repetition_surface_checks_passed:true`. `repeat_diagnostics` treats missing `hits`/aggregations/total hits as one stable digest of `None`.

**Executed isolated reproduction:** the invented fixture from finding 1 returned `A`/`[]` with **zero mixed-axis runs** and **80 receipts with no hits, aggregations, total hits or nested identity/surface results**; only opaque booleans purported to certify these mandatory checks. Legacy was mocked solely to isolate this NEW prerequisite gap.

**Required boundary:** consume source-bound structured mandatory diagnostic/surface results with explicit expected query/system/seed/size/repetition coverage and concrete missing/failure state. Missing diagnostics must force D, not negative evidence or `eligible:false`; below-100 latency remains descriptive without manufacturing a safety pass. No full production rewrite is requested.

### 6. P1 — native/actual branch diagnostics can be declared available while child scores are absent

**Locations:** [native parsing:429–458](<search-relevance-eval/threshold/analyze.py#L429-L458>), [eligibility completeness:525–529](<search-relevance-eval/threshold/analyze.py#L525-L529>), [native availability check:551–555](<search-relevance-eval/threshold/analyze.py#L551-L555>).

Availability requires a present root score, but no independently expected child-ID/projection inventory. An actual nested-vector member can have `children:[]` and `max_child_score:null`, and diagnostics are still declared available. Optional missing `root_vector_ids`/`nested_vector_ids` also do not prevent `available:true`. This cannot certify all authorized native scores and actual branch membership required by the frozen all-corpus diagnostic.

**Executed tiny reproduction:** use one useful dataset `a`, two systems `.50/.45`, full keyword/hybrid eligibility rows each declaring `nested_vector_ids:['a']`, valid root score `.47`, and a native row `children:[]`, `max_child_score:None`. Result:

```text
nested actual member but zero child scores: True []
```

(`True` is `eligibility_attribution(...)["available"]`; `[]` is its missing-evidence list.) No corpus text is involved.

**Required boundary:** verify native child identities/projection hashes against the independently frozen authorized distribution inventory, and explicitly represent/require actual root/nested membership coverage. Missing actual/native branch evidence must stay unavailable and force D when mandatory, not silently mean no nested vector.

### 7. P1 integration blocker — registered topk ID and actual runner label have no explicit mapping

**Locations:** [export label:19](<search-relevance-eval/threshold/export_contract.py#L19>), [actual export loop:165–170](<search-relevance-eval/threshold/execute.py#L165-L170>), [frozen diagnostic ID:386–390](<search-relevance-eval/threshold/decision-gates.json#L386-L390>), [DEV system check:713–715](<search-relevance-eval/threshold/analyze.py#L713-L715>), [final system check:865–868](<search-relevance-eval/threshold/analyze.py#L865-L868>).

The runner/exporter use `topk10diag`; gates/analyzer use `topk10`. Both selectors reject the actual runner label as unregistered.

**Executed tiny reproduction:** one invented DEV semantic query, one dataset with grade3, and one otherwise valid run labeled `topk10diag` produces:

```text
ValueError: unregistered development system
```

**Required boundary:** one explicit source-bound mapping for this registered diagnostic pair, retaining original labels/request hashes. No generic permissive aliasing or accidental eighth promotional candidate. Missing topk remains missing mandatory diagnostic evidence. Topk must never become a primary candidate.

## Checks that did not reveal a formula bug

The reviewed code correctly reuses existing scoring, preserves sparse original ranks, uses full same-level qrels for IDCG and useful Recall denominator, nulls graded point metrics when any corpus qrel is U (including an unreturned U), excludes negative/ambiguity queries from positive metrics, compares **every** exact target, counts new grade0 IDs by set difference rather than net counts, distinguishes keyword-eligible rank promotion from full-hybrid admission, checks the same root/nested evidence-bearing scope for opportunity quotas, and computes growth guards on candidate-minus-baseline treatment changes. These are code observations, not actual-data validation or evidence that a candidate passes.

Legacy reporting retains original-validation-failed/full-primary-unavailable labels and full-population null means; the original 12U source-identity proof still needs finding 2 fixed. No held-best selection is implemented in `decide`; the issue is the insufficient proof of its input DEV record.

## Validation performed

Ran only pure offline tests:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s search-relevance-eval/threshold -p test_analyze.py -v
```

**35 tests passed**, exit code 0. Additional in-memory invented reproductions described above all completed with exit code 0. Their success demonstrates coverage gaps in the existing green suite; it is not a claim of benchmark success. No dependencies were installed, production code was changed, or target metadata generated.

## Required handoff state

Keep actual analysis unreleased until the implementation owner fixes and parent independently verifies the prerequisite/policy boundaries. For the separately authorized nonpromotional workflow, register forced-D/no-promotion before the first actual score/embedding event as required by parent; keep original frozen strict gates intact and report nonconformance/U truth without invented passes. This review does not authorize retrieval, actual analysis, deployment, a positive validation status, or any A/B/C claim.

---

## Revision 2 — independent recheck of implementation fixes

Rechecked current source on 2026-11-08 (Australia/Sydney). The baseline findings above are preserved; this section updates their disposition, not the historical source snapshot.

- [Analyzer](<search-relevance-eval/threshold/analyze.py>) SHA-256: `80114c2df05fbc8363a329e91c4d2a22471090ef0aebe792fe8e08973615ed5e`.
- [Tests](<search-relevance-eval/threshold/test_analyze.py>) SHA-256: `8d153ebca99721a9c2865817868bd06f83b3b701266a5503f79d771790afafe8`.
- **42 pure offline tests passed**, exit code 0, using the same bytecode-disabled command above. Independent tiny adversarial checks also completed with exit code 0. No actual corpora, reviews, qrel outcomes, vectors, ranks, native measurements or model outputs were inspected.

### Disposition of the seven original findings

| Finding | Current code disposition |
|---|---|
| 1 — forced-D policy ignored | **Fixed for explicit diagnostic-policy mode.** [Report construction:1112–1114](<search-relevance-eval/threshold/analyze.py#L1112-L1114>) unconditionally adds a forced-D prerequisite problem whenever `diagnostic_policy` is supplied. [Returned status:1166–1170](<search-relevance-eval/threshold/analyze.py#L1166-L1170>) explicitly preserves original conformance failure and `promotion_allowed:false`. No other passing checks can override this D. |
| 2 — disconnected source/payload proofs | **Implemented fix verified by source inspection and invented-source tests.** [Actual source binding:413–454](<search-relevance-eval/threshold/analyze.py#L413-L454>) rereads bytes and compares independently loaded typed JSON/JSONL objects with analysis arguments; [loader:1321–1351](<search-relevance-eval/threshold/analyze.py#L1321-L1351>) rejects conflicting embedded payloads. [Pinned legacy proof:1201–1253](<search-relevance-eval/threshold/analyze.py#L1201-L1253>) now checks the fixed binding hash, original query/qrel/U-mask identities, full original corpus bytes and referenced validation sources. **The actual legacy-source traversal was not executed in this code-only review**, because it reads actual corpora/outcomes. This is not a claim that current runtime artifacts passed that traversal. |
| 3 — insufficient DEV proof/chronology | **Partially fixed.** [Selection verifier:899–915](<search-relevance-eval/threshold/analyze.py#L899-L915>) now requires a source-bound full DEV bundle, replays the selector and compares the complete resulting record. The original two-checkbox forged record is rejected. Explicit [nonpromotional NONE records:981–992](<search-relevance-eval/threshold/analyze.py#L981-L992>) make no candidate-pass claim. However, [chronology:927–933](<search-relevance-eval/threshold/analyze.py#L927-L933>) still relies on caller-declared held timestamps/digest, not an independently consumed event ledger, and does not inspect legacy event ordering. |
| 4 — omitted DEV exact controls | **Fixed.** [Inventory:776–791](<search-relevance-eval/threshold/analyze.py#L776-L791>) checks actual frozen query fields/IDs, all exact clusters and DEV13 including three critical exact queries. The original zero-exact reproduction now reports the required DEV inventory failure. |
| 5 — absent mixed/surface diagnostics | **Partially fixed.** [Mixed-grid checks:1136–1142](<search-relevance-eval/threshold/analyze.py#L1136-L1142>) now require both mixed-axis run/receipt grids. [Receipt checks:1009–1014](<search-relevance-eval/threshold/analyze.py#L1009-L1014>) reject absent root/aggregation/total/surface-signature fields, including previously missing empty results. Independent authorization/nested/facet/count/explain expected truth is still not consumed here; [correctness/surface gates:1121–1127](<search-relevance-eval/threshold/analyze.py#L1121-L1127>) still rely on booleans. Presence of a syntactically complete receipt is not an independently proven safety pass. |
| 6 — absent native child/membership closure | **Fixed for the reported omission.** [Native inventory:588–614](<search-relevance-eval/threshold/analyze.py#L588-L614>) requires expected authorized child identities/offsets, root/child projection hashes and dimensions, with non-null scores. [Membership completeness:628–632](<search-relevance-eval/threshold/analyze.py#L628-L632>) requires explicit root and nested actual membership sets. The original missing-child reproduction now fails availability. Actual inventory correctness remains an independently supplied artifact obligation. |
| 7 — topk label mismatch | **Fixed.** [Explicit conversion:121–134](<search-relevance-eval/threshold/analyze.py#L121-L134>) permits only `topk10diag` → `topk10`, retains raw/canonical payload digests and rejects collisions/arbitrary aliases. Nonempty mapping arguments are subject to actual typed-source payload verification. The independent conversion check returns `topk10`. |

### Remaining strict-path limits — concrete, not new-scope requests

Two residual parts of the original findings remain relevant to **future strict A/B/C certification**, not to overriding current forced D:

1. **Chronology is not independently reconstructed by this analyzer.** An actual-file-bound nonpromotional NONE record with declared held time03:00, record time02:00 and `first_legacy_event_utc:01:00` still produces `_selection_problems(...) == []`. The earlier legacy event is ignored. Parent must independently establish actual policy-before-first-embedding and immutable NONE-after-DEV/before-any-held-or-legacy event ordering from source-bound releases and request ledgers. This review has not inspected those operational artifacts.
2. **Structured receipt envelopes are not expected safety truth.** Eleven invented receipts containing hits, empty aggregations, total hits and matching root signatures pass `receipt_problems` without any independently expected authorization/count/nested/explain truth. This demonstrates the remaining original correctness/surface-proof limit, not a claim of any actual leak. Future strict promotion must not be authorized solely by the remaining boolean flags.

Parent reports it will supply actual source-bound release/phase ordering, immutable policy/NONE files, real-engine structured control evidence and artifact-hash approval outside this review. Those are parent-provided obligations, **not independently verified runtime results in this document**. No additional rewrite or trial scope is requested here.

### Current review gate

**Reviewed-ready for the explicitly supplied, separately approved nonpromotional forced-D analysis path only**, subject to parent independently verifying actual pre-embedding policy and execution/release ordering. No new P0/P1 allowing promotion within that explicit diagnostic-policy path was found in this recheck. The original frozen strict A/B/C path is **not fully certified**: findings 3 and 5 remain partial as documented above. Neither the green pure-test suite nor this code review is a validation pass, backend-execution authorization, actual-result audit, or permission to recommend a default threshold change.

