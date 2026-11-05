# #3901: normalized hybrid-search evaluation pilot

**Recommendation: C — evidence inconclusive.** Acquisition, replay, independent blinded judging and objective controls are complete, but the pilot failed its relevance-discrimination feasibility gate: only **one held-out task has defined NDCG, an exact-title lookup**. This is an evaluation-only change, not an implementation of #3885.

## Decision scope

The preregistered default for inadequate evidence is **C — inconclusive**, and that is the evidence-based outcome here. A 15-task agent-judged pilot on a 494-dataset re-indexed sample cannot justify a high-risk production ranking rewrite. **No genuine held-out discovery improvement was demonstrated, and raw fusion was not shown superior either.** Treat “normalization runs” as engineering proof, not “normalization is better.” Leave #3885 open; do not promote the top-level rewrite from this pilot.

No production search-ranking source, scoring configuration, index-version declaration or implementation changelog was changed. Baseline code is `main` at `ba18156201c50565c85c62f76469245925994ece` after #3900; only evaluation code and an offline CI unit-test job are added.

## 1. Corpus acquisition and external validity

Anonymous read-only acquisition from `https://dev.magda.io/api` established:

| Item | Observed |
|---|---:|
| Registry records with `dcat-dataset-strings` | 113,117 |
| Cursor pages / duplicate dataset IDs | 114 / 0 |
| Independently presampled IDs | 500 |
| Exact public indexed matches retained | 494 |
| Unresolved IDs, no replacements | 6 |
| Nonempty indexed publisher names represented | 312 |
| Unique public distributions | 1,892 |
| Datasets with distributions | 475 |
| Dataset/distribution queryContext availability | 494/494 and 1,892/1,892 |
| Exported source vectors | none; API returns null |

Selection combined 250 seeded equal-publisher round-robin selections and 250 uniform selections from the remainder, **before** relevance tasks or system results. The Registry inventory contained 1,346 publisher strata. Retention required exact ID equality in public Search metadata, using title/publisher lookup fallbacks, never accepting a different high-ranked record. Six unresolved IDs were not replaced and do not establish privacy or nonexistence.

Registry inventory was fetched 2026-11-05 13:56:59–14:00:29 UTC (2026-11-06 Australia/Sydney), with later indexed lookups. The corpus is a frozen acquisition, not a transactionally consistent catalogue export. The earlier Search wildcard count was **113,683**, 566 above the Registry inventory; the cause is unknown. Neither count proves the other is complete.

- Corpus SHA256: `7e115a663c3d7c8a8794903b2940e0d3fda058f4bb6e7b76520c730e5d655e43`.
- Inventory SHA256: `6aadbc4e40e84fd941cca76514494dc8dd702bd33ac66fe010464a16bb8774c3`.
- Embedded corpus SHA256: `80862a1ef9b1d4eadc039ca8f6410b3b32b4d7b428581fcbf8baa6dac88cff65`.
- Complete acquisition receipts, selection IDs, immutable source bodies and vectors remain local/outside git. [Feasibility manifest](results/pilot/feasibility.json), [freeze manifest](results/pilot/freeze-manifest.json), [environment](results/pilot/environment.json).

**Limits:** ~0.44% of the Registry inventory is not production-representative merely because it includes many publishers. Publisher oversampling, title/top10 lookup coverage, absent competitors, changed IDF and score distributions all affect fusion. The public deployment's actual OpenSearch/index version, embedding model and private vectors were not externally verified. This is a controlled same-snapshot re-index comparison, **not an exact production replay**.

Acquisition used forced anonymous credentials, verified HTTPS, GET-only allowlisted requests, no redirects/cookies/netrc and at most two starts per rolling second. The final cache audit made zero network requests and reproduced the same corpus. No distribution contents were downloaded. An early anonymous GET of Search readiness occurred before source inspection showed that the handler may ensure a missing pipeline. No mutation method or intentional public pipeline operation was performed; no state change was observed, but it was not independently excluded. Subsequent acquisition uses pure-read endpoints. This caveat is retained rather than claiming an absolute public-state audit.

## 2. Frozen tasks and comparison

