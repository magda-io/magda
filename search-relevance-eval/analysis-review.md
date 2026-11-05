# Independent analysis review — pilot #3901

## Status and independence boundary

**Interim objective audit; recommendation ceiling C (inconclusive).** This review
was requested after the pilot execution. The reviewer originally authored the
pre-run methodology without ranking exposure, and is now explicitly reassigned
as an **unblinded analyst**, not a relevance judge. At this review stage the
reviewer read frozen tasks, restricted identity anchors, operational artifacts,
and raw ranking/latency files. **No judge outputs were inspected and no relevance
grades were assigned.** Ranking changes below are not evidence of improvement.
Only this review document was written during this audit. No public requests,
runner changes, production changes or new search executions were made.

Inputs include [registration](<results/pilot/registration.json>),
[freeze manifest](<results/pilot/freeze-manifest.json>),
[execution audit](<results/pilot/execution-audit.json>),
[expansion decision](<results/pilot/expansion-decision.json>),
[frozen queries](<queries.jsonl>),
[restricted anchors](<anchors.jsonl>),
[operational results](<results/pilot/operational.json>),
[operational summary](<results/pilot/operational-summary.json>),
[published rankings](<results/pilot/rankings.jsonl>), and
local raw [development runs](<.local/development-runs.jsonl>) /
[held-out runs](<.local/heldout-runs.jsonl>).
Local files are audit inputs, not promised committed deliverables.

## Independent checks performed

A separate Python calculation parsed the raw records and recomputed the results,
without calling the runner's operational summary function. The checks passed:

- Exactly **105 unique query/system records**: all 15 queries crossed with all
  seven registered systems; 35 development and 70 held-out records.
- Frozen query and anchor SHA256 values match registration. Operational input
  hashes and all five raw/config hashes in the execution audit match current
  files. Published rankings match raw IDs, ranks, scores, configurations, total
  hits and measured sample arrays for every record. Ranks are consecutive,
  dataset IDs are unique within each list, and each list has at most ten hits.
- Exactly ten finite nonnegative measured latency samples per query/system:
  **1,050 total**, including 50 development and 100 held-out per configuration.
  This checks retained measurements, not the wall-clock provenance of warmups.
- Every retained `ranking_score_variants` array has one digest. This supports
  **runner-reported** stability of IDs/scores over ten repetitions. Individual
  repeated result bodies are not retained in these aggregate run files, so the
  reviewer cannot independently reconstruct all ten digests from raw responses.
- For **60/60 candidate/query comparisons** (four candidates × 15 queries),
  total-hit objects and facet/count structures match baseline. The independent
  facet projection removed `topHits`/`hits` representative documents but retained
  bucket keys, counts, date extrema and other aggregate values. This establishes
  equivalence on these requests, not general facet/filter correctness.

Most freeze hashes remain unchanged, including protocol, queries, anchors,
registration, runner, export and environment. The evaluator implementation hash
now differs from the original freeze. The parent reports a correction for
zero-IDCG handling; that implementation change needs a separately hashed,
explained post-freeze amendment and regression tests, not an overwritten original
freeze or a claim that every executed analysis implementation was frozen.

## Objective lookup controls

The restricted manifest has **three exact record-identity controls only**.
Independent ID equality in the raw lists gives:

| Task | Split | Baseline | All four candidates | Keyword | Vector |
| --- | --- | ---: | ---: | ---: | ---: |
| q01 exact title | Development | 1 | 1 | 1 | 1 |
| q06 exact identifier | Held-out | 1 | 1 | 1 | Not retrieved |
| q07 exact title | Held-out | 1 | 1 | 1 | 1 |

Cells are first successful ranks. Baseline, candidates and keyword therefore
have **held-out Success@5 = 1 and MRR@10 = 1 on two identity tasks**. Vector-only
has 0.5 for both. The vector-only q06 list is empty; vector-only q05 is also
empty. These are retained zero-hit outcomes, not missing records.

**Scope limitation:** this does not establish discovery quality or complete
objective format coverage. The protocol calls for independent format predicates
for format tasks, but q04 and q12 have no entries in the inspected restricted
anchor manifest. Their detailed frozen task criteria are not a completed
machine-checked evidence manifest. Do not infer objective Success/MRR eligibility
from a judge's grade. If no separately frozen format predicate/evidence record
exists, disclose this uncompleted control rather than inventing an anchor after
seeing the rankings. Other local authorization/normalization fixtures have not
been independently re-executed in this review.

## Ranking movement, not relevance improvement

