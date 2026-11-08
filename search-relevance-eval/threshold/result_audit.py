#!/usr/bin/env python3
"""Independent offline results audit. Never imports the primary analyzer or retrieves.

The subset was fixed by parent before any analyst-output inspection. Formulae here
are solely an independent audit, not a replacement primary evaluation framework.
"""
import argparse
from collections import Counter, defaultdict
import datetime as dt
import hashlib
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
WORK = HERE.parent.parent
SYSTEMS = ['ms_050', 'ms_048', 'ms_046', 'ms_045', 'ms_044', 'ms_042', 'ms_040', 'topk10diag']
COMMON = {'t04p1', 't05p1', 't06p1', 't07p1'}
NEGATIVE = {'negative_unrelated', 'negative_or_lookalike', 'no_answer'}

def rows(path):
    with Path(path).open() as f:
        for line in f:
            if line.strip():
                yield json.loads(line)

def load(path):
    return json.loads(Path(path).read_text())

def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def numeric(g):
    return type(g) is int and 0 <= g <= 3

def metric(grades, hits):
    ids = [h['id'] for h in hits]
    ranks = [h.get('rank', i) for i, h in enumerate(hits, 1)]
    assert len(set(ids)) == len(ids) and len(set(ranks)) == len(ranks)
    assert all(type(r) is int and r > 0 for r in ranks)
    assert all(d in grades for d in ids)
    assert all(numeric(g) or g == 'U' for g in grades.values())
    useful = {d for d, g in grades.items() if numeric(g) and g >= 2}
    recovered = {d for d, r in zip(ids, ranks) if r <= 10 and d in useful}
    idcg = sum((2 ** g - 1) / math.log2(r + 1) for r, g in enumerate(sorted((g for g in grades.values() if numeric(g)), reverse=True)[:10], 1))
    uncertain = 'U' in grades.values()
    defined = not uncertain and bool(useful)
    dcg = sum((2 ** grades[d] - 1) / math.log2(r + 1) for d, r in zip(ids, ranks) if r <= 10 and numeric(grades[d]))
    return dict(recall_at_10_ge_2=len(recovered) / len(useful) if defined else None,
                ndcg_at_10=dcg / idcg if not uncertain and idcg else None,
                success_at_5_ge_2=int(any(r <= 5 and d in useful for d, r in zip(ids, ranks))) if defined else None,
                useful_positive_denominator=len(useful), retrieved_useful_ids=sorted(recovered),
                u_qrels=sum(g == 'U' for g in grades.values()), grade1_corpus_count=sum(g == 1 for g in grades.values()),
                known_only_idcg_at_10=idcg, known_only_idcg_is_not_validated=uncertain)

def exact(query, baseline, candidate):
    b = {h['id']: h.get('rank', i) for i, h in enumerate(baseline, 1) if h.get('rank', i) <= 10}
    c = {h['id']: h.get('rank', i) for i, h in enumerate(candidate, 1) if h.get('rank', i) <= 10}
    targets = query['authoritative_target_ids']
    present = [c[d] for d in targets if d in c]
    best = min(present) if present else None
    events = []
    for d in targets:
        if d in b and (d not in c or c[d] > b[d]):
            events.append(dict(type='target_displacement', target_id=d, baseline_rank=b[d], candidate_rank=c.get(d)))
        for near in query.get('near_identifier_ids', []):
            if near in c and near not in b and (d not in c or c[near] < c[d]):
                events.append(dict(type='new_wrong_ID_ahead', target_id=d, wrong_id=near, candidate_rank=c.get(d), wrong_rank=c[near]))
    return dict(authoritative_target_ranks={d: c.get(d) for d in targets}, best_target_rank=best,
                top1=int(best == 1), mrr_at_10=1 / best if best is not None else 0,
                exact_success_at_5=int(best is not None and best <= 5), exact_events=events,
                missing_rank_policy='not observed within top10; censored >10, never invented rank11')

def query_map(queries, intents):
    im = {r['intent_id']: r for r in rows(intents)}
    return {q['id']: {**im.get(q['intent_id'], {}), **q} for q in rows(queries)}