[Tasks](queries.jsonl) were frozen before experimental replay: **5 development + 10 held-out**, with 3 exact lookups, 3 natural-language discovery needs, 3 vocabulary mismatches, 2 distribution/format needs, 2 ambiguous needs and 2 plausibly missing-answer needs. Eight are constructed externally informed government/research questions; seven are conservatively labeled supplements (four external-product-informed plus three exact controls). They are **not observed user logs**. [Task provenance](task-provenance.md) records sources, unavailable source pages, selection bias and an incidental initial exposure to score fields that were not used for construction.

Three separate [objective anchors](anchors.jsonl) were validated against fixed corpus membership. They were withheld from judging; an exact-identifier query is also redacted in judge packets. Missing-answer tasks do not assert catalogue-wide absence, and request public aggregate data, not private person-level records.

The [stop decision](results/pilot/expansion-decision.json) was recorded before held-out execution: retain the 15-task pilot rather than expand to 40. More constructed tasks on this small, unverifiably production-equivalent sample would not repair external validity. No weight was chosen from held-out outcomes.

### Local environment

OpenSearch **2.19.1**, production mapping from the pinned Magda source, one shard/zero replicas, fixed local region references; vectors regenerated identically for every system using embedding-api **1.1.0**, image digest `sha256:7faca54ae24ce1c03d4213d3a3c2109ff57b23c644e4d22523e1c861201fb6ec`. The image default is **Alibaba-NLP/gte-base-en-v1.5**, 768 dimensions, q8 inference, normalized CLS output, maximum 1024 tokens. Exact model repository revision was not independently verified; generated vectors are cached and hashed. The same 494 datasets, 1,892 distributions, query vectors, permissions, filters and depth10 are used throughout.

| System | Definition |
|---|---|
| baseline | Exact production query-builder export; nested raw-score hybrid fusion; dataset-vector boost50; configured pipeline has no effective normalization here |
| candidate_03_07 | Primary top-level two-family hybrid, min-max + arithmetic mean weights keyword/vector **.3/.7**, dataset-vector boost50 removed |
| candidate_05_05 | Fixed .5/.5 sensitivity |
| candidate_07_03 | Fixed .7/.3 sensitivity |
| candidate_keep50_03_07 | Fixed .3/.7 matched sensitivity retaining dataset-vector boost50 |
| keyword / vector | Separately isolated family controls |

The primary candidate is a **compound intervention**: normalization and removal of boost50. The keep50 comparison is required before attributing differences specifically to normalization. Quality and geographic functions remain inside branches, so they operate **before** normalization, not as mathematically equivalent post-fusion multipliers. Inner-hit projection moves to an optional post-filter; parent/child eligibility filters remain mandatory in each family. Facet matching uses ordinary union queries. These semantic differences are disclosed, not assumed harmless.

## 3. Objective correctness and operational results

[Local engine controls](results/controls-3901.json): **20/20 passed**: seven-system eligibility, pipeline proof, and ten explicit-format checks across baseline/four candidates. They use a production-exported request and mapping plus small deterministic fixtures and a translated synthetic owner predicate—not a real OPA service:

- Parent tenant/publishing/owner and child matching constraints preserve exact eligible IDs.
- Metadata-only parents survive; accessible unrelated siblings are projected; hidden-owner/wrong-tenant children are excluded.
- Existing projection semantics allow visible draft/unrelated siblings; child matching still requires published eligibility. Existing nested Format facets count all children of eligible parents, and facet topHits can include raw parent child-source. These are baseline limitations, **not** a child-safe facet/production-security proof.
- Actual exported CSV-format selection returns exactly four fixture parents for baseline/all four candidates; a nonexistent format returns zero. Publisher facets retain the selected format (counts4/0); Format facets self-exclude their own selection (count8 in both cases). The format predicate is a separate nested clause, so a metadata-matching parent can satisfy format through a hidden child even though that child is not projected. This preserves existing behavior; it is **not same-child format-and-authorization enforcement**.
- On a deliberately conflicting fixture, .9/.1 gives lexical/vector scores **.9001/.1009**; .1/.9 gives **.1009/.9001** and reverses the leader. This demonstrates actual processor execution.
- Baseline scores **88.62395 / 52.089787** remain unchanged when pipeline weights are reversed. “Pipeline configured” alone is not evidence of application.
- All four exact UUID-scoped resources were deleted after verification.

