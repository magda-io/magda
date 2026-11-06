# #3903 synthetic replay: C — inconclusive, nonpromotional

**Recommendation is forced C, not A or B.** The original confirmatory validation failed before retrieval: a057 has unresolved relevance to the frozen s08 factory-sanitation intent and d03 `plant` diagnostic. The separately authorized supplementary replay shows substantial **descriptive** semantic gains, but also exact-ID regressions in every seed and incomplete secondary correctness coverage. It cannot establish production relevance, select a winning weight, justify adoption, or close #3885.

The frozen eight-family primary NDCG is **unavailable**. All point graded metrics for s08's three paraphrases and d03 are null—not U-as-zero estimates. Seven fully validated held-out families may be described separately. The [diagnostic validation](<diagnostic-validation.json>) covers 40,488 known and 12 U query/document/seed pairs; the [pre-outcome policy](<diagnostic-execution-policy.json>) and [uncertainty mask](<auditoutputs/diagnostic-uncertainty-mask-v1.jsonl>) were fixed before embeddings. Queries, criteria, proposed grades, systems and weights were not repaired after seeing outcomes.

## Scope, method and independent audit

Release checks: **248 offline tests**, **26 unchanged Scala tests** ([actual log](<results/scala-search-tests.log>)) and **7 real-service baseline authorization tests** passed. All **21 owned benchmark resources were removed** after archiving; [cleanup receipts](<results/cleanup.json>) verify existing user indexes/pipelines were preserved. Neither this result nor cleanup changes production ranking.

- Three joint 180-record indexes: Suite A100 (20 cocoa/50 confectionery/30 beverages) plus B80. All75 queries and eight fixed systems ran in each seed, including development and diagnostics; no seed or profile was discarded.
- NDCG@10 uses existing [evaluate.py](<../evaluate.py>) with exponential gains, original ranks and **all180 corpus qrels**, not a retrieved pool. Average paraphrases within an intent, then weight intents equally. Exact lookup uses authoritative IDs, not graded NDCG. No A/B judges or invented judgments were introduced; these are partially independently validated **synthetic design labels**, not human relevance truth.
- The unchanged [analyzer](<analyze.py>) produced [complete machine results](<results/analysis.json>): every query, intent, seed, system, top-ten ID/rank/score/grade, contrast, timing and sensitivity assignment. No metric implementation or decision rule changed after retrieval.
- E independently regrouped **all10,800 response receipts**: each of1,800 seed/system/query groups has one warmup and five measured responses; all six have identical IDs/ranks/scores. Ledger rankings equal analyzed rankings. Recomputed full-qrels NDCG/family means and receipt-derived median/p95 match the machine results. This checks arithmetic and source agreement, not independence of the synthetic labels.
- The sole grid ran **2026-11-06 15:37:56–15:45:05 UTC**. The [execution audit](<results/execution-audit.json>) records600 final rows,3,000 measured requests and600 warmups per seed, with no errors, timeouts, failed shards or duplicate IDs. Hybrid matched-profile totals/facet-count differences were zero; this is not evidence that keyword/vector controls must have identical eligible sets.

## Suite A: seven known held-out families, not the frozen primary

Each cell is **NDCG@10 (difference from raw boost50 baseline)**, equally weighted over the same seven known families/21 paraphrases. s08 is excluded with counts, never silently counted as zero or relabeled. Development families remain separate in the [machine results](<results/analysis.json>).

| Fixed system | 39031 | 39032 | 39033 |
|---|---:|---:|---:|
| baseline, raw boost50 | .5063 (—) | .5264 (—) | .5657 (—) |
| raw_boost1 | .4768 (−.0295) | .4820 (−.0444) | .5592 (−.0066) |
| candidate_03_07, boost1 | .6768 (+.1705) | .7258 (+.1995) | .7055 (+.1398) |
| candidate_05_05, boost1 | .6367 (+.1304) | .6682 (+.1418) | .6909 (+.1252) |
| candidate_07_03, boost1 | .5935 (+.0873) | .6178 (+.0915) | .6503 (+.0846) |
| candidate_keep50_03_07 | .6369 (+.1307) | .7290 (+.2026) | .7016 (+.1358) |
| keyword | .4761 (−.0301) | .4820 (−.0444) | .5483 (−.0174) |
| vector | .6540 (+.1477) | .6879 (+.1616) | .6521 (+.0864) |

