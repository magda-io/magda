# #3887 — native minScore under unchanged production raw fusion

**Completed evaluation; recommendation D.** [Quantitative tables, case studies and SVGs](<search-relevance-eval/threshold/RESULTS.md>) report all seven cutoffs and diagnostic top-k. No production change is justified.

Evaluation PR: [#3913](https://github.com/magda-io/magda/pull/3913), stacked on [#3909](https://github.com/magda-io/magda/pull/3909) and [#3902](https://github.com/magda-io/magda/pull/3902).

## Decision fixed before new target inference

**D — inconclusive/nonpromotional engineering evidence. Do not change the production default on this study.** This conclusion is fixed independently of threshold outcomes: the original supplementary registration has a contradictory component-title identity requirement and independent review found seven scored query/document/seed uncertainties. No threshold can be selected for deployment, and no held-out winner or repaired oracle will be substituted.

The quantitative sweep still measures all seven uniform profiles (.50/.48/.46/.45/.44/.42/.40), with .45 the predeclared primary comparison, plus actual top-k10 as a diagnostic. Fixed dataset/distribution pairs (.50,.50),(.45,.45),(.45,.50),(.50,.45) are mechanistic diagnostics, not additional candidates. Matched pairs reuse the uniform captures.

## What is held constant

- Actual post3900 Scala production request builder and its eight pinned production source/configuration files; no production changes.
- Raw-score fusion, root-vector boost50, implicit child-vector boost1, keyword OR, analyzers, quality/spatial functions, eligibility filters, inner hits and facets. The radial profile changes only the six native min_score leaves across the main request and facet scopes.
- OpenSearch2.19.1; production v54 Faiss/HNSW L2 mapping with SQfp16 indexing. Embeddings use the existing GTE-base-en-v1.5/q8/CLS-normalized/max1024 pipeline and pinned1.1.0 image digest. The upstream model repository revision was not independently verified.
- Identical query vectors and shared record-scope vectors across catalogue sizes; all checked vectors have768 dimensions and norms within1e-5 of unity. Historical LEGACY and REAL vector files are reused byte-for-byte.
- Existing production normalization pipeline was invoked only for parity checks; its output matched raw bypass on all eight closed-fixture modes. No pipeline was installed or reweighted. Primary replay explicitly uses `_none`.

## Populations and what the counts mean

| Cohort | Cases | Interpretation |
|---|---:|---|
| NEW |3seeds ×60/1000/2000 records;50queries | Controlled catalogue-growth experiment;20 repeated growth archetypes, not thousands of independent topics |
| LEGACY |3seeds ×180records;75queries | Original labels unchanged:40,488known pairs and12U; original eight-family primary remains unavailable |
| REAL |494frozen public records;15queries | Limited positive coverage; unjudged is not irrelevant and exhaustive recall is unavailable |

NEW independent actual-text review used six fresh AI-agent contexts, not human annotation or independent model providers:180 actual core realizations plus60 full growth representatives. C then independently reconstructed every one of9,180 catalogue-level rows, including8,640 growth-row occurrences, from the reviewed whole-field bundles and typed neutral substitutions. This is not9,180 manual judgments. The nine populations contain459,000 query/document pairs:440,619known,21scored U after size replication,18,360intentional ambiguity U. Growth includes grade1 partial matches; it is never blanket-labelled0.

The seven scored core uncertainties are four internal-temperature qualifier pairs (seeds38871/38872, t03p3, t013/t014) and three measurement-distance negation pairs (seed38873, t045, t08p1–p3). Independently supported intervals are2–3 and1–2 respectively. Known paraphrases remain known; uncertainty is not copied across seeds or coerced to0. Full-corpus IDCG and recall are recomputed under shared case assignments in sensitivity analyses.

Full six-family NEW held-out point means are unavailable where U applies. Per-seed known-five populations differ, so they are not a matched cross-seed cohort. The prespecified common-four descriptive population is t04/t05/t06/t07; it is not a replacement primary. All18held-out semantic queries and all six-family sensitivities remain reported. The separate LEGACY14-family known population is descriptive (11semantic plus3functional across both splits), never evidence that the old full primary passed.

## Operational and numerical checks

The standard closed fixture passed32 mandatory mode/control checks, four k1 positive/negative responses and eight actual existing-pipeline/raw parity comparisons. The26 unchanged Scala tests passed:15structural and11real-engine. These are not a new full OPA sweep; the translated owner predicates and historical OPA coverage are explicitly scoped.

A separate fixed geometry matrix retained **two failed inclusive-boundary expectations**: both root and child radial.50 excluded a vector whose unboosted script score was exactly.50. Every tested interior admission matched at all seven cutoffs and both scopes. All14radial responses plus two all-nine-vector native calibration responses are preserved. An implementation cause was not independently established. Nominal mathematical score thresholds, exact stored-vector geometry, SQfp16/Faiss scores, approximate membership and final boosted hybrid ranks are distinct.

Installation initially rejected OpenSearch's mapping API representation (redundant object types omitted, and ordinary dynamic mappings for existing unused metadata). A separately approved, pre-retrieval observation-guard repair verified exact source metadata/vectors and permitted only enumerated, source-typed, unqueried fields; no mapping request, document, embedding or query was changed. Original failures and subsequent null-aware guard correction are retained. All13indices were installed before measurements; no indexing/embedding is included in latency windows.

## Chronology and measurements

The original registration was publicly pushed before first generation. The forced-D policy, complete actual-label evidence and source-hashed execution release were publicly pushed before new target inference. DEV13 was captured first at all nine NEW indices. An immutable policy-bound NONE decision was publicly pushed before any held-out/legacy retrieval or native/keyword diagnostic. NONE is not a claim that a safer threshold passed or failed DEV selection gates.

Every profile uses one excluded warmup plus10 measured repetitions per query/seed/size, deterministic interleaving, concurrency1 and fixed index state. Client elapsed and engine took remain separate. Registered p95 guards require at least100 observations; the held-out exact group has90 and is descriptive only. Local warmed timing is not production latency, and repetitions, paraphrases, seeds and cloned templates are correlated.

## Quantitative results

All 70,620 primary/mixed timed requests and all post-latency diagnostics completed. Native geometry contains 440,640 parent pairs and 876,096 authorized child scores. Independent scoped result comparison found zero mismatches across 1,872 predefined metric rows, 1,404 held radial FP rows, U/null checks and all 46 radial exact events.

At 2,000 records, the predeclared common-four descriptive population has .45 ΔRecall@10 of +.0278/+.0278/+.0833 and ΔNDCG@10 of +.0249/+.0339/+.0279 across the three seeds. Success@5 is unchanged. These are **not** full-six primary results: those point means remain null, with shared-assignment sensitivities reported separately.

The conditional gains coexist with costs: all growth cells exceed the held-negative mean bound on newly exposed grade0 IDs; unchanged LEGACY exact controls show four authoritative-target displacements plus a new wrong-ID-ahead case; the fixed LEGACY14 descriptive population loses Success@5 at two seeds. The NEW tx01a target also moves from rank1 to2 at all sizes of seed38871, but its competing module is the original fixture-conformance defect, so that example is explicitly conditional. All .45 local latency guards pass; this is not production latency evidence.

Root-only .45 reproduces the uniform common-four gain at growth; child-only .45 does not. The same-certified-child opportunity audit retains every one of the 54 held pairs, with availability52/52/51 and the remaining U unavailable. No strict adequacy gate becomes valid.

[Complete quantitative report](<search-relevance-eval/threshold/RESULTS.md>) includes all thresholds, every authority target, regressions and recovered positives, absolute/new grade0 IDs, keyword promotions versus actual new admissions, root/child geometry and timing. [Independent comparison](<search-relevance-eval/threshold/results/independent-comparison.json>) is scoped verification, not certification of future A/B/C paths. The [complete compressed analysis](<search-relevance-eval/threshold/results/threshold-analysis.json.xz>) retains every dense event and sensitivity scenario.

## Reproduction and limits

[Completed-results reproduction](<search-relevance-eval/threshold/REPRODUCE-RESULTS.md>), [offline source reconstruction](<search-relevance-eval/threshold/reproduction-notes.md>), [execution contracts](<search-relevance-eval/threshold/execution-notes.md>), [frozen protocol](<search-relevance-eval/threshold/protocol.md>), [separately registered diagnostic disposition](<search-relevance-eval/threshold/diagnostic-protocol.md>), and [independent code review](<search-relevance-eval/threshold/analysis-code-review.md>) preserve the complete source history and limitations. Final offline discovery passes 571 tests; all eight production files and the original execution source closure remain byte-identical. All 13 disposable indices were UUID-verified and deleted with acknowledgments after capture; temporary forwards were stopped. The 149,751,500-byte raw archive is available in four hash-bound Git parts, and all 787 members (6,192,286,386 raw bytes) passed actual read-only verification. The safe-restorable49-member source archive contains original/V2 realizations, licensed footer repair history, blinded packets, all expanded metadata and independently derived known/U evidence.

The independently reviewed path is the explicit forced-D/nonpromotion mode. The reusable future strict A/B/C analyzer path is **not fully certified**: its chronology and some expected-surface attestations remain partially open in the code review. This study does not use that path to authorize a default change.

[#3887](https://github.com/magda-io/magda/issues/3887) stays open. [#3885](https://github.com/magda-io/magda/issues/3885) had already been closed by a maintainer as not planned before this registration; this evaluation leaves that decision untouched and changes neither issue state.
