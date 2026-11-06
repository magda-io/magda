# Engine/replay preparation — issue #3903

Evaluation-only adapter; no production ranking source changes. Stacked on PR #3902, framework base `15533246b7679752cddbb82ccf702557842fe32f`; production baseline is `ba18156201c50565c85c62f76469245925994ece` (after #3900).

## Preparation receipt (not a retrieval or validation result)

```json
{
  "phase": "pre_freeze_preparation_only",
  "inspected_on_local_date": "2026-11-06 Australia/Sydney",
  "opensearch_version": "2.19.1",
  "opensearch_build": "2e4741fb45d1b150aaeeadf66d41445b23ff5982",
  "opensearch_lucene": "9.12.1",
  "required_plugins_present": ["opensearch-knn", "opensearch-neural-search"],
  "embedding_pod_image_digest": "sha256:7faca54ae24ce1c03d4213d3a3c2109ff57b23c644e4d22523e1c861201fb6ec",
  "embedding_image": "ghcr.io/magda-io/magda-embedding-api:1.1.0",
  "expected_model": "Alibaba-NLP/gte-base-en-v1.5, 768 dimensions, q8",
  "exporter_test_compile": "passed, sbt 1.4.9, Java 11.0.32.1",
  "benchmark_datasets_generated_by_engine_role": 0,
  "benchmark_embeddings_requested": 0,
  "searches_executed": 0,
  "analyzer_token_requests_executed": 0,
  "independent_label_validation": "not yet received",
  "execution_approval": "not yet received"
}
```

Inspection used only Kubernetes/container metadata, OpenSearch root/version/plugins, index-name listing and existing mapping/settings GETs. Mapping requests for guessed `datasets54` and alias `datasets` returned 404; the discovered **existing** local corpus is `datasets52`. It is **not** this benchmark's index and will not be mutated. Latest production mapping comes from the existing Scala exporter, not from copying that old index. No `_search`, `_analyze`, data generation or embedding call was used in preparation.

The existing local mapping confirms why literal identifier expectations cannot presume equality matching: title/keywords use `english`; description indexes with `english_with_synonym_strip_html` and searches with `english_without_synonym_for_search`. Title `.quote` uses a lowercase keyword tokenizer; description `.quote` uses lowercase standard tokenization. WordNet is configured at `analysis/wn_s.pl`. This metadata inspection does **not** substitute for post-gate `_analyze` evidence on the actual new production-mapped owned index.

Managed forwards started by the engine role (parent must collect/stop before final completion):

- OpenSearch loopback `http://127.0.0.1:19200`: job `bash-f69100b9acfa402f`.
- Existing pinned embedding service loopback `http://127.0.0.1:13000`: job `bash-eca1555dbc6a4d9d`.
- Existing exporter compilation job `bash-2547933f383347fc`: collected, exit 0.

Do not prune Docker, restart the existing user cluster, invoke production/public catalogue writes or run ServiceRunner against its global Docker daemon. No replacement server/image is necessary. Shared local cluster latency is descriptive, not an SLA or an isolated-machine benchmark.

## Adapter boundary

[execute.py](execute.py) imports [the existing replay harness](../run.py) and [the shared freeze verifier](freeze.py); it does not implement a new search/metric framework. Corpus/query/label generation and independent label validation belong to other roles. All operational commands require three hash-bound inputs: spec freeze, independent validation manifest and explicit parent approval. Every referenced corpus and qrels file is rehashed before execution. Frozen spec paths resolve relative to the freeze; validation corpus/qrels paths resolve relative to the validation manifest.

Preparation delegates to `run.prepare` for **all three seeds** before any latency execution. A preparation receipt binds embedded artifacts to the freeze/validation. The replay command rechecks every seed's artifacts before touching the engine, invokes the unchanged Scala production query exporter, creates only owned disposable indexes using its production mapping, and delegates ranking/interleaved latency to `run.run`. All systems share each seed's single joint180 corpus/index/vectors. The primary export uses production radial `minScore`; no inline radial-to-top-k JSON patch is allowed. Geographic augmentation is explicitly disabled in exporter metadata (no region-index search); synthetic geography is not a relevance or authorization claim.

