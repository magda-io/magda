"""Four predeclared role diagnostics; existing metrics only, never candidates."""
import importlib.util
from collections import defaultdict
from pathlib import Path

spec = importlib.util.spec_from_file_location("threshold_role_analysis_core", Path(__file__).with_name("analyze.py"))
a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)


def evidence_scope_opportunity(payload, query_map, grades):
    """Fixed held pairs, SAME pre-certified child offset; no max-child fallback."""
    gates = payload.get("gates") or a.default_gates()
    native = a._native_index(payload.get("native_scores", ()))
    evidence = {}
    for row in payload.get("branch_evidence", ()):
        key = row.get("cohort", "NEW"), row["seed"], row["query_id"], row["dataset_id"], row["branch"]
        if key in evidence:
            raise ValueError("Duplicate pre-certified evidence scope")
        evidence[key] = row
    fixed = [p for p in payload.get("fixed_pairs", ()) if query_map[p["query_id"]]["split"] == "heldout"]
    if len({(p["query_id"], p.get("record_id", p.get("dataset_id"))) for p in fixed}) != len(fixed):
        raise ValueError("Duplicate fixed opportunity pair")
    band = gates["coverage_opportunity"]["inclusive_band"]
    narrow = gates["coverage_opportunity"]["opportunity_interval_lower_inclusive_upper_exclusive"]
    def inside(value, interval, inclusive):
        return None if value is None else interval[0] <= value and (value <= interval[1] if inclusive else value < interval[1])
    details, summaries = [], []
    for seed in gates["seeds"]:
        members = []
        for pair in fixed:
            qid, did, scope = pair["query_id"], pair.get("record_id", pair.get("dataset_id")), pair.get("evidence_bearing_scope")
            key = ("NEW", seed, 60, qid)
            grade = grades.get(key, {}).get(did)
            score = native.get((*key, did))
            ev = evidence.get(("NEW", seed, qid, did, scope), {})
            certified = type(grade) is int and grade >= 2 and ev.get("supports_dataset_grade") is True and bool(ev.get("evidence_refs"))
            source_scope = ev.get("source_scope")
            chosen, child_id, reason = None, None, None
            if not certified:
                reason = "Dataset useful grade or independently quoted scope is uncertain/unavailable"
            elif score is None:
                reason = "Exact native pair missing"
            elif scope == "root" and source_scope == "root":
                chosen = score["root_score"]
            elif scope == "nested" and isinstance(source_scope, str) and source_scope.startswith("nested.") and source_scope[7:].isdigit():
                offset = int(source_scope[7:])
                matches = [c for c in score["children"] if c["offset"] == offset and c["allowed"]]
                if len(matches) == 1:
                    chosen, child_id = matches[0]["score"], matches[0]["distribution_id"]
                else:
                    reason = "Pre-certified child offset absent; no alternative-child/max fallback"
            else:
                reason = "Pre-certified exact root/child source_scope missing"
            if chosen is None and reason is None:
                reason = "Exact certified-scope native score unavailable"
            proxy = score["root_score"] if score and scope == "root" else score["max_child_score"] if score else None
            row = dict(seed=seed, query_id=qid, intent_id=query_map[qid]["intent_id"], dataset_id=did,
                       dataset_grade=grade, evidence_bearing_scope=scope, certified_source_scope=source_scope,
                       certified_distribution_id=child_id, certified_scope_score=chosen,
                       native_max_child_score=score["max_child_score"] if score else None,
                       scope_in_band=inside(chosen, band, True), scope_in_narrow=inside(chosen, narrow, False),
                       max_scope_proxy_in_band=inside(proxy, band, True), max_scope_proxy_in_narrow=inside(proxy, narrow, False),
                       source_evidence_refs=ev.get("evidence_refs", []), unavailable_reason=reason)
            details.append(row)
            members.append(row)
        summaries.append(dict(seed=seed, fixed_held_pairs=len(fixed), scope_available=sum(r["certified_scope_score"] is not None for r in members),
            unavailable=sum(r["certified_scope_score"] is None for r in members), scoped_band=sum(r["scope_in_band"] is True for r in members),
            scoped_narrow=sum(r["scope_in_narrow"] is True for r in members),
            scoped_narrow_families=sorted({r["intent_id"] for r in members if r["scope_in_narrow"] is True}),
            max_proxy_band=sum(r["max_scope_proxy_in_band"] is True for r in members),
            max_proxy_narrow=sum(r["max_scope_proxy_in_narrow"] is True for r in members),
            proxy_vs_scoped_narrow_disagreements=sum(r["scope_in_narrow"] is not None and r["scope_in_narrow"] != r["max_scope_proxy_in_narrow"] for r in members),
            original_strict_adequacy_certified=False))
    return dict(per_pair=details, per_seed=summaries, promotion_allowed=False,
        population="Frozen held54 of total72; scopedU retained, not removed or counted as known0",
        selection="Pre-certified exact source_scope only, never score-selected child or max-child fallback",
        locked_analyzer_erratum="Original coarse nested opportunity uses max-child proxy; this narrower auxiliary output reports the certified actual child score",
        source_digests={name: a.digest(payload.get(name, ())) for name in ("fixed_pairs", "native_scores", "branch_evidence")})