Known-family Success@5, **grade≥2 / grade≥3**:

| Fixed system | 39031 | 39032 | 39033 |
|---|---:|---:|---:|
| baseline | .762 / .762 | .762 / .762 | .762 / .762 |
| raw_boost1 | .762 / .714 | .762 / .714 | .762 / .762 |
| candidate_03_07 | .952 / .905 | .952 / .952 | 1.000 / .952 |
| candidate_05_05 | .952 / .857 | .952 / .952 | .952 / .952 |
| candidate_07_03 | .810 / .762 | .810 / .810 | .857 / .810 |
| candidate_keep50_03_07 | .905 / .857 | 1.000 / 1.000 | 1.000 / .905 |
| keyword | .762 / .714 | .762 / .714 | .762 / .762 |
| vector | .905 / .905 | .952 / .905 | .952 / .905 |

### Fixed contrasts: gains are not attributable to boost removal alone

Cells are **paired known-family NDCG delta; family wins/ties/losses**, candidate minus comparison baseline. Every row was fixed before outcomes; this table does not select a new candidate.

| Contrast | 39031 | 39032 | 39033 |
|---|---:|---:|---:|
| normalized architecture, matched boost50: keep50 − baseline | +.1307;6/0/1 | +.2026;7/0/0 | +.1358;6/0/1 |
| normalized architecture, matched boost1: .3/.7 − raw1 | +.2000;6/0/1 | +.2438;6/0/1 | +.1464;6/0/1 |
| remove dataset kNN boost only: raw1 − baseline | −.0295;1/1/5 | −.0444;0/2/5 | −.0066;2/1/4 |
| combined primary-profile change: .3/.7 − baseline | +.1705;6/0/1 | +.1995;5/0/2 | +.1398;6/0/1 |
| fixed .5/.5 − baseline | +.1304;6/0/1 | +.1418;5/0/2 | +.1252;6/0/1 |
| fixed .7/.3 − baseline | +.0873;6/0/1 | +.0915;5/0/2 | +.0846;6/0/1 |
| fixed .5/.5 − .3/.7 | −.0401;2/0/5 | −.0576;1/0/6 | −.0146;3/0/4 |
| fixed .7/.3 − .3/.7 | −.0833;1/0/6 | −.1080;1/0/6 | −.0552;2/0/5 |
| keyword − baseline | −.0301;1/1/5 | −.0444;0/2/5 | −.0174;0/2/5 |
| vector − baseline | +.1477;5/0/2 | +.1616;4/0/3 | +.0864;5/0/2 |

**Matched boost does not isolate the normalization processor alone.** Candidate restructuring groups root/child keyword evidence and vector-family evidence before normalization; raw fusion retains per-entity nested hybrid/disMax behavior. Neutral quality1 and neutral geographic scoring reduce primary placement confounds, not this cross-entity fusion difference. Removing boost50 alone slightly reduced known-family NDCG in all seeds; attributing the combined gain to boost removal would be wrong. Actual normalization execution is separately supported by the weight-reversal control below.

### Semantic counterexamples: every primary-profile query loss

All negative known held-out query deltas for candidate_03_07 versus baseline are retained here; favorable family means do not erase them.

| Seed | Query | Baseline → candidate NDCG |
|---|---|---:|
| 39031 | s04p1 | .9014 → .8502 |
| 39031 | s09p1 | .8291 → .6831 |
| 39031 | s09p2 | .6621 → .5591 |
| 39032 | s07p1 | .7695 → .6053 |
| 39032 | s07p2 | .8155 → .6933 |
| 39032 | s09p2 | .5075 → .4297 |
| 39033 | s06p1 | .6802 → .3940 |
| 39033 | s06p2 | .8568 → .7804 |
| 39033 | s07p1 | .8915 → .8382 |
| 39033 | s12p1 | .7765 → .7550 |

Two inspectable failures illustrate limitations of semantic similarity:

