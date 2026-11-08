# Independent actual-results audit

**Forced D; nonpromotional.** Raw calculations were saved before inspecting the primary analyst's result tables. No new model/engine requests, labels, cutoff choices, reranking or production edits were made.

- [Audit status and source hashes](<search-relevance-eval/threshold/results/independent-results-audit.json>)
- [Frozen independently recomputed subset](<search-relevance-eval/threshold/results/independent-checked-subset.jsonl>): 1,872 query/system/case rows, including every NEW and inherited exact authority target.
- [Independent FP and full-membership checks](<search-relevance-eval/threshold/results/independent-fp-checks.jsonl>): 2,592 rows, including all NEW semantic and validated-negative queries.
- [Ledger and unique-pair closure](<search-relevance-eval/threshold/results/independent-ledger-closure.json>): 70,620 timed requests; all 6,420 run latency arrays/final rankings match receipts; no overlapping timed intervals; all native pair inventories close.
- [Offline audit source](<search-relevance-eval/threshold/result_audit.py>) and [four invented formula/parser tests](<search-relevance-eval/threshold/test_result_audit.py>).

The semantic subset was specified before outcome inspection: t04p1/t05p1/t06p1/t07p1, plus t03p3 at all seeds/sizes and t08p1–p3 at seed38873/all sizes. All eight systems are included; topk remains diagnostic. Original ranks and full same-level qrels are used. Any full-query U suppresses graded point metrics even if unreturned; known-only IDCG/FP observations are explicitly descriptive.

Verified source counts: NEW459,000 qrels include21 scored U and18,360 intentional-ambiguity U; legacy40,500 retain all12 original U identities and40,488 numeric grades. All110,160 NEW negative-query pairs are numeric0. The10,584 NEW grade1 pairs remain in full IDCG and are not FP.

The raw source subset contains58 exact guard events, including12 diagnostic-topk events; these are factual blocker observations, not an A/B/C decision. New grade0 exposure uses same-K ID set difference, not net counts:514 rows have equal absolute top10 FP totals but new grade0 IDs. Across query×seed×size×system events (not independent records or repetitions),2,060 known-grade0 entrants are KW-eligible rank promotions already in baseline full hybrid membership;187 are KW-false newly observed hybrid admissions.985 topk entrant events have no matching full-topk membership evidence and stay attribution-unavailable. U-affected query totals remain null, despite known individual grade0 observations.

Policy sealing precedes target preparation; DEV's last request precedes immutable NONE, which precedes the first held request and all geometry diagnostics. Source-bound operational order is checked, not inferred from favorable metrics. Current raw audit is complete; primary-analyst comparison status is recorded separately in the JSON audit and must not be assumed passed until explicitly updated.

Native geometry was streamed rather than loaded wholesale:440,640 parent pairs and876,096 authorized child scores close against9,180 source inventory rows, and3,024 primary membership rows have zero primary-subset misses. Exact native L2 scores and approximate SQ/fp16/HNSW window membership are distinct from each other and from boosted raw-fusion scores. No exact-oracle or independently graded child-utility claim follows.

This audit does not repair failed original conformance, certify future strict A/B/C paths, establish population relevance, or authorize a default change. The primary analyst owns the full analysis; this is an independent scoped verification only.
