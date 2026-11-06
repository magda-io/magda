# Preregistered independent synthetic-results analysis

This analysis is written before dataset generation or retrieval. No benchmark
has been executed by the analyst. It implements #3903, stacked on unmerged
#3902 at `15533246` (main reference `ba181562`). It is evaluation-only. The
analyst owns only this plan, the synthetic analyzer, and its offline tests;
results prose requires main's later approval. No dataset, query, grade, weight,
or generation changes may be made by this analyst after viewing outcomes.

## Ground truth and input boundary

- Grades are **synthetic design truth**, independently audited against actual
  searchable metadata before retrieval, not LLM/human A/B relevance judgments.
  There is no fabricated judge-A/judge-B or agreement/adjudication wrapper.
- Input queries have `id, query, intent_id, suite, kind, split,
  success_criteria`; exact queries additionally carry authoritative target IDs.
  Whole intent families stay in a single split. Ambiguous/no-answer queries
  have diagnostic split. Frozen `near_identifier_ids`, where available, classify
  collisions; absent that list, wrong-ID displacement is reported without an
  invented near-identifier label.
- Exhaustive qrels have `query_id,dataset_id,grade` with grade integer 0–3 or
  `U`. Every query covers the full joint 180-document corpus, including zero and
  U labels, not merely retrieved or pooled documents. Stable dataset IDs and
  unchanged labels apply across seeds 39031, 39032, 39033. Seed-specific qrels
  are accepted only when explicitly supplied, exhaustive, non-overlapping and
  independently frozen. The canonical frozen intent matrix is inherited by all
  paraphrases; the independent validator must audit actual evidence in all
  three corpora before execution.
- The final validation contract is `schema_version:1,status:passed,
  independent_validation:true,pre_retrieval:true,spec_freeze_sha256,
  query_spec_sha256,qrels_sha256,corpora:[{seed,path,sha256,dataset_count:180,
  record_ids_sha256,answerability_passed:true}],qrels_path,
  validation_evidence_sha256,unsupported_grade3_count:0,
  missing_positive_queries:[],exact_targets_missing:[]`. Paths are relative to
  the validation manifest's directory. CLI analysis verifies artifact hashes
  and actual corpus ID coverage. This binds evidence; it does not itself prove
  assessor independence. Main's execution approval independently binds the
  freeze and validator manifest before any search.
- Missing numeric qrels are never synthesized. Unknown retrieved IDs, duplicate
  hits/ranks, duplicate seed/system/query runs, malformed grades and incomplete
  full-corpus qrels fail validation. Missing runs are null, counted, and block
  promotion; an explicitly present empty ranking has zero DCG for a positive
  query. No-answer diagnostics never enter ordinary NDCG or Success means.

## Reuse, metric definitions, and aggregation

Use existing `evaluate.ndcg_at_k`, ranked-hit validation, means, percentile and
latency helpers, plus operational facet-count/difference helpers. This is a
synthetic input adapter and intent-family aggregation, not a second metric
framework. Do not route synthetic qrels through the prior pilot's pooled,
blinded A/B judgment machinery.

NDCG@10 uses gain `2**grade - 1`, logarithmic rank discount, original submitted
ranks, and **full-corpus numeric qrels** for IDCG. Retrieved U has assumed zero
gain at original rank; U is omitted from ideal ordering, not silently judged
irrelevant. This is assumption-dependent and not a guaranteed bound. Zero IDCG
is undefined/null, with coverage counts, never ordinary zero. All-U or no
verified useful answer in a semantic/functional task fails the pre-run
answerability gate. Unretrieved positives remain in IDCG. No condensed metric
replaces the primary score.

1. **Suite A primary:** held-out semantic queries only. First average each
   intent's paraphrases; then average the independent intent-family means
   equally, separately in each seed/system. Report NDCG@10 and Success@5 for
   grade >=2 and grade >=3. Development families remain a separate cohort.
   Query-weighted means are secondary and labeled, never the promotion metric.
2. **Suite B exact:** per-authoritative-ID rank, best target rank, top1,
   MRR@10 (zero beyond ten/absent), Success@5, wrong IDs preceding every accepted
   target, and frozen near-identifier collision IDs. Aggregate within each
   declared split; preserve every individual regression. If multiple IDs are
   authoritative, best-target metrics and the critical displacement guard accept
   any one; retain every target's rank for inspection. Exact metrics do not
   depend on graded NDCG.
