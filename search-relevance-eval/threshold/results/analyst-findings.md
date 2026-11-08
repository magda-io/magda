# Actual threshold-only analysis: descriptive, forced D

The preregistered diagnostic policy forces **D / nonpromotional**. Original fixture conformance failed, seven NEW scoped labels remain U (21 size-expanded pairs), and the original legacy twelve U remain unchanged. No alternative was selected; no production-default change or globally optimal cutoff is established.

Primary source: [complete immutable-analyzer report](</Users/t1000/development/magda/search-relevance-eval/threshold/results/threshold-analysis.json>). Every seven-threshold/seed/size cell is retained in the tables below; top-k is separate. Full six-family heldout point metrics remain null. The common-four population t04/t05/t06/t07 was fixed before scoring, not selected from results.

## Fixed .45 versus .50: common-four descriptive changes

|Seed|Size|Recall@10 delta|NDCG@10 delta|
|---|---:|---:|---:|
|38871|60|0.000000|+0.050747|
|38871|1000|0.000000|+0.004271|
|38871|2000|+0.027778|+0.024850|
|38872|60|0.000000|+0.037068|
|38872|1000|+0.027778|+0.039683|
|38872|2000|+0.027778|+0.033867|
|38873|60|+0.055556|+0.038564|
|38873|1000|+0.083333|+0.038177|
|38873|2000|+0.083333|+0.027851|

[All 63 common-four rows](</Users/t1000/development/magda/search-relevance-eval/threshold/results/descriptive-common-four.csv>) include absolute scores, paired deltas, explicit full-six nulls, exact displacement counts and local p95 groups. Recall uses all validated useful IDs; NDCG uses full-corpus IDCG at the matched size. These descriptive improvements do not validate the original full-six primary.

C-bound full-six grade-assignment sensitivities at size2000 give .45 Recall deltas +0.018519/+0.092593/+0.055556 across seeds38871/72/73; these intervals happen to coincide in recall, but remain **assumption-dependent bounds, not point truth**. NDCG delta intervals are [+.019769,+.028446], [+.051059,+.056429], [+.013028,+.016064]. [All 63 sensitivity rows](</Users/t1000/development/magda/search-relevance-eval/threshold/results/full-six-sensitivity-bounds.csv>) retain the two/four plausible scenarios per seed and full IDCG recomputation.

## Costs and exact identity

For the eight fully labeled heldout negative queries, mean new grade0 top10 exposures at .45 are:

|Seed|60|1000|2000|
|---|---:|---:|---:|
|38871|0.375|1.875|2.625|
|38872|0|2.250|2.500|
|38873|0|1.125|1.375|

The registered incremental mean limit is0.25/query. Growth cases reach up to ten new grade0 IDs in a single negative-query top10. [All-class incremental FP tables](</Users/t1000/development/magda/search-relevance-eval/threshold/results/false-positive-incremental.csv>) retain point nulls for U-affected semantic queries, separate known-grade0 observations and their denominators, and both systems' absolute counts. Grade1 and U are not false positives.

At .45, NEW critical query tx01a displaces target t049 from rank1 to2 in seed38871 at **all three sizes**. This is a DEV exact control deliberately protected in held confirmation too. Its .50 target/module scores tie in returned order, and t051 is also the original nonconformant component-title fixture: this is conditional descriptive engineering evidence, not a fully validated production-risk estimate. Lower-threshold promotion of an already keyword-eligible module is not new full eligibility. [All63 exact profile rows](</Users/t1000/development/magda/search-relevance-eval/threshold/results/exact-window-censored.csv>) report all twelve controls, top1 and **MRR@10/window-censored**; an absent target is not assigned rank11.

Legacy .45 independently displaces x04 1→10 and x07 1→4 in seed39031; x07 3→8 and x12 1→2 in seed39033. A new wrong ID b023 ranks1 ahead of the unobserved b024 target for x21/39031. Full per-target events are in the immutable report. Good aggregate exact metrics cannot average these cases away.

## Full eligibility attribution, not top10-only inference

[Measured full-eligibility attribution](</Users/t1000/development/magda/search-relevance-eval/threshold/results/new-full-eligibility-attribution.csv>) distinguishes native potential eligibility, actual full-window engine admission and top10 promotion, by query kind/split. Completeness is available with zero missing rows; approximate Faiss full-window probes are not exact-vector-recall oracles.