def save(path, value):
    with Path(path).open('x') as f:
        json.dump(value, f, sort_keys=True, indent=2, allow_nan=False)
        f.write('\n')

def jsonl(path, values):
    with Path(path).open('x') as f:
        for value in values:
            f.write(json.dumps(value, sort_keys=True, allow_nan=False) + '\n')

def audit(output):
    config = load(HERE / 'analysis-capture-config.json')
    sources, failures, counts = {}, [], {}
    def bound(path, expected=None):
        path = Path(path)
        actual = sha(path)
        sources[str(path.relative_to(WORK))] = actual
        if expected is not None and actual != expected:
            failures.append(dict(type='source_hash_mismatch', path=str(path), expected=expected, actual=actual))
        return path
    # Only capture inputs and raw sources. No analyst result table is opened here.
    for spec in config['source_refs'].values():
        bound(spec['path'], spec['sha256'])
    for spec in config['completion_refs']:
        bound(spec['path'], spec['sha256'])
    execution = load(bound(config['execution_inputs']['path'], config['execution_inputs']['sha256']))
    queries = {'NEW': query_map(HERE / 'query-spec.jsonl', HERE / 'intents.jsonl'),
               'LEGACY': query_map(HERE.parent / 'synthetic/query-spec.jsonl', HERE.parent / 'synthetic/intents.jsonl')}
    grades = defaultdict(dict)
    qrel_counts = Counter()
    ambiguity_u, scored_u = set(), set()
    for cohort, path in [('NEW', config['source_refs']['new_qrels']['path']), ('LEGACY', config['source_refs']['legacy_qrels']['path'])]:
        for r in rows(path):
            size = r.get('size', 180)
            key = cohort, r['seed'], size, r['query_id']
            assert r['dataset_id'] not in grades[key]
            grades[key][r['dataset_id']] = r['grade']
            qrel_counts[cohort, str(r['grade'])] += 1
            if cohort == 'NEW' and r['grade'] == 'U':
                target = ambiguity_u if queries['NEW'][r['query_id']]['kind'] == 'ambiguous_ungraded' else scored_u
                target.add((r['seed'], size, r['query_id'], r['dataset_id']))
    assert all(len(v) == key[2] for key, v in grades.items())
    binding = load(HERE / 'analysis-bindings.json')
    legacy_u = {(k[1], k[3], d) for k, v in grades.items() if k[0] == 'LEGACY' for d, g in v.items() if g == 'U'}
    mask = {(r['seed'], r['query_id'], r['dataset_id']) for r in binding['legacy']['uncertainty_pairs']}
    assert legacy_u == mask and len(mask) == 12
    for path, expected in binding['legacy']['source_sha256'].items():
        bound(WORK / path, expected)
    for k, v in grades.items():
        if k[0] == 'NEW' and queries['NEW'][k[3]]['kind'] in NEGATIVE:
            assert set(v.values()) == {0}
    counts['qrels'] = {cohort: {g: n for (c, g), n in sorted(qrel_counts.items()) if c == cohort} for cohort in ('NEW', 'LEGACY')}
    counts['new_negative_all_zero_pairs'] = sum(len(v) for k, v in grades.items() if k[0] == 'NEW' and queries['NEW'][k[3]]['kind'] in NEGATIVE)
    assert counts['new_negative_all_zero_pairs'] == 110160
    assert len(scored_u) == 21 and len(ambiguity_u) == 18360
    policy = load(HERE / 'diagnostic-execution-policy.json')
    assert {(s, q, d) for s, n, q, d in scored_u} == {(r['seed'], r['query_id'], r['dataset_id']) for r in policy['uncertainty_pairs']}
    selection = load(HERE / 'development-decision.json')
    assert policy['forced_recommendation'] == 'D' and policy['promotion_allowed'] is False
    assert selection['chosen_system_or_none'] is None and selection['promotion_allowed'] is False
    root = Path(config['execution_root'])
    runs = {}
    phase_summaries, times, receipt_repeats, surface_missing, request_failures = {}, {}, Counter(), 0, []
    receipt_times = []
    for phase in ('development', 'heldout', 'roles'):
        completion = load(root / ('complete-' + phase + '.json'))
        expected_count, actual_count, measured, warmup = 0, 0, 0, 0
        start, end = None, None
        for case in completion['cases']:
            cohort, seed, size = case['cohort'], case['seed'], case['catalog_size']
            qids = set(queries[cohort]) if cohort in queries else None
            if cohort == 'NEW' and phase != 'roles':
                qids = {q for q in qids if (queries[cohort][q]['split'] == 'development') == (phase == 'development')}
            if qids is not None:
                assert len(qids) == case['query_count']
            expected_systems = ['diag_dataset045_nested050', 'diag_dataset050_nested045'] if phase == 'roles' else SYSTEMS
            local_grid = Counter()
            expected_count += case['query_count'] * len(expected_systems) * 11
            for relative, expected_sha in case['files_sha256'].items():
                p = bound(WORK / relative, expected_sha)
                if p.name == phase + '-runs.jsonl':
                    for r in rows(p):
                        k = cohort, seed, size, r['query_id'], r['system']
                        assert k not in runs
                        runs[k] = r
                if p.name != phase + '-receipts.jsonl':
                    continue
                for r in rows(p):
                    actual_count += 1
                    measured += r['warmup'] is False
                    warmup += r['warmup'] is True
                    assert r['system'] in expected_systems
                    assert qids is None or r['query_id'] in qids
                    local_grid[r['query_id'], r['system'], r['repetition'], r['warmup']] += 1
                    if r.get('error') or r.get('timed_out') or r.get('shards', {}).get('failed'):
                        request_failures.append(dict(phase=phase, case=[cohort, seed, size], query=r['query_id'], system=r['system']))
                    surface_missing += any(field not in r for field in ('hits', 'aggregations', 'total_hits', 'all_hit_signatures'))
                    a, b = r['request_started_utc'], r['request_completed_utc']
                    start = min(start, a) if start else a
                    end = max(end, b) if end else b
                    if phase != 'development':
                        assert dt.datetime.fromisoformat(a) > dt.datetime.fromisoformat(selection['created_utc'])
                    receipt_times.append((a, b))
            if qids is None:
                qids = {k[0] for k in local_grid}
            expected_grid = {(q, s, i, i == 0) for q in qids for s in expected_systems for i in range(11)}
            assert set(local_grid) == expected_grid and set(local_grid.values()) == {1}
        assert actual_count == expected_count
        phase_summaries[phase] = dict(actual_requests=actual_count, expected_requests=expected_count,
                                     measured=measured, warmup=warmup, cases=len(completion['cases']),
                                     first_started_utc=start, last_completed_utc=end)
        times[phase] = [start, end]
    counts['timing_phases'] = phase_summaries
    counts['receipt_surfaces_missing'] = surface_missing
    counts['timed_request_failures'] = request_failures
    assert surface_missing == 0 and not request_failures
    prep = load(root / 'preparation.json')
    assert dt.datetime.fromisoformat(policy['sealed_utc']) < dt.datetime.fromisoformat(prep['started_utc'])
    assert dt.datetime.fromisoformat(times['development'][1]) < dt.datetime.fromisoformat(selection['created_utc']) < dt.datetime.fromisoformat(times['heldout'][0])
    held_release = load(bound(root / 'release-heldout.json'))
    assert held_release['development_record_sha256'] == sha(HERE / 'development-decision.json')
    assert selection['development_completion_sha256'] == sha(root / 'complete-development.json')
    raw_subset, fp_rows = [], []
    for key, r in sorted(runs.items()):
        cohort, seed, size, qid, system = key
        if cohort not in queries or system not in SYSTEMS:
            continue
        q = queries[cohort][qid]
        scoped = q['kind'] == 'exact' or (cohort == 'NEW' and (qid in COMMON or qid == 't03p3' or (seed == 38873 and qid in {'t08p1', 't08p2', 't08p3'})))
        if scoped:
            row = dict(cohort=cohort, seed=seed, size=size, query_id=qid, system=system, kind=q['kind'])
            if q['kind'] == 'exact':
                row.update(exact(q, runs[(*key[:4], 'ms_050')]['hits'], r['hits']))
            else:
                row.update(metric(grades[key[:4]], r['hits']))
            raw_subset.append(row)
        if cohort == 'NEW' and (q['kind'] == 'semantic' or q['kind'] in NEGATIVE):
            v = grades[key[:4]]
            base = runs[(*key[:4], 'ms_050')]
            obs = dict(cohort=cohort, seed=seed, size=size, query_id=qid, system=system, kind=q['kind'], uncertain='U' in v.values())
            for n in (5, 10):
                b = {h['id'] for h in base['hits'] if h['rank'] <= n and v[h['id']] == 0}
                c = {h['id'] for h in r['hits'] if h['rank'] <= n and v[h['id']] == 0}
                obs.update({f'baseline_grade0_top{n}':len(b), f'candidate_grade0_top{n}':len(c),
                            f'known_new_grade0_ids_top{n}':sorted(c-b),
                            f'new_grade0_top{n}':len(c-b) if not obs['uncertain'] else None,
                            f'net_grade0_change_top{n}':len(c)-len(b) if not obs['uncertain'] else None})
            fp_rows.append(obs)
    assert len(raw_subset) == 1872, len(raw_subset)
    memberships = {}
    for r in rows(config['source_refs']['eligibility']['path']):
        memberships[(r['cohort'], r['seed'], r['size'], r['query_id'], r['system'])] = r
    assert len(memberships) == 3024
    attribution = Counter()
    for row in fp_rows:
        key = tuple(row[k] for k in ('cohort', 'seed', 'size', 'query_id', 'system'))
        current, base = memberships.get(key), memberships.get((*key[:4], 'ms_050'))
        complete = current is not None and base is not None and current.get('complete') is True and base.get('complete') is True and current.get('source_primary_top10_subset') is True and base.get('source_primary_top10_subset') is True
        row['full_membership_attribution_available'] = complete
        events = []
        for did in row['known_new_grade0_ids_top10']:
            event = dict(dataset_id=did)
            if complete:
                kw = did in current['keyword_ids']
                assert set(current['keyword_ids']) == set(base['keyword_ids'])
                newly_admitted = did in current['hybrid_ids'] and did not in base['hybrid_ids']
                event.update(keyword_eligible=kw, newly_admitted_hybrid=newly_admitted,
                             keyword_false_new_hybrid_admission=newly_admitted and not kw,
                             same_full_hybrid_eligible_rank_promotion=did in base['hybrid_ids'])
                attribution['keyword_true_new_top10'] += kw
                attribution['keyword_false_new_hybrid_admission'] += newly_admitted and not kw
                attribution['same_full_hybrid_eligible_rank_promotion'] += did in base['hybrid_ids']
            else:
                event['classification'] = 'unavailable: no complete matching full-member primary-subset proof'
                attribution['unavailable'] += 1
            events.append(event)
        row['new_top10_attribution'] = events
    # Stream geometry rather than loading 300MB native table into memory.
    inventory = {(r['cohort'], r['seed'], r['size'], r['dataset_id']):r for r in rows(config['source_refs']['vector_inventory']['path'])}
    native_count, child_count, native_missing, dimensions = 0, 0, [], Counter()
    distribution = defaultdict(lambda: [0, 0.0, None, None])
    native_useful_sample = []
    for r in rows(config['source_refs']['native_scores']['path']):
        native_count += 1
        key = r['cohort'], r['seed'], r['size'], r['query_id']
        did = r['dataset_id']
        truth = inventory[(*key[:3], did)]
        got = {(c['distribution_id'], c['offset']):c for c in r['children'] if c['allowed']}
        expected = {(c['distribution_id'], c['offset']):c for c in truth['children'] if c['allowed']}
        assert set(got) == set(expected)
        assert r['root_projection_sha256'] == truth['root']['projection_sha256']
        assert r['dimension'] == 768
        child_count += len(got)
        assert r['max_child_score'] == (max(c['score'] for c in got.values()) if got else None)
        for k, c in got.items():
            assert c['projection_sha256'] == expected[k]['projection_sha256'] and c['dimension'] == 768
        g = grades[key][did]
        for branch, value in [('root', r['root_score']), ('max_authorized_child', r['max_child_score'])]:
            d = distribution[(r['seed'], r['size'], str(g), branch)]
            if value is not None:
                assert 0 <= value <= 1
                d[0] += 1;d[1] += value;d[2] = value if d[2] is None else min(d[2],value);d[3] = value if d[3] is None else max(d[3],value)
        if key[3] in COMMON and key[2] == 60 and numeric(g) and g >= 2:
            native_useful_sample.append(dict(seed=key[1], size=key[2], query_id=key[3],dataset_id=did,grade=g,root_score=r['root_score'],max_child_score=r['max_child_score']))
    assert native_count == 440640
    geometry_times = [r['request_started_utc'] for r in rows(root/'geometry/receipts.jsonl')]
    assert all(dt.datetime.fromisoformat(t) > dt.datetime.fromisoformat(selection['created_utc']) for t in geometry_times)
    calibrations = list(rows(root/'geometry/calibration.jsonl'))
    assert len(calibrations) == 9 and all(c['passed'] for c in calibrations)
    calibration_max_error = max(p['absolute_error'] for c in calibrations for p in c['points'])
    counts['native'] = dict(parent_pairs=native_count, authorized_child_scores=child_count,
                           vector_inventory_rows=len(inventory), membership_rows=len(memberships),
                           membership_primary_subset_failures=sum(r.get('source_primary_top10_subset') is not True for r in memberships.values()),
                           calibration_cases=len(calibrations), calibration_max_error=calibration_max_error,
                           first_geometry_request_utc=min(geometry_times),
                           full_HNSW_window_is_not_exact_oracle=True)
    output = Path(output);output.mkdir(parents=True,exist_ok=True)
    subset_path=output/'independent-checked-subset.jsonl';fp_path=output/'independent-fp-checks.jsonl'
    jsonl(subset_path,raw_subset);jsonl(fp_path,fp_rows)
    report=dict(schema_version=1,status='raw_checks_complete_pending_analyst_comparison',forced_recommendation='D',promotion_allowed=False,
                scope=dict(frozen_before_analyst_output=True, common_semantic_qids=sorted(COMMON),
                           additional_U_scope='t03p3 all seeds/sizes; t08p1/p2/p3 seed38873 all sizes',
                           exact='all NEW12 and LEGACY24 queries, every authoritative target, all eight systems',
                           subset_rows=len(raw_subset), fp_rows=len(fp_rows), independent_formulae_not_primary_reimplementation=True),
                counts=counts,source_hashes=sources,failures=failures,
                phase_order=dict(policy_sealed_utc=policy['sealed_utc'], first_target_preparation_utc=prep['started_utc'],
                                 development_last_request_utc=times['development'][1],none_record_utc=selection['created_utc'],
                                 first_held_request_utc=times['heldout'][0],release_bound_to_actual_NONE_sha=True),
                exact_event_count=sum(len(r.get('exact_events',[])) for r in raw_subset),
                U_suppressed_rows=sum(r.get('u_qrels',0)>0 for r in raw_subset),
                FP_attribution=dict(attribution),
                equal_absolute_counts_with_new_ID_additions=sum(r['baseline_grade0_top10']==r['candidate_grade0_top10'] and bool(r['known_new_grade0_ids_top10']) for r in fp_rows),
                native_dataset_grade_distributions=[dict(seed=k[0],size=k[1],dataset_grade=k[2],branch=k[3],n=v[0],mean=v[1]/v[0] if v[0] else None,minimum=v[2],maximum=v[3]) for k,v in sorted(distribution.items())],
                native_useful_sample=native_useful_sample,
                files=dict(checked_subset=str(subset_path.relative_to(WORK)),checked_subset_sha256=sha(subset_path),
                           false_positive_checks=str(fp_path.relative_to(WORK)),false_positive_checks_sha256=sha(fp_path)),
                analyst_comparison=dict(status='not_started', analyst_outputs_not_read=True),
                limitations=['Forced-D nonpromotion only; no future strict A/B/C certification.',
                             'Audits supplied C grade/source truth; assigns no new semantic labels.',
                             'Native script L2 scores are distinct from SQ/fp16 approximate Faiss membership and raw boosted fusion.',
                             'FULL collector membership is observed approximate/window evidence, not an exact eligibility oracle.',
                             'No model/search/network request was performed.'])
    save(output/'independent-results-audit.json',report)
    print(json.dumps({k:report[k] for k in ('status','scope','phase_order','counts','exact_event_count','U_suppressed_rows','FP_attribution','equal_absolute_counts_with_new_ID_additions')},indent=2))