3. **Suite B functional:** graded NDCG/Success, intent-first aggregation,
   separate from Suite A and exact lookups.
4. **Ambiguous:** graded diagnostic NDCG/Success, never a forced family winner
   or part of the primary score. Zero IDCG stays null.
5. **No answer:** returned-hit diagnostics and explicit exclusion; neither
   absence nor a zero-IDCG ranking is a relevance win.

Emit every query/intent/seed/system, full top-ten IDs/ranks/scores/grades, cohort
coverage, paired intent-family deltas, wins/ties/losses, and query-level wins,
ties and counterexample losses. A tie has absolute delta <=1e-12. Missing or
undefined paraphrases invalidate that intent's comparable mean, rather than
silently changing its paraphrase mix. Report all missing/undefined counts.
Field/token failure attribution needs later inspection of the actual frozen
metadata and query DSL; rankings alone do not establish a fusion/analyzer,
semantic recall, vector recall or candidate-truncation cause.

## Fixed systems and contrast labels

All eight systems remain fixed: `baseline` (raw boost50), `raw_boost1` (only the
dataset kNN boost removed, raw query structure preserved), `candidate_03_07`,
`candidate_05_05`, `candidate_07_03` (normalized boost1),
`candidate_keep50_03_07`, `keyword`, and `vector`.

- `normalization_matched_boost50`: baseline vs candidate retaining boost50.
- `normalization_matched_boost1`: raw_boost1 vs candidate_03_07.
- `remove_dataset_knn_boost_only`: baseline vs raw_boost1.
- `primary_combined_change`: baseline vs candidate_03_07, explicitly **not**
  normalization alone.
- Both other fixed-weight candidates vs baseline and vs candidate_03_07 are
  sensitivity contrasts, never opportunities to choose a held-out winner.
- Keyword/vector controls vs baseline remain visible in each query class.

The stable machine keys `normalization_matched_boost50` and
`normalization_matched_boost1` mean **matched-boost normalized-architecture
contrasts**, not a causal estimate of the normalization phase processor alone.
The candidate groups keyword evidence across root/child entities and vector
family evidence before normalization, whereas the raw baseline retains
per-entity nested hybrid queries under disMax. Query restructuring can therefore
change cross-entity fusion even when the dataset-vector boost is matched.
Neutral quality1 and neutral geography reduce primary placement confounds but
do not remove this architecture difference. Keep the preregistered eight
systems; do not add an outcome-selected raw-architecture control.

Report changes in facets, totals, nested matching/inner hits, quality/region
placement, actual normalization controls, permissions, and duplicate/result-set
checks from the runner's correctness evidence. Equal counts against baseline
are only diagnostic, not proof of independent correctness. Missing correctness
evidence is not green.

## Latency and frozen decision rule

Combined latency cohort is held-out positive-intent semantic, exact and
functional queries. Exclude diagnostics and explicit warmup requests. Require
explicit local-warmed scope, report client timing scope and repeat count, median
and p95 using existing linear-interpolation percentile helper. Suppress p95
below 100 samples. Repeats are correlated, not independent tasks; three seeds
share facts and are not three independently sampled relevance populations.
Suite-specific timing summaries have the same >=100 p95 rule. No significance
claim or naive query/seed independent bootstrap is made. Hierarchical
uncertainty is optional and not required to replace the per-seed gate.

**A** requires all three preregistered seeds to satisfy *every* condition:

- Complete eight-system runs, complete primary intent-family cohort, and mean
  held-out Suite A intent-family NDCG improvement >=+0.05 for
  candidate_03_07 against baseline.
- No individual exact-query top1 loss and no critical target displacement:
  the best authoritative target rank worsens against baseline (missing from
  top ten means infinity). All 24 exact queries, including development, are
  critical. Aggregate gains cannot compensate for individual precision failures.
- No unresolved U qrels; all missing/undefined coverage remains visible.
- All required correctness controls explicitly green for that seed.
- Local warmed combined-heldout p95 candidate <=
  `max(1.5 * baseline_p95, baseline_p95 + 25ms)`, with >=100 samples for both.