| Comparison against baseline | Mean top10 set Jaccard, 15 tasks | Changed rank-1 IDs |
| --- | ---: | ---: |
| Primary normalized 0.3/0.7 | 0.587403 | 9 |
| Normalized 0.5/0.5 | 0.638331 | 7 |
| Normalized 0.7/0.3 | 0.692791 | 2 |
| Normalized 0.3/0.7, boost50 retained | 0.603556 | 9 |
| Keyword only | 1.000000 | 0 |
| Vector only | 0.122798 | 12 |

For the primary candidate, leaders change on q02, q03, q04, q08, q10, q11, q12,
q14 and q15. These nine changes cannot be called wins before blinded judgments.

**Important distinction:** baseline and keyword have identical top10 **sets on
15/15**, but identical **ordered lists on only 7/15**. Their orders differ on
q01, q08, q09, q11, q12, q13, q14 and q15. Leaders are identical on all 15.
Therefore it is incorrect to claim that baseline and keyword rankings are
identical or that vector contributions had no reranking effect. Weight variants
are registered sensitivities, not candidates to select by held-out performance.

The primary candidate removes dataset-vector boost50 as well as changing fusion.
Its contrast is a compound intervention; the retained-boost sensitivity helps
separate entity-weighting effects but does not by itself remove every quality,
geographic or query-tree semantic difference.

## Independently recomputed local latency

Percentiles use linear interpolation at `(n-1) × 0.95`; medians pool the ten
measurements per task within the frozen split.

| Split / configuration | Requests | Median ms | Empirical p95 ms |
| --- | ---: | ---: | ---: |
| Development baseline | 50 | 58.2644 | Omitted (<100) |
| Development primary candidate | 50 | 61.6978 | Omitted (<100) |
| Held-out baseline | 100 | 55.7602 | 65.4743 |
| Held-out primary candidate | 100 | 63.0819 | 71.0148 |

All seven configurations' recomputed medians/p95 values match the operational
summary. The registered held-out guard is
`candidate p95 <= max(1.5 × baseline p95, baseline p95 + 25 ms)`.
The computed budget is **98.2115 ms**, so the primary candidate **passes this
local descriptive guard**. Its empirical held-out p95 is 5.5405 ms (8.46%) above
baseline. Passing a permissive guard is not evidence of equal speed.

These are warmed local OpenSearch HTTP retrieval timings, excluding embeddings
and public API/network end-to-end latency. Ten repetitions of each of ten
held-out tasks are correlated, not 100 independent information needs. The
results do not establish a production SLA, cold-start behavior, throughput,
concurrency or tail reliability. Errors/timeouts must remain visible; this
review verifies that the retained records are complete and finite, not that a
separate transport log has no excluded failed attempt.

## Corpus, provenance and external-validity ceiling

The [feasibility manifest](<results/pilot/feasibility.json>)
reports 494 datasets and 1,892 distributions, from 500 preselected Registry
records; six missing indexed-ID lookups were skipped without replacement. Its
actual Registry inventory count is **113,117**, so 494 records represent
**0.4367%**, not a full-catalogue experiment. Registry pagination is not a
transactional snapshot; inventory membership is not identical to Search-index
membership. Publisher-stratified oversampling and lookup retention alter IDF,
score ranges, publisher frequencies and candidate competition.

Publisher definitions must be precise: feasibility reports **319 publisher
objects including null**, **312 nonempty publisher names**, and **313 selected
Registry publishers**. These are not interchangeable counts of distinct
verified publishers. This review checked manifest values, not every external
source record or public inventory page.

Task provenance parses as eight constructed external questions and seven
catalogue-derived supplements (development 3/2; held-out 5/5). This satisfies the
pilot's numeric external-question source target, but none is an observed real
user log. External product-informed supplements remain explicitly selection-
biased; public-question construction is also author-selected, not representative
user sampling. Missing-answer tasks q14/q15 are frozen as **absence-unverified**;
failed retrieval or low relevance cannot establish absence from the corpus.

The [environment record](<results/pilot/environment.json>)
discloses unknown public OpenSearch/index/model configuration and excluded public
vectors. Locally pinned OpenSearch 2.19.1 and generated 768-dimensional model
vectors match the local systems to each other, not to the undisclosed public
production state. Corpus/task count precision cannot resolve that limitation.

The environment also discloses an initial readiness GET whose handler may ensure
a missing pipeline. This reviewer made no public calls and observes no evidence
of deliberate public mutation; however, it would overstate the evidence to claim
that possible public state change was independently excluded. Preserve that
caveat, alongside the acquisition utility's later read-only allowlist.