The coordinated parent-harness extension preserves #3902's default seven configurations. Explicit `--systems` accepts only fixed registered names (CSV or JSON list), with `raw_boost1` available only by opt-in. It deep-copies raw production DSL and removes **only** `boost` within exact `knn.queryContextVector` payloads, including aggregation copies; `distributions.queryContextVector`, raw hybrid nesting, functions, filters and ineffective pipeline semantics remain intact. Unknown systems/weights fail closed.

Normalized candidates remain the existing experimental transformations: score functions act within each family before normalization; inner-hit projection moves to the optional post-filter; facets use ordinary boolean eligibility unions. These are disclosed structural differences, not a production scoring proposal or guaranteed equivalence. Compare baseline vs keep50 for matched boost50 and raw_boost1 vs primary for matched boost1.

The optional `--raw-output` ledger is exclusive-create and incremental: one row per warmup and measured request, request hash, parsed-response hash, every hit ID/rank/score, total hits, facet bucket/count projection, timeout/shard metadata, elapsed milliseconds, seed and explicit `latency_scope=local_warmed`. It omits facet top-hit sources/vectors. Errors and failed warmups are persisted before aborting. Every query/system has one excluded warmup and five measured repetitions, interleaved deterministically rather than blocks. Existing final run output/requests and raw repetition receipts are both retained; no rank/label tuning occurs after retrieval.

## Offline checks

```sh
python3 -m unittest discover -s search-relevance-eval/synthetic -p 'test_execute.py' -v
python3 -m unittest discover -s search-relevance-eval -p 'test_run.py' -v
```

Preparation regression result: full default discovery passed **163 offline tests**, including12 engine adapter tests, the existing replay/verification tests and other completed synthetic modules. Mocked responses only; no real relevance query, corpus or embedding fixture generated by these tests. Full default discovery is integrated by the main role's synthetic test loader/package.

## Gate-dependent evidence still required

- Main's actual freeze plus independent all-seed answerability/label validation and explicit execution approval.
- All3 real corpus/query vector preparations completed before latency; retain pinned model identity/cache namespace and dimension evidence.
- Existing real-engine synthetic visibility/tenant/publishing/projection/facet/normalization controls reused from [verify.py](../verify.py). The synthetic wrapper temporarily opts in `raw_boost1` for eligibility and both format cases, yielding the existing20 plus3 additional controls, then restores module globals even on failure. These translate a synthetic owner predicate and **are not real OPA**; retain the existing Scala26 and service authorization regression evidence separately.
- Exact identifier `_analyze` token outputs using actual production-mapped fields; do not invent a new exact field.
- Secondary top-k correctness feasibility from actual exporter `--k 1` and control fixtures, with any limitations/failures disclosed (not hand-patched radial filters).
- Primary all8 ranked systems on each frozen seed, complete raw repetition ledgers and analyst's reused metric reporting. No benchmark result or recommendation is claimed by this preparation note.

## Supplementary quality/spatial correctness preparation

Main explicitly approved an evaluation-only extension to [the existing Scala exporter](../scala/ExportBaselineRequests.scala): optional `--regions-index` overrides only the region index with a validated owned name; input `boost_regions` strings are parsed through the actual production region parser and supplied as `Query.boostRegions`. Without these optional inputs, production request bodies are unchanged. Explicit fixtures prohibit HTTP augmentation and are labeled `explicit-owned-correctness-fixture`; ordinary exports keep their previous metadata values. No production source or primary benchmark query/label is changed.

The extended exporter compiled successfully. Both existing smoke tasks were exported without any engine connection. Canonical request-body bytes equal the previous fixtures: unfiltered SHA256 `ae9064aef5e0d0f3f89e0f9ec945de5d135ec548802be334191c1de015df6e0d`; filtered `c8d674f277cfbfdb9e619f14912776467264cf7a3ec46a980b74c5859ae6c40a`. Query parameters and HTTP methods match; endpoint names differ only because the parity invocation supplied a different dataset index, and the full effective-config SHA differs by environment. This is request-body parity, not a claim that the entire provenance JSONL is byte-identical.

