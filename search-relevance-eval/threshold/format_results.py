#!/usr/bin/env python3
"""Format already computed tables; no search, scoring, selection or labeling."""
import csv
import json
from pathlib import Path
from statistics import mean

HERE = Path(__file__).resolve().parent
R = HERE / 'results'

def csvrows(name):
    with (R / name).open(newline='') as stream:
        return list(csv.DictReader(stream))

def link(name, label=None):
    return f'[{label or name}](<search-relevance-eval/threshold/results/{name}>)'

def fmt(value, signed=False):
    if value is None or value == '':
        return 'N/A'
    return format(float(value), '+.4f' if signed else '.4f')

def main():
    rows = csvrows('descriptive-common-four.csv')
    compact = json.loads((R / 'analysis-table-inputs.json').read_text())
    systems = [('ms_050', '.50'), ('ms_048', '.48'), ('ms_046', '.46'), ('ms_045', '**.45**'), ('ms_044', '.44'), ('ms_042', '.42'), ('ms_040', '.40'), ('topk10', 'top-k10 diagnostic')]
    lines = ['# Quantitative results — forced D, not production evidence', '',
        'All comparisons retain raw production fusion. Full six-family NEW held-out point metrics remain **N/A at every seed/size**, and original LEGACY eight-family primary validation remains **false**. The common-four population t04/t05/t06/t07 was fixed before embeddings; it is descriptive, not a replacement primary. Values below are fractions, not percentages. No held-out threshold was selected.', '',
        '## All profiles and catalogue growth', '',
        'Each cell is common-four Recall@10 / full-IDCG NDCG@10, equally averaged over the three correlated seeds. Per-seed values and every query remain available in the linked CSVs. Top-k is not a radial cutoff or candidate.', '',
        '| Profile | 60 records: R / NDCG | 1,000: R / NDCG | 2,000: R / NDCG |', '|---|---:|---:|---:|']
    for system, label in systems:
        cells = []
        for size in (60, 1000, 2000):
            if system != 'topk10':
                values = [x for x in rows if int(x['size']) == size and x['system'] == system]
            else:
                values = [x for x in compact['per_family'] if x['size'] == size and x['system'] == system and x['split'] == 'heldout' and x['intent_id'] in ('t04', 't05', 't06', 't07')]
            assert len(values) == (3 if system != 'topk10' else 12)
            cells.append(' / '.join(fmt(mean(float(x[m]) for x in values)) for m in ('recall_at_10_ge_2', 'ndcg_at_10')))
        lines.append('| ' + label + ' | ' + ' | '.join(cells) + ' |')
    lines += ['', 'Common-four Success@5 is unchanged at every radial profile: cross-seed means 0.9722 (60) and 0.8611 (both growth sizes). These ceiling-sensitive results do not establish improved first useful results.', '',
        '## Predeclared .45 versus .50, every seed/size', '',
        '| Seed | Records | Recall@10 .45 | Δ recall | NDCG@10 .45 | Δ NDCG | Success@5 .45 |', '|---:|---:|---:|---:|---:|---:|---:|']
    for x in rows:
        if x['system'] == 'ms_045':
            lines.append('| ' + ' | '.join([x['seed'], x['size'], fmt(x['recall_at_10_ge_2']), fmt(x['delta_recall_at_10_ge_2'], True), fmt(x['ndcg_at_10']), fmt(x['delta_ndcg_at_10'], True), fmt(x['success_at_5_ge_2'])]) + ' |')
    lines += ['', link('descriptive-common-four.csv', 'All 63 radial seed/size rows') + ' · ' + link('new-per-query.csv', 'Every NEW query') + ' · ' + link('new-per-family.csv', 'Every family'), '',
        'The conditional mean gain is not universal query improvement: seed38872 t04p2 loses 0.0963 NDCG at both growth levels and t05p3 loses 0.1445. At core60, seed38871 t07p3 exchanges known-useful t039 for t037 without increasing recall. ' + link('semantic-regressions.csv', 'All observed semantic regressions and useful-ID losses') + ' preserves unfavorable cases.', '',
        '### Recovered positives and unresolved labels', '',
        'At .45 the known-useful query/ID recoveries at 1,000 / 2,000 are: seed38871 **0 / 1** (none / t06); seed38872 **4 / 5** (t03/t06/t08 at both sizes); seed38873 **3 / 3** (t04 only). These are correlated occurrences, not independent datasets or net recall gains; lost useful IDs are retained separately. U is never resolved in these counts. ' + link('recovered-known-positives.csv', 'Recovered IDs') + '.', '',
        'Full-six shared-assignment sensitivity is reported, not substituted for validated point metrics. At 2,000, .45 ΔRecall is +0.0185 / +0.0926 / +0.0556 for seeds38871/38872/38873 under all allowed assignments; ΔNDCG ranges are [+.0198,+.0284] / [+.0511,+.0564] / [+.0130,+.0161]. These are assumption-dependent bounds, **not confidence intervals**. ' + link('full-six-sensitivity-bounds.csv', 'All seven profiles and all nine cases') + '.', '',
        '## Exact identifiers: every target, not best-target averages', '',
        'All 12 NEW critical queries, including DEV controls, are retained for exact safety. Ranks missing from the captured top10 are censored >10, not assigned an invented exact rank; MRR is **MRR@10**, not full-list MRR. ' + link('new-exact-all-targets.json', 'Every NEW authority rank') + ' and ' + link('exact-window-censored.csv', 'All radial exact aggregates') + '.', '',
        '- .45 displaces NEW authoritative t049 from rank1 to2 for query tx01a, seed38871, at **all three sizes**. At .50 logger and module initially tie at raw score619.23206; the returned order is logger then module. At .45 the module is667.4613 versus logger664.6873. Both were already keyword/full-hybrid eligible; this is a root-vector **promotion**, not a new match.',
        '- The corresponding stored-vector root scores are logger .4545584, near-ID logger .46989354 and module .48229095. Actual root memberships show the module entering at .48, before the correct logger enters at .45. Nested membership is false for all three in these comparisons. ' + link('exact-regression-mechanism.json', 'Captured mechanism') + '.',
        '- **Limitation:** the module t051 is also the record with the preserved preregistration/conformance contradiction. This NEW example is conditional descriptive evidence, not a validated standalone production-risk estimate. Its baseline tie is disclosed; no metadata was repaired after scores were seen.',
        '- Unchanged LEGACY controls separately show .45 target regressions: seed39031 x04 1→10 and x07 1→4; seed39033 x07 3→8 and x12 1→2. Seed39031 x21 newly places wrong-ID b023 at1 ahead of missing authoritative b024.',
        '- Across all radial alternatives: 22 NEW plus24 LEGACY exact guard events; separate top-k diagnostics contain8 NEW plus4 LEGACY events. Repeated growth cases are not independent failures. ' + link('independent-exact-event-comparison.json', 'Independent event-set verification') + '. The primary array has50 events because it includes4 LEGACY top-k events, whereas the full audit has58; neither total is an all-radial count.', '',
        '## False-positive exposure, keyword overlap and growth', '',
        'New exposure means candidate known-grade0 top-K ID set **minus baseline ID set at the same K**, not the net change in counts. Unchanged absolute counts can hide substantial replacement noise. Grade1 partial matches are not FP. Ambiguous fragments are never pooled into true no-answer queries.', '',
        '| NEW held-out validated negatives: .45 | 60: new grade0 @10/query | 1,000 | 2,000 |', '|---|---:|---:|---:|']
    fp = csvrows('false-positive-incremental.csv')
    for seed in (38871, 38872, 38873):
        selected = [next(x for x in fp if int(x['seed']) == seed and int(x['size']) == size and x['system'] == 'ms_045' and x['population'] == 'heldout_negative') for size in (60, 1000, 2000)]
        lines.append('| ' + str(seed) + ' | ' + ' | '.join(fmt(x['point_mean_new_grade0_top10']) for x in selected) + ' |')
    lines += ['', 'The frozen mean bound is .25 new grade0 IDs/query; every growth cell above exceeds it. Some individual growth queries acquire up to10 new irrelevant IDs. The unrelated and OR-lookalike negative populations remain separate in ' + link('false-positive-incremental.csv', 'all 252 profile/case/population rows') + '.', '',
        'Held-semantic .45 known-grade0 additions at core /1,000 /2,000 are seed38871 **2/23/20**, seed38872 **1/1/0**, seed38873 **0/20/25**. Complete semantic FP point means remain U-undefined; these are explicitly known-ID observations, not unknown-as-zero aggregate metrics.', '',
        'Actual full-window membership and keyword-OR probes distinguish admissions from rank promotions. At .45, most new NEW top10 known-grade0 exposure is **already keyword eligible**; seed38872 adds5 genuinely new KW-false top10 admissions at each growth level (held query kinds remain separate in the table). All newly exposed held grade0 IDs in this .45 diagnostic are observed root-vector members, none nested-vector members. Membership overlap is not forced into exclusive causal classes. ' + link('new-full-eligibility-attribution.csv', 'Complete NEW admission/overlap table') + '.', '',
        '### Unchanged inherited corpus: scopes must not be pooled', '',
        'Across all three LEGACY seeds, .45 results split as follows. Counts sum correlated query/seed/ID occurrences; they are not unique datasets.', '',
        '| Population | Cases | Baseline → candidate known0 @10 | New known0 IDs | KW promotions | KW-false new full-admission top10 IDs |', '|---|---:|---:|---:|---:|---:|',
        '| Positive intents, all15 families |135|773 →782|62|62|0|',
        '| Exact controls |72|438 →498|114|48|66|',
        '| True no-answer, n01/n02 |6|60 →60|5|5|0|',
        '| Ambiguous fragments, **diagnostic exposure only** |12|19 →11|1|0|1|', '',
        'The nonambiguous213-case total is181 new known0 IDs:115 KW promotions and66 observed new vector-only admissions. Do not misreport the mixed-scope225-case182 total as a no-answer FP statistic. Twelve original U labels remain U; no new U top10 ID appears at .45. ' + link('additional-eligibility-populations.json', 'Every profile, population and denominator') + ' · ' + link('additional-eligibility-query-causality.csv', 'All 1,680 inherited query/profile rows') + '.', '',
        'The fixed LEGACY14 known-family descriptive comparison shows .45 ΔNDCG −.0124/−.0094/−.0004 and ΔSuccess@5 −.0238/−.0238/0 across seeds39031/39032/39033. The Success@5 guard fails at the first two seeds. These14 families span both splits and **do not validate the original full eight held semantic families**. ' + link('legacy-fourteen-profiles.csv', 'All radial profiles plus separate top-k') + '.', '',
        'REAL494/15 remains unjudged for this supplementary admission diagnostic. Relative to .50, new full-hybrid admissions are 0/33/119/206/316/643/1138 across the seven cutoffs; at .45,21 new top10 IDs appear. These are **not FP counts**, and exhaustive recall is unavailable.', '',
        '## Root versus child mechanism', '',
        'The four fixed pairs are (.50,.50),(.45,.45),(.45,.50),(.50,.45), in dataset/child order. At 2,000, lowering only the root cutoff reproduces uniform .45 common-four recall/NDCG deltas at all seeds; lowering only the child cutoff changes neither metric at these three cases. The root-only diagnostic also reproduces tx01a displacement; child-only does not. These are mechanistic comparisons, never extra default candidates. Mixed-arm full KW/HNSW admission was not separately measured, and later mixed timing is phase-confounded versus earlier uniform captures. ' + link('role-common-four.csv', 'All 36 pair/case rows') + '.', '',
        'The54 fixed held/core60 opportunity pairs are never pruned to known-only denominators. Certified evidence-scope availability is52/52/51, with2/2/3 unknown pairs. Same-certified-scope broad/narrow opportunity counts are31/12,41/25,40/31 across seeds; narrow coverage is5/6/6 families. Original strict adequacy stays false at every seed. For all certified nested opportunities, the designated actual child score equals the maximum-child score here: zero observed band flips. Counts involving uncertified U remain unavailable, not assigned to the maximum child. ' + link('evidence-scope-opportunity.csv', 'Every fixed opportunity pair') + ' and ' + link('evidence-scope-opportunity-summary.csv', 'Source-scope summary') + '.', '',
        '## Native geometry and score-domain limits', '',
        '440,640 parent query/dataset pairs and876,096 authorized child scores cover all48 numeric NEW queries at every catalogue level. Nine fixed native calibrations pass (maximum observed error5.96e−8); none of3,024 full-window NEW collectors misses its primary top10 IDs. All1,920 inherited auxiliary requests complete with no subset discrepancy. These approximate SQfp16/HNSW membership windows are **not exact retrieval oracles**.', '',
        'For normalized stored vectors, exact L2 geometry is 1/(1+d²), approximately1/(3−2cos). Faiss/SQ/HNSW admission, nominal cutoff equality, and final boosted/fused scores are different domains. Root/child PDF and CDF condition on **dataset grade**, not independent child utility. A high topical score can belong to a grade1 partial match or grade0 wrong scope. The preserved equality-boundary failures prevent an inclusive-cutoff guarantee.', '',
        '![Root/child native-score CDF](<search-relevance-eval/threshold/results/figures-v2/native-score-cdf.svg>)', '',
        link('figures-v2/native-score-pdf.svg', 'Native PDF') + ' · ' + link('figures-v2/threshold-sweep.svg', 'All-threshold sweep') + ' · ' + link('figures-v2/negative-false-positives.svg', 'Negative-query exposure charts'), '',
        '## Latency and operational correctness', '',
        'All70,620 timed requests have complete receipts, zero timed failures and no overlaps;6,420 run latency arrays/final rankings match raw receipts. Ten measured repetitions plus one excluded warmup were captured per query/profile. Each NEW profile/case has180 held-semantic,270 combined held-positive and120 all-validated-negative measured observations; held-exact90 is descriptive only. Client elapsed and engine took remain separate. All .45 registered latency checks pass in all nine cases, **not** a production SLA claim. ' + link('latency.csv', 'Median/p95, sample counts and group eligibility') + ' · ' + link('registered-checks.csv', 'Every registered check, including failures and nulls') + '.', '',
        '![Threshold sweep](<search-relevance-eval/threshold/results/figures-v2/threshold-sweep.svg>)', '',
        '## Independent verification and recommendation', '',
        'An independent context froze its own raw calculations before reading analyst results, then matched1,872 query/system/case rows,1,404 held radial FP rows,120 NEW U-null rows,96 LEGACY U-null rows,24 original full-eight null group means and all46 radial exact events: **zero mismatches**, tolerance1e−12. This is scoped verification, not independent recomputation of every dense event or certification of future strict A/B/C paths. ' + link('independent-comparison.json', 'Independent comparison') + '.', '',
        '**D — inconclusive/nonpromotional.** Conditional common-four gains coexist with regressions, failed noise bounds and exact-lookup costs; original strict fixture validity and full primary truth remain unavailable. This is not A (deploy .45), not B (a validated optimal .50), and not C (select a safer cutoff after held results). No production configuration, source ranking, pipeline or issue state was changed. A new valid registration and independent labels are needed before any production-default decision.', '',
        'The complete365,759,686-byte analyzed JSON is preserved losslessly in ' + link('threshold-analysis.json.xz', 'the full compressed analysis') + ' with ' + link('threshold-analysis-artifact.json', 'byte/hash manifest') + '; dense per-ID events and all sensitivity scenarios are retained. Raw capture and portable restoration are described in [capture restoration](<search-relevance-eval/threshold/capture-restore-notes.md>).', '']
    target = HERE / 'RESULTS.md'
    with target.open('x') as stream:
        stream.write('\n'.join(lines))
    print(target)

if __name__ == '__main__':
    main()