The recorded decision stops at 15 before held-out execution, rather than
expanding opportunistically to 40. This is appropriate given the external-
validity gaps and invalid initial development packets. The timing is a recorded
attestation, not independently proven by file hashes alone. Corrected-packet
reruns must remain distinguishable from invalid development outputs.

## Relevance analysis still pending

No relevance metric or agreement statistic is certified by this interim review.
Before final analysis, retain and check:

1. Two blind, independent initial assessments for every pooled pair; original
   raw observable outputs, exact inputs/prompts, model/version/settings and
   failures. Same-family judges are correlated, not human validation.
2. First-pass 5×5 agreement table including U; exact agreement and U rates;
   numeric-only quadratic-weighted kappa with its subset count and undefined
   cases. Consensus must not erase the original disagreements.
3. All conflicts/one-U pairs and objective-anchor conflicts reviewed blind;
   unresolved conflicts remain U. Complete the 10% agreed-pair common-mode audit,
   or explicitly record it as not completed; no midpoint pseudo-truth.
4. Primary NDCG uses original ranks, `2^grade-1` gains and shared pooled IDCG;
   U gain zero is an explicit computational convention, not factual irrelevance
   or a mathematical lower bound. **IDCG zero is undefined/null, never a tied zero
   that inflates coverage or win/tie counts.** Report excluded task identities.
5. Primary population is **eight held-out positive-intent tasks before any
   zero-IDCG exclusions**, not all ten held-out and never all 15. q14/q15 are
   separate missing-answer diagnostics. Development and optional all-task
   sensitivity must be labeled and not mixed into the primary mean.
6. Report original judge A/B, unresolved/U scenarios, changed-definition counts,
   binary-gain and duplicate-family sensitivities. The parent reports 494 strict
   normalized publisher/title families for 494 records; that has not been
   recomputed here. If confirmed, explain why this strict-family sensitivity is
   numerically identical, without claiming semantic near-duplicates are absent.
7. Give task-level paired differences, objective controls, category/provenance
   counts, top10 U exposure and pooled coverage. Any bootstrap is descriptive
   with this tiny task panel; no pilot significance claim or held-out weight
   winner selection. No zero-IDCG-based survivor mean without its denominator.

## Recommendation framework

**C remains the ceiling for a positive pilot outcome.** The pre-registered A
guardrails require a justified expanded stage and at least 20 defined positive-
intent held-out tasks; this pilot has only eight before unknown/zero-IDCG losses.
Even strong local agent-judged gains cannot meet that gate or establish production
representativeness. Objective correctness passes, ranking motion and a latency-
guard pass are engineering evidence, not human-validated relevance evidence.

A robust discovered local regression or semantic/correctness failure could
support **B (retain raw fusion)**; absence of verified generalization does not
prove baseline optimal. Otherwise report **C (inconclusive)** with concrete next
steps: broader immutable corpus with known compatible index/model settings,
independently checkable format/scope/access anchors, better independent/human
judging, and fresh pre-registered held-out needs before any architecture decision.
No production ranking changes are authorized by this evaluation.

## Final supplement — independent graded-results review

This supplement supersedes the earlier **pending relevance** status. The reviewer
was subsequently authorized to inspect completed original assessments,
adjudications and final metrics as an unblinded analyst. No new relevance grades
were assigned, configurations selected, or production files changed.
**Final independent recommendation: C — inconclusive.** This pilot establishes
engineering feasibility, but not an informative held-out relevance comparison.

### Artifact and computation verification