def build_role_report(payload):
    gates = payload.get("gates") or a.default_gates()
    policy = payload.get("diagnostic_policy", {})
    if policy.get("status") != "original_failed" or policy.get("promotion_allowed") is not False or policy.get("forced_recommendation") != "D":
        raise ValueError("Role report requires truthful nonpromotional failed-study policy")
    roles = {gates["baseline"]: [.50, .50], gates["fixed_primary"]: [.45, .45],
             gates["diagnostic_ids"]["dataset045_nested050"]: [.45, .50],
             gates["diagnostic_ids"]["dataset050_nested045"]: [.50, .45]}
    allowed = {s["id"] for s in gates["registered_systems"]} | set(gates["diagnostic_ids"].values())
    runs, run_audit = a.normalize_run_labels(payload["runs"], payload.get("label_mapping"))
    receipts, receipt_audit = a.normalize_run_labels(payload["receipts"], payload.get("label_mapping"))
    if any(r["system"] not in allowed for r in runs + receipts):
        raise ValueError("Unregistered role/primary system in source")
    runs = [r for r in runs if r["system"] in roles]
    receipts = [r for r in receipts if r["system"] in roles]
    qm, catalogs, grades, indexed = a._prepare(payload["queries"], payload["qrels"], runs,
                                             payload["corpora"], intents=payload.get("intents", ()))
    rows = a._rows(qm, grades, indexed, roles)
    families = a._families(rows)
    expected = {(*key, system) for key in grades for system in roles}
    problems = a._inventory(qm, catalogs, gates) + a.receipt_problems(receipts, indexed, expected, gates)
    problems += a.payload_problems(payload.get("evidence", {}), queries=payload["queries"], qrels=payload["qrels"],
                                  corpora=payload["corpora"], runs=payload["runs"], receipts=payload["receipts"])
    if expected - set(indexed):
        problems.append("Incomplete four-role run grid")
    timing, _ = a._latency(indexed, qm, gates, list(roles))
    _, contrasts, exposures, blockers = a._contrasts(rows, families, qm, indexed, gates,
                                                   "heldout", [s for s in roles if s != gates["baseline"]])
    for row in contrasts:
        row["interpretation"] = "Descriptive matched-role comparison, not candidate-selection evidence"
    common = []
    # This population was explicitly fixed before target scoring, not selected
    # from the currently defined outcomes or each seed's differing known five.
    for seed in gates["seeds"]:
        for size in gates["catalog_sizes"]:
            for system in roles:
                members = [f for f in families if f["seed"] == seed and f["size"] == size and f["system"] == system
                           and f["split"] == "heldout" and f["intent_id"] in ("t04", "t05", "t06", "t07")]
                common.append(dict(seed=seed, size=size, system=system, intent_ids=[f["intent_id"] for f in members],
                    complete=len(members) == 4, interpretation="Prespecified common-four descriptive population, not full-six primary",
                    **{m: a._mean(f[m] for f in members) if len(members) == 4 else None for m in a.METRICS}))
    sensitivity = a.legacy_sensitivity(list(qm.values()), payload["qrels"], runs, payload["corpora"],
        systems=list(roles), baseline=gates["baseline"], uncertainty_domains=policy.get("uncertainty_pairs", []))
    geometry = defaultdict(lambda: dict(pairs=0, root_available=0, nested_available=0, root_at_or_above_cutoff=0, nested_at_or_above_cutoff=0, either_at_or_above_cutoff=0))
    for key, score in a._native_index(payload.get("native_scores", ())).items():
        grade = grades[key[:4]][key[4]]
        for system, (root_cutoff, child_cutoff) in roles.items():
            counts = geometry[(key[1], key[2], key[3], str(grade), system)]
            root, child = score["root_score"], score["max_child_score"]
            re, ce = root is not None and root >= root_cutoff, child is not None and child >= child_cutoff
            for name, value in dict(pairs=1, root_available=root is not None, nested_available=child is not None,
                                    root_at_or_above_cutoff=re, nested_at_or_above_cutoff=ce, either_at_or_above_cutoff=re or ce).items():
                counts[name] += value
    geometry_rows = [dict(seed=k[0], size=k[1], query_id=k[2], dataset_grade=k[3], system=k[4], **v)
                     for k, v in sorted(geometry.items())]
    return dict(schema_version=1, diagnostic_only=True, promotion_allowed=False, forced_recommendation="D",
        original_conformance_passed=False, registered_role_pairs=roles, matched_reuse=[gates["baseline"], gates["fixed_primary"]],
        per_query=rows, per_family=families, kind_split_groups=a.descriptive_groups(rows, qm),
        native_geometric_counts=geometry_rows, repeat_diagnostics=a.repeat_diagnostics(receipts),
        evidence_scope_opportunity=evidence_scope_opportunity(payload, qm, grades),
        common_four_descriptive=common, latency=timing, exact_blockers=blockers,
        false_positive_exposures=exposures, contrasts=contrasts, uncertainty_sensitivity=sensitivity,
        source_digests=dict(runs=run_audit, receipts=receipt_audit, qrels=a.digest(payload["qrels"]),
                            policy=a.digest(policy), gates=a.digest(gates)), completeness_problems=problems,
        mixed_full_engine_eligibility="not measured; do not infer mixed HNSW admission from top10 or native geometry",
        mixed_keyword_causal_attribution="unavailable; uniform-seven full KW/engine membership is a separate artifact",
        native_geometry="Unboosted root/all-child values are unchanged across role cutoffs; geometric eligibility is not actual mixed retrieval",
        limitations=["No role pair is selected/promoted; all four are fixed diagnostics.",
                     "Matched primary timings were captured earlier than mixed-role timings; role latency is descriptive with capture-phase confounding, not a comparative performance claim.",
                     "All full-six point summaries remain undefined when scoped U affects a family; sensitivities retain original U."])