For the real frozen corpus, all four candidate variants matched baseline total-hit and facet-count trees on **all 15 tasks**. Every query/system returned the same ranking-and-score signature across its ten measured repeats. Exact known-answer controls remained rank1 for baseline and every normalized candidate: development1/1, held-out2/2, Success@5=MRR@10=1. Vector-only missed one of two held-out objective controls.

Rank changes are substantial even without evidence of improvement: primary candidate changes **9/15** leaders and has mean top10 Jaccard **0.587** with baseline; .5/.5 changes7 leaders (0.638); .7/.3 changes2 (0.693); keep50 changes9 (0.604). Baseline and keyword-only have identical top10 **sets** and leaders for all15 tasks, but identical ordered ID lists on only7/15; raw fusion still changes ordering within the shared set. These are ranking differences, not relevance labels.

### Retrieval latency

One excluded warmup per query/system, followed by ten interleaved repetitions: **1,050 measured requests**. Development50 requests/config has no reported p95; held-out100/config supports a **descriptive empirical** p95, not 100 independent queries or a production SLA. Embedding and public API end-to-end time are excluded.

| System | Held-out median ms | Held-out empirical p95 ms |
|---|---:|---:|
| baseline | 55.76 | 65.47 |
| candidate_03_07 | 63.08 | 71.01 |
| candidate_05_05 | 63.44 | 76.39 |
| candidate_07_03 | 62.89 | 71.11 |
| candidate_keep50_03_07 | 60.66 | 72.89 |
| keyword | 46.20 | 54.44 |
| vector | 31.47 | 91.34 |

The locked local guard is candidate p95 ≤ max(1.5×baseline p95, baseline p95+25ms) = **98.21ms**. Primary passes at71.01ms, but is slower than baseline; this does not establish acceptable deployed latency. [Operational detail](results/pilot/operational.json), [ranked IDs/scores/timings](results/pilot/rankings.jsonl).

## 4. Independent relevance assessment and uncertainty

Two fresh non-forked assessor contexts per task receive deduplicated, shuffled blind metadata only: no algorithm, rank, score, source target ID or objective anchors. The fixed rubric is grade3 direct fit,2 materially useful,1 tangential,0 irrelevant,U insufficient metadata, with field-specific scope evidence. There are **213 unique task/dataset pairs**:69 development and144 held-out, each assigned to both assessors. Assessors use the same available model family (`gpt-6.1-sol`, runtime label); exact service snapshot/temperature/top-p are unavailable. Context independence is not model-family independence or human ground truth.

A preflight audit found the original sanitizer dropped structured success criteria and nested spatial/temporal evidence. That initial development pass was canceled and excluded before metrics. Its artifacts are preserved locally; corrected v2 packets and fresh contexts are used, with tasks, rankings, weights and corpus unchanged. [Execution audit](results/pilot/execution-audit.json), [corrected-packet hashes](results/pilot/packet-v2-audit.json), [implementation amendments](results/pilot/implementation-amendments.json), [observable prompt/execution record](judging-execution.md).

### Agreement and evidence coverage

All **426 initial assessments** were recorded; no pair is missing a judge. Initial exact agreement is **212/213 =99.53%**. Numeric-pair quadratic-weighted kappa is1.0 on210 numeric/numeric pairs, but **207 of those pairs are agreed zeros**. Initial U counts are3 for A and2 for B; two pairs are both-U and one is a one-U disagreement. High agreement under this near-all-zero prevalence is not evidence of accurate or informative relevance judgments.

A third blinded context reviewed **all one disagreement** plus a seeded, grade-stratified **21/210=10%** sample of agreed numeric pairs. The disagreement resolved to0; none of the agreed audit grades changed. Two both-U pairs remain U. The third assessor uses the same available model family, not independent human expertise. [Raw assessor A](results/pilot/judge-A.jsonl), [assessor B](results/pilot/judge-B.jsonl), [adjudication](results/pilot/adjudication.jsonl), [review selection](results/pilot/adjudication-selection.json), [review summary](results/pilot/adjudication-summary.json).

