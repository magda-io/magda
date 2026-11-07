# Threshold-only exporter contract (#3887)

## API and boundary

The existing [Scala exporter](<../scala/ExportBaselineRequests.scala>) accepts optional `--min-score SCORE`, requiring a finite `0 < SCORE <= 1`. It is mutually exclusive with existing `--k N`. There is no `--max-distance` CLI option. Neither option is required: omission retains the original production configuration and request construction exactly.

An explicit `--min-score` supplies `hybridSearch.minScore` and null-masks fallback `hybridSearch.k` / `hybridSearch.maxDistance`, including values supplied through `--config` or AppConfig. This matters because the unchanged production serializer prioritizes `k`, then `maxDistance`, then `minScore`. All settings are evaluation-local. The production builder still emits every root/nested/facet query and decides its filter placement; no DSL construction, replacement, normalization, pipeline mutation or boost stripping is added.

`--keyword-only true` is a separate actual-builder attribution diagnostic, mutually exclusive with `--min-score` and `--k`; any value other than literal `true` is rejected. The same frozen input vector is still validated, then deliberately ignored by setting evaluation `Query.freeTextVector=None` and `hybridSearch=false`. **HybridSearchConfig.enabled stays true** so production SimpleStringQuery operators remain OR, not AND. The actual production builder retains its lexical dataset/distribution dis_max, quality functions, inner hits, filters, aggregations and pipeline parameter. Only flagged output adds `diagnostic_mode: "keyword_only_attribution"`; absent-flag output/provenance fields stay unchanged. It is not a primary threshold arm and is not the old replay `experimental(keyword)` transform.

Existing `--regions-index` remains an optional owned correctness-fixture override, with no HTTP augmentation. Dataset kNN boost remains 50; nested kNN boost remains absent (implicit 1). Top-k remains diagnostic (`--k 10` for this study), uses production inline prefilters, and emits neither `min_score` nor `max_distance`. A historical k=1 fixture's mismatch against radial exact-set expectations is not proof that top-k/radial is unsupported.

## Offline contract API

[export_contract.py](<export_contract.py>) never executes an exporter or accesses a service:

- `validate_request(request, min_score=0.5)` checks the complete exported request envelope and raw main-query function-score placement, root/nested hybrid families, all six kNN payloads across the main query and both facet aggregation copies, same-scope radial filters, public tenant/publishing-state eligibility, production legacy-published distribution handling, root boost 50, unchanged implicit nested boost and identical vectors across copies.
- `validate_request(request, k=10)` checks the diagnostic mode, exclusive k fields and production inline eligibility filters, including child publishing/legacy eligibility within the nested scope.
- `threshold_pair(reference, candidate, 0.5, other)` compares **the entire request**, permitting only numeric `min_score` changes at the six actual kNN payload paths. Array order, boosts, filters, query vectors, function-score placement/parameters, aggregations, HTTP method/path and query parameters (including pipeline) cannot change. Exporter `config_sha` is intentionally outside this request comparison: changing the effective config must change its provenance hash.
- `role_threshold_pair(reference, candidate, reference_score=0.5, dataset_min_score=0.45, distribution_min_score=0.5)` is a **diagnostic-only checker**, not a request constructor. It accepts only the frozen role pairs `(0.50,0.50)`, `(0.45,0.45)`, `(0.45,0.50)` and `(0.50,0.45)`, requiring the uniform .50 production reference. Every candidate root/nested/facet numeric threshold must match its intended role; all remaining complete-request bytes/structure/params must remain identical. Primary uniform validators are unchanged and still reject mixed cutoffs. This adds no target-freeze/execution authorization and performs no literal patch itself.
- `validate_keyword_exports(rows, baseline_commit=...)` separately requires attribution metadata and no kNN/hybrid/normalization/post-filter rewrite. It checks nine OR SimpleStringQueries across the main/facet copies, original quality-function placement, root/distribution lexical dis_max branches, parent/child public eligibility including legacy publishing state, and inner-hit projections remaining in query scope. Default baseline is the full pinned revision. Primary export/set validators explicitly reject these attribution-control rows.
- `validate_exports(rows, min_score=..., baseline_commit=...)` checks unique IDs, the baseline label and each request. Default baseline label is the full pinned `ba18156201c50565c85c62f76469245925994ece`; historical smoke fixtures use the short label explicitly.
- `validate_request_sets(request_sets, config_paths=None)` is the runner hook over loaded label-to-row-list mappings. It accepts only `ms_050/048/046/045/044/042/040/topk10diag`, requires the .50 reference plus at least one comparison, and checks identical unique nonempty query-ID sets. All radial arms are paired by ID against .50; the diagnostic is checked separately, never against a radial-only diff oracle. The higher study adapter enforces all eight arms. Optional label-to-config-path mappings must cover exactly the same labels and bind each config hash to every row; radial mode requires the intended minScore with absent/null k and maxDistance. Diagnostic config requires k10; legacy fallback radial config may remain ignored, but no radial field may appear in its DSL. The return value is a JSON-safe provenance report containing counts, complete-request/export/config hashes and radial-only diff totals.