def verify_ledger_details():
    """Close repeated latency/ranking links and native pair identity coverage."""
    root = HERE / '.local/execution'
    intervals, n, cases, surface_failures = [], 0, [], []
    for phase in ('development', 'heldout', 'roles'):
        for case in load(root / ('complete-' + phase + '.json'))['cases']:
            files = {Path(p).name: WORK / p for p in case['files_sha256']}
            rr = {(r['query_id'],r['system']):r for r in rows(files[phase+'-runs.jsonl'])}
            samples, last, counts = defaultdict(dict), {}, Counter()
            for r in rows(files[phase+'-receipts.jsonl']):
                intervals.append((r['request_started_utc'],r['request_completed_utc']))
                if not r['warmup']:
                    k = r['query_id'],r['system']
                    samples[k][r['repetition']] = r['elapsed_ms']
                    counts[k] += 1
                    if r['repetition'] == 10:last[k] = r['hits']
            for k,r in rr.items():
                assert counts[k] == 10
                assert r['latency_samples_ms'] == [samples[k][i] for i in range(1,11)]
                assert [{f:h.get(f) for f in ('id','rank','score')} for h in last[k]] == [{f:h.get(f) for f in ('id','rank','score')} for h in r['hits']]
                n += 1
            cases.append(dict(phase=phase,cohort=case['cohort'],seed=case['seed'],size=case['catalog_size'],closed_runs=len(rr)))
    ordered=sorted(intervals)
    overlaps=[(a,b) for a,b in zip(ordered,ordered[1:]) if dt.datetime.fromisoformat(a[1])>dt.datetime.fromisoformat(b[0])]
    native=defaultdict(set)
    for r in rows(root/'geometry/native.jsonl'):
        k=r['seed'],r['size'],r['query_id']
        assert r['dataset_id'] not in native[k]
        native[k].add(r['dataset_id'])
    assert len(native)==432 and all(len(ids)==k[1] for k,ids in native.items())
    additional=root/'additional-eligibility'
    completion=load(additional/'complete.json')
    for p,h in completion['files_sha256'].items():assert sha(WORK/p)==h
    membership_rows=list(rows(additional/'additional-eligibility.jsonl'))
    receipts=list(rows(additional/'receipts.jsonl'))
    assert len(membership_rows)==1680 and len(receipts)==1920
    report=dict(status='passed',forced_recommendation='D',promotion_allowed=False,closed_run_latency_and_final_ranking_pairs=n,
                closed_case_phases=cases,timed_requests=len(intervals),concurrent_interval_overlap_count=len(overlaps),
                native_unique_query_case_groups=len(native),native_pair_duplicates=0,native_full_ID_counts_each_group=True,
                additional_eligibility_rows=len(membership_rows),additional_diagnostic_receipts=len(receipts),
                additional_all_after_NONE=all(dt.datetime.fromisoformat(r['request_started_utc'])>dt.datetime.fromisoformat(load(HERE/'development-decision.json')['created_utc']) for r in receipts),
                additional_primary_subset_failures=sum(r.get('source_primary_top10_subset') is not True for r in membership_rows),
                additional_membership_source_sha256=sha(additional/'additional-eligibility.jsonl'))
    assert not overlaps and report['additional_all_after_NONE'] and report['additional_primary_subset_failures']==0
    save(HERE/'results/independent-ledger-closure.json',report)
    print(json.dumps(report,indent=2))