Across all HELD query kinds, .45's new known-grade0 top10 exposures by size are6/45/58 for seed38871,1/45/47 for38872,0/41/50 for38873. Most are already-keyword-eligible promotions: all events in seeds38871/73, and1/40/42 in38872. Seed38872 has five keyword-FALSE newly admitted top10 IDs at each growth size; full hybrid new admissions are five/seven, respectively. Every new top10 grade0 event is an observed root-vector member and none is an observed nested-vector member. These are overlapping measured-path facts, not invented branch-local relevance labels. Exact-query exposures are included in these all-held totals and must not be misreported as semantic-only FP rates. Already-keyword eligibility does **not** excuse new topK exposure.

## Legacy and performance limitations

[Legacy24 profile rows](</Users/t1000/development/magda/search-relevance-eval/threshold/results/legacy-fourteen-profiles.csv>) retain all seven radial profiles plus separately labeled top-k, across the three inherited seeds. The prebound fourteen resolved semantic/functional families span both splits; this does not validate the original eight-family primary. At .45, their NDCG paired deltas are −.012354/−.009401/−.000370 and Success@5 deltas −.023810/−.023810/0. The Success guard therefore fails the first two seeds. [Existing paired contrasts](</Users/t1000/development/magda/search-relevance-eval/threshold/results/legacy-fourteen-descriptive.csv>) omit baseline and include top-k explicitly; they are not an absolute-profile table.

All .45 local warmed p95 guards pass in the nine seed/size cells and three registered groups (semantic180, positive270, negatives120 samples). Held exact90 has descriptive p95 only. Repeats, paraphrases, seeds and generated archetype replicas are correlated—not independent statistical proof or production latency. Role timings were captured later than matched primary runs and have an additional capture-phase confound.

Native plots concern unboosted engine-exact L2 document-vector scores, not raw combined hybrid scores or cosine cutoffs. Root boost50, child implicit1 and lexical/quality functions are unchanged. Equality-boundary behavior, approximate/quantized retrieval and lack of independently verified upstream model revision remain explicit limitations. Closed raw correctness fixtures passing is not full all-threshold live OPA coverage. REAL494 remains unjudged observations, never zero-labeled relevance or exhaustive recall.

## Four fixed role diagnostics and exact evidence-bearing scope

[Four-role report](</Users/t1000/development/magda/search-relevance-eval/threshold/results/role-analysis.json>) completed with no completeness problems. [All36 common-four role rows](</Users/t1000/development/magda/search-relevance-eval/threshold/results/role-common-four.csv>) retain all four fixed pairs at every seed/size. At size2000, root-only(.45,.50) reproduces uniform(.45,.45)'s Recall/NDCG deltas in all seeds: +.027778/+.024850, +.027778/+.033867, +.083333/+.027851. Nested-only(.50,.45) has zero common-four Recall/NDCG change in these cells. Root-only also reproduces the conditional tx01a displacement in all three sizes; nested-only has no exact displacement events. This is a mechanistic fixed-pair observation, not selection of another primary candidate. Mixed full-window engine eligibility and KW causal admission were not collected and are not inferred from top10 or exact-vector geometry.

[Exact-scope opportunity details](</Users/t1000/development/magda/search-relevance-eval/threshold/results/evidence-scope-opportunity.csv>) retain54 held pairs×three seeds. Known useful and independently certified scope scores are available for52/52/51; scopedU remains unavailable. Evidence-bearing broad/narrow counts are31/12,41/25,40/31. Certified nested scope counts are17/17/18; the chosen actual child's score equals the max-child score for every certified nested pair in this capture, with zero band/narrow flips. Larger proxy counts include uncertified U observations and are not certified coverage. The locked analyzer's original coarse opportunity counts can also be triggered by a different, non-evidence-bearing branch; the narrower auxiliary table is the source for same-evidence-scope reporting. Original strict adequacy remains uncertified/false in every seed; the frozen54 is not reduced to the available numeric denominator.

## Processing provenance

Raw capture was not rerun for analysis. Adapter attempt1 was cancelled for duplicate large-payload resource use before outputs; streamed/deduplicated attempt2 preserved the same raw hashes and used a new output directory. Frozen CLI attempt1 failed on duplicate top-level uncertainty transport; the explicit wrapper removes only the exact policy-identical auxiliary key, keeping evidence/policy/U unchanged. Primary attempt2 completed exit0. Role attempt1 failed before output because sensitivity received raw query rows without intent target fields; the one-line helper correction passes the already merged original query map, matching the primary analyzer. First logs remain retained. The locked analyzer, vectors, queries, grades, thresholds and captured engine requests were not edited or rerun.
