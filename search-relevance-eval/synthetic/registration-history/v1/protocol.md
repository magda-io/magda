# Synthetic hybrid relevance preregistration — #3903 v1

This is a controlled engineering benchmark, not production-representative relevance, human relevance truth, or permission to deploy a ranking change. Design author A has not seen any system scores or corpus realization. Ticket: <https://github.com/magda-io/magda/issues/3903>. Complements #3901; does not close #3885.

## Source, ownership and hard stop

Stack evaluation-only work on unmerged PR #3902 commit `15533246`, itself based on post-#3900 main `ba18156201c50565c85c62f76469245925994ece`. No production ranking/index-version/service changes. Reuse inherited acquisition-independent metrics, actual production query-builder export, real-engine and authorization regressions. Never call a public catalogue or write to production/dev.magda.io; disposable local OpenSearch only.

**No generator start until main independently validates and SHA-256 hashes all seven architecture files**, including every target query, rule, seed, stable ID, record requirement and grade matrix. File names relative to this directory: `protocol.md`, `intents.jsonl`, `query-spec.jsonl`, `generation-spec.json`, `relevance-rubric.md`, `decision-gates.json`, `architect-notes.md`. A's handback hashes are a cross-check, not launch authorization. Main writes the external freeze manifest and explicitly releases B. The manifest must bind source commit, exact file bytes, creation time and acknowledgement. No self-referential hash belongs inside a hashed file.

B generates metadata only from these frozen requirements. C independently audits actual searchable text, without rankings, for ALL grade-3 anchors, ALL named hard negatives, and complete rule coverage for every query–record pair. D implements/export/searches, without changing ground truth. E analyzes frozen outcomes without generating or tuning. B/C/D/E require separate fresh contexts (same model-family correlation must be disclosed). An offline plan-construction script is NOT corpus generation; the registered plans contain conceptual requirements, not searchable dataset descriptions.

## Frozen population and identities

Per seed, ONE joint corpus of **180 datasets**: A exactly100 (20 cocoa,50 confectionery,30 chocolate-flavoured beverage), B exactly80. Each system searches all180, so the other suite is a distractor; metric cohorts remain separate. Three separate seed indexes use the SAME IDs `a001`–`a100`, `b001`–`b080`. No seed suffix, index prefix, random UUID remapping or corpus deduplication. Seeds39031,39032,39033 are independent prose/length/completeness/distribution/publisher realizations with identical canonical relevance facts, exact identities, alias policies, identifier scope and intended grades. Report insufficient realization variation rather than selecting a favorable seed.

The explicit180-object `record_plans` array freezes every ID, suite/domain/family, product, process, facts, constraints, distribution evidence and hard-negative/anchor references. `canonical_claims` contains structured evidence requirements, not answer-key text for indexing. The generator may choose fluent prose; it may not add relevant unplanned claims, erase constraints, copy labels, use repeated category title prefixes, or change the category allocation. Cocoa-domain contrast records stay about cocoa, confectionery contrasts stay related to confectionery, and beverage contrasts stay chocolate-flavoured beverages. Domain is an allocation label, never a relevance rule.

## Frozen query inventory

75 query rows /45 independent intent definitions:

* A12 semantic families ×3 paraphrases =36 queries. Whole-family development: s01,s02,s05,s10. Heldout: s03,s04,s06,s07,s08,s09,s11,s12 (24 queries). No family split across partitions.
* B24 exact controls, each a distinct lookup intent x01–x24;10 shoe-identity queries development,14 other exact controls heldout. Shoe aliases/components/versions share one development split group; each other confusable cluster remains heldout. All24 remain exact-regression guards even when development.
* B3 separately graded functional families ×3 =9 queries. f01 development; f02,f03 heldout. Do not pool functional NDCG with exact accuracy or primary A NDCG.
* d01–d04 are exploratory `drink`, `dessert`, `plant`, `storage`, using multiple defensible meanings and explicit graded maps. Diagnostic only, not heldout promotion tasks.
* n01,n02 are known-no-answer conjunction diagnostics. Their IDCG is zero/undefined: no ordinary NDCG=0, Success=0 or absent-result ranking win. Report returned claims/mismatches and whether purported answers falsely imply missing facts.