Consistent raw advantage >=0.05 in held-out intent-family NDCG in **all three**
complete/correct seeds with no reverse exact-query top1 or best-target rank
loss and no unresolved qrels supports **B**, for this controlled benchmark only.
Tiny, mixed-seed, incomplete, unsupported or otherwise unclear results are
**C**. Always retain precision/correctness/latency caveats, even for B. No
production ranking change, winner selection, or closure of #3885 follows from
this synthetic benchmark alone.

## Explicit pre-outcome supplementary exception: unresolved validation

Main authorized a separate **supplementary, nonpromotional replay** before any
benchmark embeddings, retrieval, or outcomes were available. Independent
validation found genuine unresolved interpretations of record a057 against
broad frozen s08 factory-process criteria and d03 `plant` diagnostic criteria.
Moving the record outside its frozen claim, narrowing queries, or forcing a
proposed grade would manufacture certainty. Original queries, criteria,
proposed grade matrix, record claims, eight systems and gates remain unchanged.
The original confirmatory validation has **failed**; its primary result is
unavailable. The pre-outcome scope is six seed/intent/document mask rows,
expanding to12 U pairs and40488 independently validated known pairs out of40500.

The default strict analyzer still rejects incomplete validation. The exception
requires both `--diagnostic-policy` and `--uncertainty-mask`, following main's
separate diagnostic contract. The independently audited document must have
`status: incomplete_diagnostic_only`, `full_validation_passed: false`,
`promotion_allowed: false`, `forced_recommendation: C`,
`known_qrels_match_frozen: true`, all540 record reviews and75 query-equivalence
reviews. It binds the original proposed qrels, all40500 seed-specific validated
qrels (known integers or literal U), uncertainty mask, independent evidence, and
all three actual corpus hashes. The separate pre-retrieval policy binds the
freeze, diagnostic document and mask and attests `no_outcomes_seen: true`.
Neither this policy nor analyst code changes any ground-truth grade.

Each uncertainty-mask row is `(seed,intent_id,dataset_id,reason[,evidence])` and
applies to **all** paraphrases of that intent. Every masked validated-qrel pair
must be literal U; every unmasked pair must equal the frozen grade. Unknowns
are never converted to zero, and missing mask or known-pair evidence is not an
implicit validation pass. Policy and mask must be finalized and hashed before
the first target-query embedding; no post-outcome label repair is permitted.

For any affected query, point NDCG and graded Success are **null** because the
full-corpus IDCG is unknown, even if the U record is not retrieved. An affected
exact query has no precision point inference either; fully validated exact
queries retain target rank, top1, MRR, Success and individual per-seed losses.
Ambiguous queries display returned IDs and known-relevant counts without a
fabricated graded point estimate. Unaffected family means may be reported only
as **descriptive known-family means with their actual count** (seven known
held-out families, not the frozen eight-family primary). The original
eight-family primary and its promotion delta are unavailable.

Sensitivity enumerates grades0/1/2/3 for each uncertainty unit, sharing each
assignment across its paraphrases and across all eight systems. Every scenario
recomputes **full-corpus IDCG and DCG consistently using the existing metric**;
U is not replaced in the validated qrels. Scenario scores and paired-delta
ranges are clearly assumption-dependent, not new labels, calibrated probability
bounds, primary estimates, or candidate-selection evidence. Enumeration has a
fixed4096-scenario per-seed/cohort safety cap. Above that cap the analyzer emits
an explicit not-enumerated reason and no invented approximate bounds or random
samples. One shared held-out intent/document unit gives four scenarios per
seed, not independent assignments to each paraphrase. The separate d03
ambiguity cohort also has four scenarios per seed; no uncertainty is averaged
into primary evidence.

This exception **always forces C**, including when every descriptive comparison
looks favorable, with `promotion_allowed: false` and the failed-confirmatory
reason retained. It can never produce A/B or justify production adoption. The
strict preregistered decision rule above remains unchanged for a genuinely
fully validated experiment; this incomplete experiment cannot satisfy it.

## Execution boundary

Only main may later supply approved frozen run files and authorize the results
report. Offline unit fixtures below are hand-calculated artificial metric
examples, not generated benchmark data or benchmark outcomes. Analyzer tests
must cover family weighting, per-seed regression, precision-critical cases,
missing/no-answer exclusion, ambiguity, U/unknown/zero-IDCG rules, full-qrels
IDCG and matched-boost contrast labels. Existing harness tests remain unchanged.