Resolved grades: **208 irrelevant(0), one tangential(1), zero materially useful(2), two direct(3), two U**. The two direct pairs are exact-title controls; the sole nonzero discovery pair is development-only and tangential. Thus this pilot did not collect meaningful held-out positive discovery evidence. Low U exposure—primary top10 held-out1/82=1.22%, development1/50=2%—must not obscure that coverage failure.

### NDCG and objective metrics

Primary NDCG@10 preserves original top10 ranks, gains `2^grade−1` and pooled IDCG. U/unjudged gain0 is an explicit computational scenario, not proof of irrelevance or a mathematical lower bound. **Zero pooled IDCG is undefined**, not a zero score or a tie. Agreement-only consensus leaves conflicting/missing grades U; explicit adjudication resolves only reviewed pairs. Objective lookup Success@5/MRR@10 uses known IDs, not LLM guesses.

| Population | Tasks / defined NDCG | Baseline | Primary .3/.7 | Candidate win/tie/loss |
|---|---:|---:|---:|---:|
| Held-out positive intent | 8 / **1** | 1.000 | 1.000 | 0 /1 /0 |
| Development positive intent | 5 /2 | .500 | 1.000 | 1 /1 /0 |
| Held-out missing-answer diagnostics | 2 /0 | undefined | undefined | not compared as positive intent |
| Objective exact lookups, all splits | 3 /3 eligible | Success@5=1; MRR@10=1 | Success@5=1; MRR@10=1 | all expected IDs rank1 |

**The held-out1.000 is only q07, an exact-title lookup. It does not mean perfect discovery relevance, equivalence, seven additional ties, or evidence of improvement.** Six positive held-out discovery pools have no positive qrel; q06's blind identifier identity is unassessable (objective code separately verifies it). All seven excluded tasks remain visible in [task outcomes](results/pilot/task-outcomes.json) and the [full scenario CSV](results/pilot/graded-results.csv).

| Held-out category | Tasks | Defined NDCG tasks | Baseline / primary |
|---|---:|---:|---|
| Exact lookup | 2 | 1 | 1.000 /1.000; other identity withheld from judges |
| Natural-language discovery | 2 | 0 | undefined |
| Vocabulary mismatch | 2 | 0 | undefined |
| Distribution/format | 1 | 0 | undefined |
| Ambiguous competitors | 1 | 0 | undefined |
| Plausibly missing answer, diagnostic only | 2 | 0 | undefined; absence unverified |

Both format tasks have frozen explicit requirements and synthetic engine-format controls, but **no independently validated real-corpus complete-answer anchors**. Do not derive objective format Success/MRR from an LLM grade or infer ZIP contents. Likewise, zero-relevance retrieval does not prove the frozen corpus or full catalogue lacks an answer. No complete-corpus Recall@10 estimate is supported.

### Weights, uncertainty and robustness

| Fixed system | Held-out NDCG (n=1 exact lookup) | Development NDCG (n=2) |
|---|---:|---:|
| baseline | 1.000 | .500 |
| candidate_03_07 | 1.000 | 1.000 |
| candidate_05_05 | 1.000 | .8155 |
| candidate_07_03 | 1.000 | .7153 |
| candidate_keep50_03_07 | 1.000 | 1.000 |
| keyword | 1.000 | .500 |
| vector | 1.000 | 1.000 |

No weight was selected from these outcomes. Assessor A/B, agreement-only, adjudicated, U->3, numeric-conflict min/max and strict duplicate-family scenarios all give held-out primary difference0 on the **same one-task cohort**. This apparent stability is **vacuous**, not robust discovery evidence. U->3 newly defines held-out q06 and development q05, explicitly outside that common cohort. Binary gain>=2 removes development q03, so the apparent development improvement disappears and only its exact lookup remains. The strict normalized-title+publisher family rule found494 distinct families; semantically similar or versioned records with different titles are not resolved by that rule.

Paired query bootstrap10,000 draws, seed3901, gives a degenerate held-out difference interval[0,0] with **n=1**, and development[0,1] with n=2 for mean difference+.5. These are mechanically descriptive resamples, not useful inferential confidence or statistical significance. The pilot cannot measure population benefit, judge common-mode bias or production latency risk from these intervals.