Inputs now include [graded results](<results/pilot/graded-results.json>),
[metric CSV](<results/pilot/graded-results.csv>),
[original judge A](<results/pilot/judge-A.jsonl>),
[original judge B](<results/pilot/judge-B.jsonl>),
[pair mapping](<results/pilot/pair-mapping.jsonl>),
[adjudication selection](<results/pilot/adjudication-selection.json>),
[adjudications](<results/pilot/adjudication.jsonl>) and
[adjudication summary](<results/pilot/adjudication-summary.json>).
The reviewer read scenario definitions in
[reporting code](<report_results.py#L68-L85>) to understand
its assumptions, but **independently recomputed all 945 scenario/query/system
NDCGs without importing that code or the evaluator**. All matched. Every
SHA256-listed original evidence input matched `evidence_files`; original records
need not be redundantly embedded in every derived file to remain auditable.

There are 213 unique pooled pairs, each with both initial judgments; no missing
initial records. Resolved grades are **208 zero, one grade 1, two grade 3, two U,
and no grade 2**. The grade-3 records are exact-title lookups q01/q07; the sole
grade-1 record is a development-only tangential lead q03. There are **no materially
useful (grade >=2) discovery-task pairs** in this pool. This is sampled-pool
evidence, not proof that no answers exist elsewhere in the catalogue.

### Agreement, unknowns and conflict audit

The independently reconstructed 5×5 table matches: 207 pairs are 0/0, one 1/1,
two 3/3, two U/U, and one U/0 (A/B). Exact five-category agreement is
**212/213 = 99.5305%**. Both-numeric agreement is 210/210; quadratic-weighted kappa
is **1.0 on n=210**. Explicit calculation gives observed weighted disagreement 0
and expected weighted disagreement 0.0198589065. Judge A has three U (1.4085%);
B has two (0.9390%).

The only conflict is q02,
`ds-sa-b26b9d5a-a4b2-4b3f-aae0-5640cb67c281`, a hydrogen-office annual report.
Adjudication resolves it to 0 from explicit publisher/subject evidence, not a
midpoint. All **22** selected pairs were reviewed: one conflict and **21/210 =
10%** of agreed numeric pairs. Independent set/count checks confirm complete
selected-pair coverage and no changed agreed grades. Two both-U pairs remain:
q06's deliberately redacted identity control and q05's insufficient hospital-
performance metadata. They were not silently converted to numeric negatives.

Initial assessors and adjudicators report the same model family/runtime label,
with generation parameters not exposed. Separate contexts and saved evidence
improve auditability, but **kappa 1 is not an accuracy estimate**. Near-universal
zeros and shared model behavior make agreement weak validation; the same-family
audit cannot exclude common-mode errors. These are agent judgments, not
human/domain-validated truth or an exactly replayable pinned-model experiment.

### Primary cohort and category coverage

Of eight positive-intent held-out tasks, only **q07** has positive adjudicated
pooled IDCG. Baseline and primary candidate therefore each have NDCG@10 **1.0 on
n=1**, paired difference 0, wins/ties/losses **0/1/0**. Seven tasks are **undefined,
not tied zeros**. The n=1 bootstrap [0,0] repeats one lookup; it does not establish
equivalence or low population uncertainty.

| Held-out category | Pre-designated tasks | Defined primary NDCG | Undefined IDs |
| --- | ---: | ---: | --- |
| Exact lookup | 2 | 1 | q06 |
| Natural-language discovery | 2 | 0 | q08, q09 |
| Vocabulary mismatch | 2 | 0 | q10, q11 |
| Distribution / format | 1 | 0 | q12 |
| Ambiguous competitors | 1 | 0 | q13 |
| Missing-answer diagnostics | 2 | Outside primary | q14, q15 also have zero pooled IDCG |

q06 is undefined for agent NDCG because identity was hidden from judges; its
**objective** identity check succeeds at rank 1. It is not a retrieval miss.
q08–q13 have all-zero pooled grades. That cannot distinguish sampling/collection
coverage, insufficient metadata, retrieval failures and shared grading errors.

Development has two defined tasks (q01/q03); q02/q04/q05 are undefined. Candidate
macro NDCG is 1 versus baseline 0.5, but the entire +0.5 comes from the one
**grade-1** q03 lead. A secondary all-15 mean on its three defined tasks would be
1 versus 2/3; mixing development with held-out does not add evaluation coverage.
Do not headline that as a held-out gain.

### Hand calculations and evidence-linked examples

**q03 — measured development win, tangential only.**
`ds-ditrdca-b1cca4ed-47bd-4d83-935c-e8bf1ae2e8eb` is absent from baseline top10
and candidate rank 1. Both grades are 1. The
[original evidence](<results/pilot/judge-A.jsonl#L201>) quotes
`description`: **“fatalities in road crashes in Australia involving heavy
vehicles”**, an underlying-data lead **“Australian Road Deaths Database”**, and
`format`: **“PDF”**. Requested 2019–23 pedestrian/cyclist/state counts and usable
data access are not demonstrated. The database-link phrase was independently
verified in retained raw metadata. This is not a materially useful answer.

There is exactly one positive qrel, grade 1:
`IDCG@10 = (2^1−1)/log2(2) = 1`. Baseline `DCG=0`, `NDCG=0`;
candidate `DCG=1`, `NDCG=1`. The dramatic normalized change is correct under
graded gain, but reflects a weak available ideal, not successful discovery.
Baseline's leader `ds-aodn-9793055C-334A-3FDF-E054-0010E056919A` is vessel
measurements, with distribution text **“Seawater Intake Temperature @1.9m Daily
Averages”**, graded 0. No numeric held-out losses are observed on defined tasks;
none should be invented for balance.

**q07 — exact-title held-out tie.**
`ds-dga-d0db4d0b-2a5e-4317-b738-e5956b728ac0` is rank 1 in both systems, grade 3.
Its [evidence](<results/pilot/judge-A.jsonl#L121>) quotes
`title`: **“Melton Pavilions and Clubrooms”**, and `description`: **“Pavilions and
Clubrooms in the City of Melton”**. It is the sole positive qrel:
`DCG = IDCG = (2^3−1)/log2(2) = 7`, hence both NDCGs are 1. Objective ID checks
independently verify this lookup, not general discovery quality.

**q11 — more topical leader, still fails the historical span.** Candidate leader
`ds-wa-b628afdc-4480-41e4-8c99-5aca2b0c8727` has judge-quoted `title`: **“High
resolution national high tide coastline history (DPIRD-094)”**, and `description`:
**“Australian six monthly high tides from 2015 to 2022”**. The dates were checked
in raw metadata. The task requires a series from around 1988 spanning >=20 years.
Baseline leader `ds-vic-7c3c835a-ebce-4cb1-a436-9a5ffa617b81` is vehicle-duty
rates. Both are graded 0. This is movement without a qualifying answer, not a
quantifiable NDCG win/loss/tie when pooled IDCG is zero.

**q12 — format/datum match cannot rescue wrong statistical units.** Candidate
leader `ds-dga-0257a9da-b558-4d86-a987-535c775cf8d8` is **“ACT Suburb/Locality
Boundaries - Geoscape Administrative Boundaries”**, with a `distributions.title`
containing **“Esri Shapefiles - GDA2020”**. This supports format/datum, not the
required 2021 Australian SA2 polygons/codes. Baseline leader
`ds-vic-3f918a57-41b8-47ec-a153-e07667a8185d` is described as **“Crown Land
Cadastral Area Boundary is an aspatial table”**, concerning Victoria's land
parcels. Both judges grade both 0; neither establishes success. The candidate's
GDA2020 text was independently checked in retained raw metadata.

Missing-answer leaders also remain unsuitable. For q14, candidate leader
`ds-dga-807b5d11-9f98-4c81-84dd-0b22d57c67eb` describes **“the Tasmanian public
health system”**, not WA LGA heart-failure readmissions. These negatives do not
validate the missing-answer hypotheses; corpus absence remains unverified.

### Sensitivity and coverage interpretation

All nine sensitivity views were independently reproduced. Every scenario retains
q07 on the common held-out cohort and yields a tie. Original judges, agreement,
adjudicated, numeric min/max and strict-family views give development +0.5 on two
defined tasks. **Binary gain >=2 makes q03 undefined**, leaving only q01's lookup
tie: development uplift is not robust evidence of materially useful retrieval.

U->3 newly defines **q06 held-out and q05 development**, not q12. They remain
explicit additional scenario populations, not hidden additions to primary means.
Assigning relevance to unknown metadata is an assumption, not a discovered answer.
The family file independently has 494 unique dataset IDs and 494 unique family
keys. Strict-family collapse thus has no numerical effect, without ruling out
semantic near-duplicates.

Resolved top10 U exposure for both baseline/candidate is 1/82 held-out hits
(1.2195%) and 1/50 development hits (2%); no pooled judgments are missing.
**Low U/high judged coverage do not repair relevance coverage:** most pairs are
supported negatives, leaving no held-out discovery qrels. A scenario sign that
never reverses on one exact lookup is vacuous robustness, not an architecture
result.

### Final decision and next evidence

**Choose C.** Retain production behavior while gathering evidence; this no-change
decision under uncertainty is not B's positive case for raw fusion as a superior
architecture. A is excluded by the expanded-stage/minimum-task guardrails and
lack of held-out discovery signal. The development tangent and topical leader
shifts are engineering diagnostics, not sufficient justification for a rewrite.

The local latency guard, identity checks and facet comparisons remain valid in
scope. The parent separately reports additional local format/auth fixture passes;
these differ from missing pre-frozen q04/q12 known-answer anchors and were not
independently re-executed here. Next work should repair corpus/task coverage and
establish compatible public index/model provenance, then obtain independent/human
validation and fresh pre-registered held-out needs. Do not tune weights or create
new confirmatory tasks from these exposed held-out results. No production
relevance, authorization or latency guarantee follows from this agent-judged
494-record pilot.