All target text and grade criteria are frozen BEFORE metadata. Third paraphrases deliberately contain designated synonym tokens absent, case-insensitive whole-token, from EVERY searchable field of grade>=2 positives. Other overlapping terms are allowed. Label these vocabulary-mismatch controls, not claims of universal lexical disjointness. Hard negatives include milk-chocolate bars versus chocolate-milk drinks, seedling crop versus factory plant, bean versus beverage fermentation, dessert versus beverage powder, and correct-content PDF-only versus requested CSV.

`query-spec` uses inherited `id`, `query`, `category`, `split`, `intent`, `success_criteria`, plus `intent_id`, `suite`, `kind`. Each query's grade for each of180 IDs is exactly `generation-spec.intent_doc_grades[query.intent_id][record.id]`. All13,500 pairs are therefore frozen; absent keys are errors, not implicit zero. No category-default labeling, retrieved-pool-only IDCG, or judging based on whichever system wins.

## Exact controls and analyzer realism

Targets and deliberate collision IDs are explicit per query. RUN-X120, run-x120 and RUNX120 deliberately navigate to b001, one SKU; RUN-XI20, RUN-X12O, RUN-X1200, other model/prefix/version, sole and lace are different identities. A component is not interchangeable with the parent shoe. `near_identifier_ids` are the only registered collision negatives for collision-error counts; other non-targets remain irrelevant but are not automatically identifier collisions. Exact title/acronym/part/version/distribution-only/title-only controls are included.

Identifier strings in planned exact-title/identity requirements are necessary controlled lexical fixtures, not generated corpus prose. The registered b027/b028 identifiers may occur ONLY in nested distributions, b029/b030 ONLY in dataset titles. Do not re-copy them into queryContext, keywords, description, publisher or embedding input via a convenience concatenation that violates scope. Dataset structural IDs remain identifiers, never label-bearing search text.

Validate actual production analyzers and the mapped text fields using local `_analyze`/mapping/export evidence BEFORE retrieval. Do not invent a keyword equality field, exact-match operator or query rewrite. If case/hyphen/zero/O/one/I tokenize similarly, preserve frozen targets and report that lexical precision limitation; do not change expectations after ranking. Candidate normalization must preserve result inclusion, nested distribution matching/inner hits and facet behavior, not merely score arithmetic.

## Systems and controlled execution

Exactly8 preregistered systems; weight order keyword/vector:

| ID | Fusion | Root dataset-vector boost |
|---|---|---:|
| baseline | production raw fusion, pipeline ineffective |50|
| raw_boost1 | exact baseline except removing ONLY root dataset-vector boost50 |1|
| candidate_03_07 | top-level normalized min-max, .3/.7 |1|
| candidate_05_05 | normalized .5/.5 |1|
| candidate_07_03 | normalized .7/.3 |1|
| candidate_keep50_03_07 | normalized .3/.7 |50|
| keyword | keyword-only control |n/a|
| vector | vector-only control |1|

No new tuning on development or heldout. Primary candidate fixed .3/.7; other weights are sensitivity, not outcome-selected replacements. Separate matched-boost effects: candidate_03_07 minus raw_boost1; candidate_keep50_03_07 minus baseline; raw_boost1 minus baseline measures boost removal. Primary candidate minus baseline is a compound intervention; never attribute it entirely to normalization.

Use OpenSearch2.19.1, one shard/zero replicas, production mapping/analyzers, pinned source and actual production query builder. Embedding image/model/dimension and revision limitation are specified in generation-spec; hash exact image/runtime artifacts, embedding inputs and generated vectors. Identical corpus, vectors, query text, filters, permissions, mappings and depth for every system within each seed. Main relevance export uses production radial minScore0.5 and distinct top10 results. Top-k k=1 is secondary correctness only, not promotion evidence. Freeze effective runtime settings and raw exported requests before search; unsupported environment means C/not-run, not a silent fallback.

