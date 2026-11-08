# Offline diagnostic reproduction

From the repository root:

```sh
python3 -B search-relevance-eval/threshold/reproduce.py --diagnostic-only --validate-only
python3 -B -m unittest discover -s search-relevance-eval/threshold -p test_reproduce.py -v
```

Both flags are mandatory. No flags, either flag alone, execution options, and
`--verify-execution` are rejected. This driver has no retrieval/execution mode,
network calls, subprocess calls, service startup, model calls, vector exports,
resweeps, new manual judgments, or new label-assignment rules.

## What is reproduced

1. Before dynamically loading code, verify the literal locked SHA256s of the
   original registration/checker, C's two validators, both diagnostic validation
   receipts, historical generation closure, parent expansion approval, archive
   receipt/archive, and the existing legacy reproduction helper. Call the
   original `freeze.verify` to verify the exact seven preregistered files and
   independent structural preflight. Neither the freeze nor strict failure is
   rewritten.
2. Reuse `synthetic.reproduce.restore_review_sources(root)` unchanged. Its
   existing safe/exclusive extractor verifies the archive SHA, exact member set,
   regular-file paths, each member's size/SHA, and any existing target bytes.
   Missing exact historical inputs are restored; altered existing inputs cause
   failure, not overwrite. Repeated restoration is idempotent. The public archive
   SHA256 is
   `ebc7da24576106a7bbe514877413259a03106b0e92d9d2de16e6e1af69a21e93`
   (49 members; 4,054,478 compressed bytes).
3. Call C's locked pure
   `diagnostic_expansion.validate_diagnostic_expansion(root, manifest, stage)`.
   This itself calls `validate_diagnostic_stage_one` using the original stage's
   `reproduction_inputs`, comparing the **entire** repeated stage dictionary with
   the registered receipt. It then checks all expanded raw metadata, source
   receipts, accepted-terminal reconstructions, literal evidence, original
   observations, scoped uncertainty and parent expansion bindings. B's expansion
   or generation code is not imported or invoked by the threshold driver.
4. Stream every returned qrel/evidence row through C's exact canonical JSONL
   serialization (`sort_keys=True`, compact separators, `ensure_ascii=False`,
   UTF-8 plus newline). Compare each byte with the original sidecar, reject
   trailing bytes, and check complete row counts/SHA256s. Compare the **entire**
   derived expansion manifest, including these sidecar references. No original
   validation manifest or sidecar is regenerated/overwritten on disk.
5. Invoke the existing eight-family legacy helper directly with explicit
   `main(["--diagnostic-only", "--validate-only"])`. Its established offline path
   restores/verifies its historical inputs, regenerates its own deterministic
   frozen fixtures, verifies complete independent evidence and diagnostic gate,
   preserves its primary NULL/nonpromotion handling and all 12 legacy U, and
   returns before any service/retrieval path. Its existing local reproduction
   generation receipt may be refreshed; no threshold outcome artifact is written.

The stage validator lock is
`abfc7d5a3264e5c02f4f30ee82a673bbe940a6d999aae5456983d82c68a225ae`;
the expansion validator lock is
`14ce0dcbe0a39e7f17dda284076f6701e0fdf08f65db5e4979e52f608c5bdef0`.
The registered diagnostic stage receipt is
`5a42a5e31eeec82489801e30ca8ed11201de7a727d033f58f622eedaad66f735`;
the registered expanded validation receipt is
`8c7ac3766bead6be33493fcaf49480cc66e2dd74333fe772fff6a44811384b29`.
These are external receipt constants, not hashes accepted from replacement
validator code. Missing stage files or any source-closure error propagate as
failures; none is downgraded to a warning.

## Historical versus execution source

The immutable first-realization receipt refers to the archived runtime source
`c25b310024eb2d03110c444e559a0cb7437bfd3cf7f2b2c5380145459934f457`
from commit `56aa147db`. C verifies that exact archived source and the separately
registered current runtime
`04b3732b36f8de1d0a0c2ee490b4d8932187a412c9ee436ee9ff25a999aa7d8f`,
including identical projection-function AST context, against the existing
historical source proof. Neither source is imported/executed by this closure
check. This narrow historical proof is **not** a waiver for arbitrary runtime
drift or an execution approval.

The offline command does not validate the later execution-inputs source closure,
prepare artifacts, live engine controls, rankings, vectors, or analyses. Separate
execution policy, approval and source gates remain required; a successful offline
reproduction must never be described as an authorized or completed sweep.

## Observed verification

The actual command above completed with exit 0, including C's complete real-source
reconstruction and the existing legacy offline validator. It reported:

| Population | Count |
| --- | ---: |
| Actual metadata rows, across all registered seed/size levels | 9,180 |
| Query/record/seed/size pairs | 459,000 |
| Known pairs | 440,619 |
| Exactly scoped U pairs, repeated across sizes | 21 |
| Intentional ambiguous/ungraded U pairs | 18,360 |
| Legacy U pairs, unchanged | 12 |

The result remains **forced D**, `actual_text_validation_passed=false`,
`original_strict_conformance_failed=true`, `promotion_allowed=false`,
`execution_authorized=false`, and `retrieval_performed=false`. Mechanical closure
is not 9,180 independent manual reviews or a strict fixture pass. Frozen original
nonconformance, false flags, semantic uncertainties, and metadata discrepancies
are retained, not repaired or reassessed.

All 17 focused unit tests passed. They use clearly toy, temporary-root mocked
validator results (not new scientific observations), exercising complete manifest
comparison, C error propagation, U tampering, missing stage receipts, every locked
input's drift, legacy failure propagation, explicit CLI modes, canonical byte/
count/SHA matching, and the unchanged extractor with a tiny 49-member archive.
Extractor adversaries include archive/member SHA drift, duplicate members,
traversal and symlinks. The real-source run above is separate from those mocks.