[The supplementary fixed specification](quality-spatial-probe-spec.json) concretizes the already registered correctness-only quality/generic-spatial probe before its execution. It uses six otherwise identical fixture records (quality0.25/0.6/1 crossed with inside/outside a fixed envelope), deterministic dimension3 vectors, two fixed variants of the existing `water quality` control query, and actual production preindexed geometry referencing only an owned temporary region index. Production region IDs use `ste/3903`, not an invented underscore separator.

`quality-spatial-probe` requires all original validation/approval checks **plus** `approval.supplementary_probe_spec_sha256` binding that specification. It retains actual exported/executed requests, fixture/mapping/config hashes, all16 response receipts and exact cleanup evidence. Raw quality ratios are tested within geography cohorts: the production geographic path adds matching clauses as well as a region score function, so equal unmultiplied inside/outside scores are not presumed. Boost1 normalized predictions use the keyword/vector controls with the existing OpenSearch0.001 normalized-score floor, already evidenced by the prior control's0.9001/0.1009 outputs. Keep50 is not falsely predicted from the unboosted vector control. These are fixed arithmetic controls, not new relevance metrics.

Engine adapter suite after model hardening: **21 offline tests passed**, including full mocked16-response/eight-resource cleanup, failed partial-install persistence and model mismatch rejection. Main fixed the separate generator import-path collision; **full default discovery passed215 tests** at this handoff. The engine role has run no live supplementary probe, benchmark embedding, relevance search or `_analyze`. Main separately owns live preexisting correctness/service jobs and the new OpenSearch forward; those are not represented by this role-only statement. Earlier engine-role port-forward jobs ended when the delegated runtime became inactive.

Top-k `--k1` can legitimately return a smaller eligible result set than radial mode. If the reused radial fixture's exact-set assertions fail, preserve and diagnose that as an assertion mismatch/candidate-pool effect, **not automatically as OpenSearch top-k being unsupported**. Actual #3900 top-k authorization fixtures remain separate evidence.

## Metadata-only model identity verification

Before any benchmark embedding request, the engine role inspected the existing local pinned pod's metadata and deployed nonsecret software. The observed image is `ghcr.io/magda-io/magda-embedding-api:1.1.0`, imageID digest `sha256:7faca54ae24ce1c03d4213d3a3c2109ff57b23c644e4d22523e1c861201fb6ec`. Only environment **names** were requested: FASTIFY transport/logging keys, no model override or ConfigMap reference. No secret environment values were read. The startup command specifies min/max workers1, task timeout60000ms and an application-config path; safely projecting its top-level key names returned an empty list, so there is no model configuration override.

The deployed worker constructs `new EmbeddingEncoder()` without options. Its software default is `Alibaba-NLP/gte-base-en-v1.5`, `max_length:1024`, inference dtype`q8`, CLS pooling, normalized output, no output-vector quantization. Cached model metadata reports hidden size768 and capacity8192 positions; the **runtime tokenizer cap remains1024**, not8192. The cached ONNX filename is `model_quantized.onnx`. The embedding route accepts an explicit supported model name, passes it to the worker and returns the selected name in `response.model`. These observations involved no embedding/scoring HTTP request, model import or inference.

The optional `run.embed_texts(..., expected_model=None)` assertion preserves the old default request when absent. Synthetic preparation supplies the frozen `generation.embedding.model`, sends it explicitly and rejects a missing/different response model **before writing any batch cache file**. A dedicated cache identity also binds the frozen model and image; an unidentified nonempty cache is rejected. Offline tests verify model mismatch/missing rejection, unchanged legacy requests, matching vector values and cached replay.

Nonsecret deployed module copies are retained privately under [.local/model-metadata-20261106](.local/model-metadata-20261106/EmbeddingEncoder.js), not bundled into searchable records. Their SHA256 receipts:

| Module | SHA256 |
| --- | --- |
| EmbeddingEncoder | `b16a7d65d5fe424a7722a1ff2ad1358995076274e27bd2e265dd1cbfbaca033d` |
| encoderWorker | `77a2cd112f9b34fa450b6dcf3c01da3f723f06d5a701b4d1746e5af8f3e9d3d5` |
| embeddings route | `21306d54eb87054e4729401047f197f93dfce0f6fbd171e407a3a4ea05fbc23a` |
| setupEmbeddingEncoderWorker | `eb11db078a7facbbdae7ba1e2b4972c9679e444a1c5bcc9d3bac04a7e3c29aaf` |
| loadAppConfig | `66cb143487d24b359bcf5db7685039439489c5d3a91126f69b2a5357e845a6a2` |