- **39031/s09p1:** a069 rises to rank1, above empirical grade3 a062 (now rank2). a069 explicitly says “All entries are computer simulations; no physical trial or empirical observations were collected,” despite matching powder/water/dissolution concepts. a062 documents physical observations and the requested measurements. This violates the frozen empirical-data constraint, not the broad topic. See [actual seed39031 records:62–69](<results/case-evidence.json#L1-L137>).
- **39033/s06p1:** a037, grade0, leads the candidate while grade3 a040 moves from first to third. a037 measures similar fracture/tempering variables but explicitly studies **soft chocolate filling**, not the requested solid chocolate. See [actual a037](<results/case-evidence.json#L272-L342>). These rankings establish hard-constraint failures; they do not by themselves identify vector recall versus truncation as the unique cause.

## Suite B: exact precision worsens despite semantic gains

All24 exact queries—including ten development queries—remain fully validated and critical. Cells are **top1 count/24; MRR@10; Success@5 count/24; target-rank losses versus baseline**. An absent top-ten target has reciprocal rank0; an exact query's NDCG is not substituted for identity precision.

| Fixed system | 39031 | 39032 | 39033 |
|---|---|---|---|
| baseline | 17;.7292;18;0 | 18;.7708;19;0 | 15;.6528;17;0 |
| raw_boost1 | 17;.7292;18;0 | 18;.7708;19;0 | 15;.6597;17;0 |
| candidate_03_07 | 15;.7188;20;4 | 17;.7500;19;1 | 13;.5986;17;2 |
| candidate_05_05 | 16;.7500;20;3 | 18;.7708;19;0 | 14;.6319;17;1 |
| candidate_07_03 | 17;.7458;20;0 | 18;.7708;19;0 | 14;.6389;17;1 |
| candidate_keep50_03_07 | 16;.7500;20;3 | 17;.7500;19;1 | 13;.5944;16;2 |
| keyword | 17;.7292;18;0 | 18;.7708;19;0 | 15;.6597;17;0 |
| vector | 7;.3000;8;13 | 5;.2326;7;14 | 4;.1667;4;13 |

### All seven primary-profile critical regressions

| Seed | Query text / ID | Authoritative target | Baseline → candidate rank | Wrong candidate leader |
|---|---|---|---:|---|
| 39031 | RUN-X121 / x04 | b002 | 1 → 2 | b001 (RUN-X120) |
| 39031 | RUN-X12O / x07 | b008 | 1 → 2 | b001 (RUN-X120) |
| 39031 | RUN-X120-V1 / x09 | b010 | 1 → 2 | b001 (RUN-X120) |
| 39031 | Riverbend friction survey release 2.0 / x22 | b025 | 1 → 4 | b009 |
| 39032 | Hydraulic pump acceptance trials / x11 | b013 | 1 → 2 | b049 |
| 39033 | ZTS-20471:2024 / x15 | b018 | 1 → 2 | b017 (2013 edition) |
| 39033 | Riverbend friction survey release 2.0 / x22 | b025 | 1 → 5 | b037 |

These are per-query failures, not merely net accuracy differences. In39031 x01/x02 improve from absent top-ten targets to rank1, but cannot compensate for four different critical losses. x04/x07/x09 and39033 x15 are explicit frozen near-identifier collisions. x22 in39031 and x11 in39032 have wrong leaders **outside** their frozen collision lists: report them as wrong-ID displacement, not invented near-identifier categories. In39033 x22, b026 (wrong release) also precedes the authoritative b025.

The [actual analyzer responses](<results/analyzer-tokens.jsonl>) preserve distinctions rather than implying an equality operator: description search tokens are `run,x121`, `run,x12o`, `run,x120,v1`, and `zts,20471,2024`. Title/keyword `.quote` analysis preserves hyphenated forms such as `run-x120`; ordinary title analysis splits `run,x120`. There is also substantial index-time WordNet expansion in description fields, distinct from the no-synonym search analyzer. No unconfigured keyword-equality field is assumed.

For39031 x04/x07/x09, raw1 and keyword retain rank1 targets, vector misses the target in its returned top ten, and both normalized .3/.7 profiles put b001 ahead. Candidate scores are b001=.7 and the exact target=.3. This is consistent with fusion giving the vector-preferred identity precedence over exact lexical evidence; it is not evidence that the analyzer collapsed X121/X12O into X120. For39032 x11, b049 genuinely has hydraulic flow/noise measurements, but that does not make it the authoritative exact-title record b013 ([b013](<results/case-evidence.json#L138-L210>), [b049](<results/case-evidence.json#L211-L271>)). In39033 x22, retaining boost50 worsens the target further to rank10; in39031 retaining it keeps rank1. Thus precision effects are seed- and architecture-dependent, not a simple universal boost explanation.

### Complete exact-rank regression index, every fixed profile

Every query whose authoritative target rank worsens versus baseline is listed; `—` means none, not perfect absolute precision. Full per-target ranks—including every nonregression, miss and collision—are in `per_query` in the [machine results](<results/analysis.json>).

| Fixed system | 39031 | 39032 | 39033 |
|---|---|---|---|
| baseline / raw_boost1 / keyword | — | — | — |
| candidate_03_07 | x04,x07,x09,x22 | x11 | x15,x22 |
| candidate_05_05 | x04,x07,x09 | — | x15 |
| candidate_07_03 | — | — | x15 |
| candidate_keep50_03_07 | x04,x07,x09 | x11 | x15,x22 |
| vector | x04,x07,x09,x12,x13,x15,x16,x17,x18,x19,x20,x22,x24 | x07,x09,x10,x11,x12,x13,x14,x16,x17,x18,x19,x21,x22,x24 | x03,x04,x07,x09,x10,x12,x13,x15,x17,x18,x19,x22,x24 |

## Suite B functional searches: separate, mixed individual effects

Held-out functional NDCG averages the two families equally (six paraphrases). Do not combine this with Suite A or exact accuracy.

| Fixed system | 39031 | 39032 | 39033 |
|---|---:|---:|---:|
| baseline | .6946 | .6113 | .7142 |
| raw_boost1 | .7093 | .6236 | .7214 |
| candidate_03_07 | .8743 | .7129 | .8255 |
| candidate_05_05 | .8584 | .7076 | .8158 |
| candidate_07_03 | .7979 | .6903 | .8016 |
| candidate_keep50_03_07 | .7805 | .5921 | .6828 |
| keyword | .7093 | .6235 | .7214 |
| vector | .8409 | .7382 | .8181 |

Candidate_03_07 improves both family means in each seed, but is not universally better at every query: **39032/f02p1** falls .7700→.7367. Conversely39031/f02p3 rises .4761→.8716: top results move from useful grade2 b015/b063/b057 to direct grade3 b013/b049/b055. Those direct records expose measured hydraulic flow, sound pressure and microphone distance, rather than relying on product labels alone. The same semantic preference can help functional retrieval yet hurt exact-title x11. Vector outperforms keyword in functional means across all seeds and even exceeds candidate_03_07 in39032; it performs poorly on exact identifiers. These controls expose task-class trade-offs, not a universal winner.

## U sensitivity: assumptions, never point truth

For each seed, s08/a057 has one unknown intent/document grade shared by all three paraphrases. Enumerate **0,1,2,3**, consistently across all systems, recomputing DCG and **full180-document IDCG**. The following are extrema across four complete assignments, **not confidence intervals**. The paired-delta range uses the same assignment on both systems; it is not obtained by subtracting unrelated endpoints.

| Seed | Assumed full-eight-family baseline range | Candidate_03_07 range | Paired delta range |
|---|---:|---:|---:|
| 39031 | .4945–.5058 | .6899–.6951 | +.1892–+.1955 |
| 39032 | .5099–.5216 | .7379–.7390 | +.2163–+.2287 |
| 39033 | .5441–.5558 | .7039–.7116 | +.1481–+.1675 |

The separate d03 `plant` uncertainty also has four grade assignments per seed. **Plant-query-only** sensitivity, not the four-query ambiguity mean:

| Seed | Baseline range | Candidate_03_07 range | Paired plant delta range |
|---|---:|---:|---:|
| 39031 | .3239–.5440 | .3239–.5440 | .0000 |
| 39032 | .3091–.5292 | .4508–.5897 | +.0605–+.1417 |
| 39033 | .3091–.5292 | .3250–.5451 | +.0158 |

All eight systems, assignment values and per-query/intent scores are retained in `uncertainty_sensitivity` in the [machine results](<results/analysis.json>). No assignment repairs the validation failure or permits A/B. Other ambiguous queries remain exploratory graded diagnostics. Both no-answer queries return ten hits under every hybrid and keyword profile; vector returns5–10. NDCG remains null for these cases: returning fewer hits is not a relevance win or evidence of calibrated abstention.

## Local warmed latency, not a service SLA

Milliseconds, median/p95, existing **linear interpolation**. Each combined cell has220 measured samples:44 frozen held-out positive queries × five repeats. Embeddings and public/API overhead are excluded; no cold-start or production-concurrency conclusion follows. Repeats are correlated. All8 systems are shown to avoid hiding sensitivity/control costs.

| Fixed system | 39031 p50/p95 | 39032 p50/p95 | 39033 p50/p95 |
|---|---:|---:|---:|
| baseline | 26.30/32.00 | 26.93/33.70 | 27.76/33.48 |
| raw_boost1 | 26.32/31.36 | 26.94/32.34 | 27.77/34.48 |
| candidate_03_07 | 29.62/35.99 | 30.19/37.87 | 30.77/36.71 |
| candidate_05_05 | 29.01/34.85 | 30.14/35.63 | 30.68/38.00 |
| candidate_07_03 | 29.16/35.56 | 30.26/37.93 | 30.65/37.09 |
| candidate_keep50_03_07 | 29.31/34.09 | 29.92/36.71 | 30.82/36.42 |
| keyword | 21.36/24.91 | 21.72/25.54 | 21.69/26.86 |
| vector | 21.47/26.88 | 22.60/28.62 | 24.31/29.44 |

Candidate_03_07's combined p95 passes the descriptive latency budget in all seeds: **35.99≤57.00,37.87≤58.70,36.71≤58.48**, where budget=`max(1.5×baseline_p95,baseline_p95+25ms)`. Passing latency does not cancel precision, validation or correctness failures.

Primary-profile suite-specific timing, **baseline → candidate median/p95**:

| Seed | A held-out, n120 each | B held-out, n100 each |
|---|---|---|
| 39031 | 26.80/32.40 →29.94/37.16 | 25.37/31.54 →27.60/33.48 |
| 39032 | 27.65/33.73 →30.73/38.05 | 25.81/32.63 →28.57/35.34 |
| 39033 | 28.08/34.67 →31.06/36.71 | 26.12/31.17 →27.91/35.74 |

These are fixed44-query timing populations, including the three unresolved s08 queries: unknown relevance does not erase measured execution cost. Suite-specific median/p95 for every other profile are retained in the [machine results](<results/analysis.json>). No p95 below100 samples is promoted to a stable tail estimate.

## Correctness and external validity

**All-green is false in every seed**, as honestly recorded in [correctness evidence](<results/correctness.json>).

- [Primary radial controls](<results/controls-primary.json>) pass23 checks, including eligibility, nested behavior, facets and real normalization execution. On the two-record fusion probe, changing baseline weights leaves scores88.62395/52.089787 unchanged; normalized weight reversal changes lexical/vector leaders .9001/.1009 ↔ .1009/.9001. This proves execution for that controlled query, not a causal normalization-only relevance effect.
- [Quality/spatial probes](<results/quality-spatial.json>) pass16 response checks across quality-only and generic-region scenarios. They confirm factors act **before** normalization and the normalized numeric effect differs from a raw multiplier. Primary quality1 and neutral geography are not proof of equivalence under nonneutral production factors.
- Existing unchanged baseline evidence includes26 Scala tests and [seven real Registry/Indexer/Auth/OPA/Search service regressions](<results/service-regressions.json>). The normalized candidate was **not** exercised through the full actual OPA service stack. Synthetic visibility predicates and literal filter preservation cannot substitute for that coverage.
- The [secondary top-k diagnosis](<results/secondary-topk-diagnosis.json>) remains incomplete: baseline k1 was accepted, but the reused radial exact-set oracle expected8 roots and saw7, omitting only an eligible tied vector-only root. That oracle is inappropriate for requiring a particular tied k1 neighbor. Remaining profile controls were not run after fail-fast. This is neither demonstrated engine non-support nor an observed authorization leak; it also is not a green top-k validation.

[Runtime evidence](<results/runtime-provenance.json>) pins OpenSearch2.19.1; [image evidence](<results/image-provenance.json>) binds the embedding image digest. The frozen model is Alibaba-NLP/gte-base-en-v1.5,768 dimensions,q8 normalized CLS,max1024 tokens. The model repository revision was not independently verified. Fresh pod-image capture occurred after the first embedding cache completion; do not falsely date that capture before inference. [Vector evidence](<results/vector-provenance.json>) records1,916 distinct cached texts,540 dataset rows,1,359 distribution rows and225 query rows; the same75 query vectors are reused across seeds. All three embedding preparations completed before controls and latency.

The variants are more than record-order shuffles: all180 descriptions and176 titles differ in every seed pair; child-count changes occur for82/98/98 IDs across seed pairs39031–39032/39031–39033/39032–39033. Median description lengths are845.5/836/858 characters. Nevertheless, the same facts, intent ontology, templates, labels and query vectors are shared. The seeds are **not three independent relevance populations**, paraphrases are dependent, and no significance or production-utility claim is made. Model-generated fixtures and model-based evidence reviews can share correlated biases even with roles separated;540 record reviews and75 query-equivalence reviews do not make the remaining design labels human ground truth. Nested metadata and synthetic hard constraints do not represent real catalog diversity, permissions, query traffic or judged utility.

## Reproducibility and machine appendix

Use the [replay instructions](<README.md>) and [analysis plan](<analysis-plan.md>). The original analyst invocation used all three unchanged local run files, diagnostic validated qrels, final mask/policy and correctness evidence. It did **not** rerun retrieval. [Analysis output](<results/analysis.json>) SHA256 is `94ca87c33547525b4851352ecd6e3cf67891372b0791b05f5d74f3459c982d1e`; its `input_sha256` map binds all inputs. The [execution audit](<results/execution-audit.json>) binds raw runs, requests, receipts, vectors, mappings and safe configuration. Full raw runs include large facet metadata; compact published rankings are postprocessing derivatives, not new benchmark runs.

Published compact rankings retain every ID/rank/score/timing and the parent harness's facet-count tree: [39031](<results/rankings-39031.jsonl>), [39032](<results/rankings-39032.jsonl>), [39033](<results/rankings-39033.jsonl>). Each adjacent `.projection.json` binds the unchanged full raw run and derivative hashes. Reanalysis of all1,800 compact rows reproduces **every** original analysis value exactly, excluding only the necessarily different `input_sha256` filename/hash map; see [projection verification](<results/compact-analysis-verification.json>). No retrieval was rerun. The portable clean-checkout validation also restores the original historical review bytes before recomputing the complete independent known/U proof.

A separate local frozen-execution deliverable preserves the complete raw outputs, vectors, requests, mappings, final corpus and evidence (44,068,152 bytes, SHA256 `f2643eb7180f229407c99e6af2cdb40ccf1f7d5369120ed122776dc3fb836aea`). It is not committed as a large generated binary; [the manifest](<results/reproduction-bundle.json>) records every member/hash. Use it with the pinned repository checkout, or regenerate via the documented local replay.

For complete case-level inspection, use these sections of [analysis output](<results/analysis.json>):

- `per_query`: all1,800 cases, exact target ranks/collisions, U exclusions and actual top tens.
- `per_intent` and `per_seed_system_cohort`: actual cohort/defined-family counts, all splits, known-only descriptive means.
- `contrasts`: all ten preregistered comparisons, every paired query win/tie/loss and both top tens—not just successful examples.
- `uncertainty_sensitivity`: all four grade assignments per affected seed/cohort, full-corpus IDCG scenarios and same-assignment delta extrema.
- `latency`, `operational_fidelity` and `decision`: all profile/suite timing, count diagnostics, failed/incomplete guards and the unconditional C policy.

**Decision:** retain the evidence as a controlled engineering diagnostic. Semantic ordering often improves, while precision-critical cases regress and the intended confirmatory question remains incompletely labeled. Do not promote normalized fusion, claim raw fusion conclusively wins, tune on these held-out results, or close #3885 on this benchmark.