### Auditable examples: one weak development gain, no fabricated held-out wins

1. **q03, development vocabulary mismatch:** normalized primary retrieves `ds-ditrdca-b1cca4ed-47bd-4d83-935c-e8bf1ae2e8eb` at rank1; baseline omits it from top10. Metadata describes “fatalities in road crashes in Australia involving heavy vehicles,” links the “Australian Road Deaths Database,” and provides PDF resources. Both assessors give **grade1**, a tangential lead—not the requested2019–23 pedestrian/cyclist state counts. With only that nonzero pooled qrel, IDCG=1, baseline NDCG0 and candidate1. This explains the entire development macro uplift; it is not a useful-answer improvement. Keep50 also retrieves it, so boost50 removal is not independently established as beneficial.
2. **q07, held-out exact title:** `ds-dga-d0db4d0b-2a5e-4317-b738-e5956b728ac0` (“Melton Pavilions and Clubrooms”) is the sole grade3 qrel at rank1 for both systems. DCG=IDCG=7; both NDCG1. This is the only defined held-out comparison.
3. **q11, shoreline history:** candidate leader `ds-wa-b628afdc-4480-41e4-8c99-5aca2b0c8727` describes “Australian six monthly high tides from 2015 to 2022”; baseline leader `ds-vic-7c3c835a-ebce-4cb1-a436-9a5ffa617b81` concerns vehicle duty. Both are grade0 for a shoreline-retreat need requiring a history since approximately1988/20+years. A more coastal-looking leader is not an evidenced relevance win.
4. **q12, SA2 boundaries:** candidate leader `ds-dga-0257a9da-b558-4d86-a987-535c775cf8d8` advertises “Esri Shapefiles - GDA2020,” but describes ACT localities rather than2021 SA2. Baseline `ds-vic-3f918a57-41b8-47ec-a153-e07667a8185d` is Victorian cadastral data. Both grade0. Matching a format/datum alone is not success on geography/edition/granularity.

[Metric report](results/pilot/graded-results.json), [all scenario/task values](results/pilot/graded-results.csv), [compact pair mapping](results/pilot/pair-mapping.jsonl), [independent analysis audit](analysis-review.md). Original grades remain unchanged; no midpoint or guessed certainty was substituted.

### Recommendation for #3885

Choose **C, not A or B**. Normalization can execute and change rankings; sampled correctness and local latency guards passed. But the held-out relevance comparison is effectively a single exact lookup, with no materially useful discovery positives. That cannot justify A, and it also cannot establish B's claim that raw fusion should be preferred on relevance. Keep the current implementation as the baseline and leave #3885 open.

Before a substantive decision, obtain an authorized larger/full immutable indexed snapshot or an independently validated, representative task/corpus design with known discovery-answer coverage; verify actual embedding/index configuration; add independent real format/scope anchors, richer auth/top-k/pagination controls, and human/domain-qualified judgments. Fix the task/corpus coverage gate **before** tuning candidate weights or inspecting new held-out rankings. Do not simply manufacture more title-derived tasks or expand until a preferred system wins.

## 5. Reproducibility and validation

[README](README.md) supplies acquisition, re-embedding, production export, safe local replay, controls, pooling/judging and metric commands. Bulk corpus/vectors are not committed; exact old-result reproduction requires retained immutable working artifacts because the live catalogue changes. Frozen tasks, source receipts/hashes, ranked IDs/scores/timings, raw observable assessments and recomputable analysis are the audit trail. Secrets and distribution contents are not part of the deliverable.

Validation: **113 offline Python tests passed**, Scala adapter compilation/two-query smoke passed, **26 unchanged production Scala search tests passed with live OpenSearch and zero cancellations**, local correctness20/20, CI YAML parsed, and no production search/build source diff against the baseline. An independent analyst recomputed all945 scenario/query/system NDCGs without importing the evaluator and checked evidence hashes. The offline CI job never contacts dev.magda.io. Completed engineering/evaluation work does not turn this relevance-discrimination failure into positive evidence.