def additional_spotcheck():
    """Deterministic legacy x01 and original-U s08p1, not the full supplemental analysis."""
    root=HERE/'.local/execution'
    qrels=defaultdict(dict)
    for r in rows(HERE.parent/'synthetic/diagnostic-qrels.jsonl'):
        if r['query_id'] in {'x01','s08p1'}:qrels[r['seed'],r['query_id']][r['dataset_id']]=r['grade']
    members={(r['seed'],r['query_id'],r['system']):r for r in rows(root/'additional-eligibility/additional-eligibility.jsonl') if r['cohort']=='LEGACY' and r['query_id'] in {'x01','s08p1'}}
    rr={}
    for seed in (39031,39032,39033):
        for r in rows(root/'LEGACY'/str(seed)/'180/heldout-runs.jsonl'):
            if r['query_id'] in {'x01','s08p1'}:rr[seed,r['query_id'],r['system']]=r
    checks=[]
    for (seed,qid,system),member in sorted(members.items()):
        v=qrels[seed,qid];base=members[seed,qid,'ms_050']
        assert member['complete'] and member['source_primary_top10_subset']
        assert set(member['keyword_ids'])==set(base['keyword_ids'])
        left={h['id'] for h in rr[seed,qid,'ms_050']['hits'] if h['rank']<=10 and v[h['id']]==0}
        right={h['id'] for h in rr[seed,qid,system]['hits'] if h['rank']<=10 and v[h['id']]==0}
        events=[dict(dataset_id=d,keyword_eligible=d in member['keyword_ids'],newly_admitted_hybrid=d in member['hybrid_ids'] and d not in base['hybrid_ids']) for d in sorted(right-left)]
        checks.append(dict(seed=seed,query_id=qid,system=system,known_grade0_new_top10_ids=sorted(right-left),
                           full_query_U=sum(g=='U' for g in v.values()),full_grade0_exposure_count=len(right-left) if 'U' not in v.values() else None,events=events))
    assert len(checks)==42
    save(HERE/'results/independent-additional-membership-spotcheck.json',dict(status='raw_checks_complete_pending_supplemental_comparison',forced_recommendation='D',promotion_allowed=False,
        deterministic_scope='x01 first registered legacy exact and s08p1 original-U family; all3legacy seeds/all7radial systems; no REAL grade0 claims',
        source_sha256=sha(root/'additional-eligibility/additional-eligibility.jsonl'),rows=checks))
    print('42 deterministic supplemental source rows audited; s08p1 U totals remain null')