Model repository revision is still not independently verified; do not invent it. Image identity, observed runtime defaults, model-name response checks and retained vector hashes establish this controlled local configuration, not equivalence to public catalogue vectors.

## Pinned production-source guard

Synthetic execution additionally requires `approval.production_source_manifest_sha256` binding the parent's `production-baseline-source.json` beside the freeze. The manifest must state full baseline `ba18156201c50565c85c62f76469245925994ece` and a nonempty `sha256` map of repository-relative production builder/parser/mapping/config source paths. Main verifies those source hashes against pinned Git blobs when creating the manifest. On **every** synthetic execution gate, the adapter checks the manifest hash and actual checked-out file bytes with document-root/repository containment checks, before any network/subprocess activity. The guard is offline: it does not run Git, does not replace the shared framework's freeze verifier, and leaves #3902's default exporter unchanged. Rebase/source drift therefore fails rather than merely retaining a caller-supplied baseline label.

Source-guard tests reject missing approval binding, empty/wrong-baseline manifests, manifest tampering and actual-source byte changes. After this hardening,23 engine adapter tests and220 full default offline tests passed. No result or control pass is inferred from source provenance alone.

## Explicit supplementary diagnostic mode after failed full validation

Main subsequently recorded a **pre-retrieval failure of confirmatory ground-truth validation**: a proposed `s08` hard negative has a defensible interpretation under the frozen broad query/criteria. The frozen query, criteria, proposed numeric qrels and corpus claims are not repaired to force the intended grade. No strict `status:passed` validation document is fabricated. This is not evidence that any search system won or lost.

Per [the canonical diagnostic contract](diagnostic-contract.json), the adapter now has a **separate** `diagnostic_gate`, not a relaxed strict gate. The default still requires independent passed/full coverage and answerability. Supplementary execution requires both explicit CLI switches, before the subcommand:

```sh
--diagnostic-policy /PATH/TO/diagnostic-execution-policy.json \
--allow-incomplete-diagnostic-replay
```

The diagnostic document must truthfully say `incomplete_diagnostic_only`, `full_validation_passed:false`, `promotion_allowed:false`, `forced_recommendation:C`, independent pre-retrieval review, all540 manual record reviews and75 query-equivalence reviews, and independently established known-pair agreement. The parent approval separately binds this document, policy, pinned production source manifest and supplementary probe specification. The policy binds freeze/document/mask, records UTC `created_utc` and `no_outcomes_seen:true`, and permanently forbids A/B/promotion. Neither flag alone selects the diagnostic gate; there is no automatic fallback if strict validation fails.

Shared artifact checks rehash the original freeze, proposed qrels, query text, actual corpus IDs/bytes, evidence and all frozen model/system/execution settings. Separately, all40500 seed/query/document validated qrels must be complete: every numeric grade must equal the frozen design matrix; literal `U` must equal **exactly** the uncertainty-mask expansion from each seed/intent/document across all its paraphrases. Duplicates, missing pairs, unsupported known mismatches, unexplained U, U coerced to0 and changed proposed qrels fail. The adapter does not infer uncertain cases or derive independent grades; C alone supplies the hash-bound evidence/mask.

Preparation receipts carry `diagnostic_only:true`, `promotion_allowed:false`, forcedC and policy/document/mask/validated-qrels hashes. Shared replay retains its existing ranked outputs and records the same identity in the artifact root's execution-identity sidecar; preparation/replay mode or mask changes fail. Control/analyzer outputs have identity sidecars, and the supplementary quality/spatial report carries the same explicit flags. These correctness passes, if later run, cannot restore confirmatory promotion eligibility. Unknowns are never converted to0 by this adapter; their metric treatment belongs to the explicitly diagnostic analysis with full-IDCG uncertainty handling.

After this addition, **30 engine adapter tests and240 full default offline tests passed**. All checks here used mocked or tiny arithmetic fixtures; the engine role has not performed any live diagnostic embeddings, retrieval, analyzer calls or supplementary probes. Actual diagnostic execution still requires C's completed truthful document/mask plus the parent's finalized hash-bound policy/approval.