Prove normalization execution using synthetic numerical/ranking probes and weight-reversal evidence; configuring a pipeline is insufficient. Neutral, scoring-quality and generic-spatial probes must describe where factors act relative to normalization. Report keyword-branch quality/region contributions before normalization, and whether vector-branch scoring excludes them; moving them outside fusion changes semantics. Do not hide non-equivalent nested distribution, queryContext, filters, inner-hits or facets in a ranking result. Quality/spatial stress results are separate from the neutral main cohort; any unimplemented probe is explicitly not-run and blocks a correctness-pass assertion.

## Validation, amendment and search gate

Before retrieval C verifies no false positives/contradictions, every canonical claim and grade rule, fixed exact identity and scope, no duplicates, label leakage, repeated title templates, and independent seed variation. For every3 anchor cite actual field path and phrase. For every named near-miss state the product/process/fact/format mismatch, with text evidence. All other positive/partial/tangential/zero rules need coverage too; auditing only anchors is insufficient. Each scored positive query must have independently verified grade3 (at minimum grade>=2, but loss of all3 requires documented pre-run amendment); each exact lookup must contain its known authoritative ID. Planned matrices alone do not establish answerability.

C may identify repairs BEFORE search, but cannot silently edit architecture truth. Preserve previous hashes, proposed change, rationale, evidence and affected IDs/query pairs in an amendment log; main and A approve/re-freeze any changed specification or expectation, regenerate affected fixtures and re-audit. Generated text may be corrected to satisfy unchanged frozen claims, but its content hash and audit change. Freeze all three corpora, full qrels, evidence/answerability manifest and vectors before D starts any relevance retrieval. Unresolved content is `U`, never0; primary recommendation cannot pass on an unresolved heldout/critical pair. No query, label, fixture, weight or seed repair after scores are visible. Record a new separately preregistered experiment if repair is essential.

## Metrics, latency and decision

Reuse inherited gain `2^grade-1`, logarithmic discount, Success@5 and objective rank metrics. Full frozen/audited joint-corpus qrels define IDCG, not pooled hits only. For A average three paraphrases within each family, then equally across8 heldout families PER SEED. Report development separately, family/query/seed detail, grade>=2 and grade>=3 Success@5, paired wins/ties/losses, exact target rank/top1/MRR@10/Success@5, explicit near-identifier collisions, B functional NDCG separately and ambiguity/noanswer diagnostics separately. Preserve result hashes, top10 cases and field-level failures (semantic retrieval, analyzer, vector recall, fusion or candidate truncation). Rank ties use actual returned engine order; no target-aware tie breaking. Missing target rank is infinity, reciprocal rank0; duplicates fail correctness.

Latency: one unmeasured warmup followed by five measured repetitions per query, interleaved systems with a frozen schedule, same client/concurrency/index state; exclude embedding/generation. Primary p95 gate uses the SAME combined heldout positive set (24 A semantic +14 exact +6 functional =44 queries,220 samples/system/seed), excluding development and diagnostics. Compute median and inherited linear-interpolated p95 at sorted index (n-1)×0.95; the deterministic interleaving schedule rotates systems by SHA(query_id) with repetition offset. Suite-specific p95 only with>=100 observations (A120,B100); otherwise state undefined, do not invent samples. Preserve per-request timing; warmed-local latency is not production latency.

Machine-readable decision-gates is authoritative. A requires >=+.05 absolute primary heldout-family NDCG improvement in EACH of3 seeds, no exact top1 loss or ANY critical-target rank displacement in any seed, full correctness, and p95<=max(1.5×baseline_p95,baseline_p95+25ms) in each seed. B requires consistent raw superiority under the symmetric registered bar and safe comparability; otherwise C, including mixed, weak, incomplete or seed-sensitive evidence. A/B/C are controlled-engineering conclusions only; no production promotion/merge or closure of #3885 follows automatically.