def report_array(path, name, indent=2, parent=None):
    """Stream a pretty-printed analyzer array; never load giant evidence/scores."""
    decoder=json.JSONDecoder()
    with Path(path).open() as f:
        within=parent is None
        for line in f:
            if parent is not None and line.startswith('  '+json.dumps(parent)+': {'):
                within=True
            if within and line.startswith(' '*indent+json.dumps(name)+': ['):
                buffer=line.split('[',1)[1]
                break
        else:raise ValueError('report array not found: '+str(parent)+'/'+name)
        while True:
            buffer=buffer.lstrip(' \r\n\t,')
            if buffer.startswith(']'):return
            try:
                value,end=decoder.raw_decode(buffer)
            except json.JSONDecodeError:
                block=f.read(1024*1024)
                if not block:raise ValueError('incomplete report array '+name)
                buffer+=block
                continue
            yield value
            buffer=buffer[end:]

def compare_report(path):
    """Compare already-frozen independent rows only after analyst output closes."""
    result=HERE/'results'
    audit_report=load(result/'independent-results-audit.json')
    assert audit_report['analyst_comparison']['status']=='not_started'
    raw=list(rows(result/'independent-checked-subset.jsonl'))
    expected={(r['cohort'],r['seed'],r['size'],r['query_id'],r['system'].replace('topk10diag','topk10')):r for r in raw}
    errors=[];seen=set();u_seen=0;legacy_u_seen=0
    def check(key,field,a,b):
        same=abs(a-b)<=1e-12 if type(a) in (int,float) and type(b) in (int,float) else a==b
        if not same:errors.append(dict(key=list(key),field=field,expected=a,actual=b))
    for cohort,iterator in [('NEW',report_array(path,'per_query')),('LEGACY',report_array(path,'per_query',4,'legacy'))]:
        for r in iterator:
            key=(cohort,r['seed'],r['size'],r['query_id'],r['system'])
            if cohort=='LEGACY' and r.get('u_qrels',0):
                legacy_u_seen+=1
                for field in ('ndcg_at_10','recall_at_10_ge_2','success_at_5_ge_2'):check(key,field,None,r[field])
            if key not in expected:continue
            a=expected[key];seen.add(key)
            if a['kind']=='exact':
                for field in ('authoritative_target_ranks','best_target_rank','top1','mrr_at_10','exact_success_at_5'):check(key,field,a[field],r[field])
            else:
                for field in ('recall_at_10_ge_2','ndcg_at_10','success_at_5_ge_2','useful_positive_denominator','retrieved_useful_ids','u_qrels'):check(key,field,a[field],r[field])
                if a['u_qrels']:u_seen+=1
    for key in set(expected)-seen:errors.append(dict(type='missing_subset_row',key=list(key)))
    fp_expected={(r['cohort'],r['seed'],r['size'],r['query_id'],r['system']):r for r in rows(result/'independent-fp-checks.jsonl')}
    fp_n=0
    for r in report_array(path,'false_positive_exposures'):
        key=('NEW',r['seed'],r['size'],r['query_id'],r['system'])
        a=fp_expected[key];fp_n+=1
        for k in (5,10):
            for field in (f'new_grade0_top{k}',f'baseline_grade0_top{k}',f'candidate_grade0_top{k}'):
                # On an uncertain query primary exhaustive counts are null;
                # independent known individual-ID observations remain descriptive.
                value=None if a['uncertain'] else a[field]
                check(key,field,value,r[field])
            check(key,f'new_grade0_ids_top{k}',None if a['uncertain'] else a[f'known_new_grade0_ids_top{k}'],r[f'new_grade0_ids_top{k}'])
    legacy_groups=0
    for r in report_array(path,'kind_split_groups',4,'legacy'):
        if r['kind']=='semantic' and r['split']=='heldout':
            legacy_groups+=1
            for field in ('recall_at_10_ge_2','ndcg_at_10','success_at_5_ge_2'):
                check(('LEGACY',r['seed'],r['size'],r['kind'],r['system']), 'full_population_means.'+field,None,r['full_population_means'][field])
    comparison=dict(status='passed' if not errors else 'mismatch',analyst_outputs_not_read_before_raw_freeze=True,
                    analyst_report_path=str(Path(path).resolve().relative_to(WORK)),analyst_report_sha256=sha(path),
                    compared_subset_rows=len(seen),expected_subset_rows=len(expected),FP_exposure_rows=fp_n,
                    NEW_scoped_U_suppressed_rows=u_seen,LEGACY_U_suppressed_query_system_rows=legacy_u_seen,
                    legacy_full_heldout_semantic_null_groups=legacy_groups,errors=errors,
                    raw_subset_sha256=audit_report['files']['checked_subset_sha256'])
    save(result/'independent-primary-comparison.json',comparison)
    print(json.dumps(comparison,indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output-dir',default=str(HERE/'results'));parser.add_argument('--ledger-details',action='store_true');parser.add_argument('--additional-spotcheck',action='store_true');parser.add_argument('--compare-report');args=parser.parse_args()
    if args.ledger_details:verify_ledger_details()
    elif args.additional_spotcheck:additional_spotcheck()
    elif args.compare_report:compare_report(args.compare_report)
    else:audit(args.output_dir)