Structural assertions alone do not prove source provenance. Use the existing source-manifest gate as well; a caller-provided `--baseline-commit` remains only a label.

```sh
python3 -m unittest discover -s search-relevance-eval/threshold -p test_export_contract.py -v
python3 search-relevance-eval/threshold/export_contract.py \
  --requests search-relevance-eval/scala/smoke/baseline.jsonl \
  --min-score 0.5 --baseline-commit ba181562
```

After separate execution authorization, actual threshold exports can be checked with `--requests CANDIDATE --min-score SCORE --reference DEFAULT --reference-min-score 0.5`. This contract does not grant that authorization.

## Verification performed before target freeze

- Existing [sbt wrapper](</tmp/magda-3886-tools/bin/sbt>) inspected: sbt 1.4.9, Eclipse Adoptium Java 11.0.32.1, wrapper-local caches. The wrapper directly invokes the sbt launcher; sbt-extras `--script-version` is not a supported command.
- `searchApi/Test/compile` succeeds with the existing transient evaluation-source setting.
- Ten actual JVM CLI rejection checks pass before opening any input/output or constructing requests: NaN, positive/negative infinity, zero, negative, above-one, overflowing exponent, min-score+k conflict, duplicate min-score and unknown max-distance option.
- Nineteen offline contract tests pass, including the frozen-label runner API, bound-config checks, isolated four-pair role diagnostic checker and separate actual-builder OR attribution contract; the existing eight replay and thirty synthetic execute offline regression tests also pass. Alternate thresholds/top-k bodies are explicitly adversarial **unit mutations of existing smoke exports**, not claimed Scala export/engine evidence or newly generated target fixtures.
- Five additional actual JVM keyword CLI rejection checks pass before any input: `false`, `TRUE`, `1`, keyword+min-score and keyword+k.
- Only the two existing dimension-3 [smoke tasks](<../scala/smoke/tasks.jsonl>) were freshly exported, with default mode and the separate keyword-only mode, the original `eval-smoke-datasets` index and no region endpoint. No embeddings, new benchmark queries/vectors, engine `_search`/`_analyze`, forwards, index/pipeline writes or target fixture generation were used.
- Fresh smoke complete requests and bodies have identical canonical JSON bytes to the checked-in baseline; mapping-file bytes and safe elasticSearch configuration also match. Full config hashes differ with the environment, as already documented by the exporter.
- Canonical complete-request SHA-256: unfiltered `df575ff74ff8d4234711b8f7d4ed60d702eae3856fa8547ee7ae857a3271ff79`; filtered `aa859a0e3f6576c305d7117db0f07f74f1aeae607d74163d78256c3b9e18513e`.
- After adding keyword-only mode, default smoke request parity was repeated successfully. Existing-vector keyword exports pass `validate_keyword_exports`; effective hybrid config stays enabled, with identical full config hash and request params to default. Keyword request SHA-256: unfiltered `b46014791a1e3144c7911a1c5a529b3a32d40082137a997bc0af75f58a661412`; filtered `c5e70c4803b5d1c9a95fceaee6819a2ad835923de03d0acae4405f1993090aa6`.
- Fresh temporary artifacts: `/tmp/magda-3887-export-parity.i4ic1F/` and `/tmp/magda-3887-keyword-smoke.lE9Bwi/` (not benchmark evidence). All eight files in the existing [production source manifest](<../synthetic/production-baseline-source.json>) still match its pinned SHA-256 values. Production source/common.conf are unchanged.

Actual alternate-threshold and k10 Scala exports, engine acceptance/retrieval and any new toy/target fixtures remain deferred to the parent's target-freeze authorization.
