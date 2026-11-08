#!/usr/bin/env python3
"""Presentation-only, stdlib SVGs for an already computed threshold report.

No evaluator, vector, rank, corpus, network or backend input is accepted. See
visualization-notes.md for source fields and deliberately noncausal FP labels.
"""
import argparse
from collections import defaultdict
import html
import importlib.util
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("threshold_plot_analysis", HERE / "analyze.py")
_analysis = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_analysis)

SYSTEMS = ("ms_050", "ms_048", "ms_046", "ms_045", "ms_044", "ms_042", "ms_040")
LABELS = (".50", ".48", ".46", ".45", ".44", ".42", ".40")
SEEDS = (38871, 38872, 38873)
SIZES = (60, 1000, 2000)
FAMILIES = ("t03", "t04", "t05", "t06", "t07", "t08")
COMMON = ("t04", "t05", "t06", "t07")
METRICS = (("recall_at_10_ge_2", "Recall@10 ≥2"),
           ("success_at_5_ge_2", "Success@5 ≥2"), ("ndcg_at_10", "NDCG@10"))
COLORS = ("#265a9e", "#ae5c21", "#7650a0", "#128076", "#ad4260")
DASHES = ("", "7 3", "2 3")
COMMON_LABEL = "Diagnostic only — common four known families; original full six unavailable due U"
WIDTH, PANEL_W, PLOT_W, PLOT_H = 1280, 610, 430, 170


def _esc(value):
    return html.escape(str(value), quote=True)


def _num(value, label="plot value", nullable=True):
    return _analysis._number(value, label, nullable=nullable)


def _mean(values):
    values = list(values)
    for value in values:
        _num(value)
    return _analysis._mean(values)


def _fmt(value):
    return "N/A" if value is None else format(value, ".4g")


def _rows(report, key):
    rows = report.get(key, [])
    if not isinstance(rows, list) or any(not isinstance(r, dict) for r in rows):
        raise ValueError(key + " must be a list of computed row objects")
    return rows


def _index(rows, fields):
    result = {}
    for row in rows:
        key = tuple(row[f] for f in fields)
        if key in result:
            raise ValueError("duplicate computed row identity: " + repr(key))
        result[key] = row
    return result


def _text(x, y, text, **attrs):
    extra = " ".join(f'{k.replace("_", "-")}="{_esc(v)}"' for k, v in attrs.items())
    return f'<text x="{x}" y="{y}" {extra}>{_esc(text)}</text>'


def _segments(points):
    """A null terminates a segment; never bridge or replace it with zero."""
    result, current = [], []
    for point in points:
        if point is None:
            if current:
                result.append(current)
            current = []
        else:
            current.append(point)
    if current:
        result.append(current)
    return result


def _series(label, values, color, dash="", *, topk=None, bounds=None, xs=None):
    for value in values:
        _num(value)
    _num(topk)
    if bounds:
        for pair in bounds:
            if pair is not None:
                lo, hi = pair
                _num(lo, nullable=False)
                _num(hi, nullable=False)
                if lo > hi:
                    raise ValueError("sensitivity minimum exceeds maximum")
    if xs is not None:
        if len(xs) != len(values) or any(not 0 <= _num(x, nullable=False) <= 1 for x in xs):
            raise ValueError("score coordinates must be finite in [0,1] and match values")
    return dict(label=label, values=values, color=color, dash=dash, topk=topk, bounds=bounds, xs=xs)


def _panel(title, subtitle, series=(), *, mode="threshold", ylim=None, notes=(), cutoffs=False,
           legend_note=None, legend_columns=1, legend_topk=True):
    """One modest line panel; all numeric inputs are computed report values."""
    values = [v for s in series for v in s["values"] if v is not None]
    values += [s["topk"] for s in series if s["topk"] is not None]
    for s in series:
        for pair in s.get("bounds") or []:
            if pair:
                values.extend(pair)
    if ylim is None:
        low, high = min(values + [0]), max(values + [0])
        margin = max((high - low) * .08, .02)
        ylim = (low - margin if low < 0 else 0, high + margin)
    lo, hi = ylim
    _num(lo, "axis minimum", nullable=False)
    _num(hi, "axis maximum", nullable=False)
    if not lo < hi:
        raise ValueError("invalid axis range")
    left, top = 66, 64
    def xy(index, value, length):
        return (left + index / max(1, length - 1) * PLOT_W,
                top + (hi - value) / (hi - lo) * PLOT_H)
    out = [_text(18, 22, title, font_size=16, font_weight=650),
           _text(18, 43, subtitle, font_size=11, fill="#596579")]
    for j in range(5):
        v = lo + (hi - lo) * j / 4
        y = xy(0, v, 2)[1]
        out.append(f'<path d="M{left},{y:.2f}h{PLOT_W}" stroke="#e4e9f0" fill="none"/>')
        out.append(_text(left - 8, round(y + 4, 2), _fmt(v), text_anchor="end", font_size=10))
    if mode == "threshold":
        out.append(f'<rect x="{left + PLOT_W / 2 - 15:.2f}" y="{top}" width="30" height="{PLOT_H}" fill="#e8edf4"/>')
        for i, label in enumerate(LABELS):
            x = xy(i, 0, 7)[0]
            out.append(_text(round(x, 2), top + PLOT_H + 20, label, text_anchor="middle", font_size=11,
                             font_weight=700 if i == 3 else 400))
        out.append(_text(left, top + PLOT_H + 39, "Native min_score · .45 fixed primary, not a selected winner", font_size=10))
        out.append(_text(left + PLOT_W + 27, top + PLOT_H + 20, "topk10", font_size=10))
        out.append(_text(left + PLOT_W + 27, top + PLOT_H + 33, "separate", font_size=9))
    else:
        for i in range(6):
            x = left + i / 5 * PLOT_W
            out.append(_text(round(x, 2), top + PLOT_H + 20, f"{i / 5:.1f}", text_anchor="middle", font_size=10))
        out.append(_text(left, top + PLOT_H + 39, "Unboosted stored-vector L2 score (script geometry) [0, 1]", font_size=10))
    if cutoffs:
        for cutoff in (.45, .50):
            x = left + cutoff * PLOT_W
            out.append(f'<path d="M{x:.2f},{top}v{PLOT_H}" stroke="#6b7280" stroke-dasharray="3 3"/>')
            out.append(_text(round(x, 2), top - 5, f".{int(cutoff * 100):02d}", font_size=9,
                             text_anchor="end" if cutoff == .45 else "start"))
    for s in series:
        coords = [None if v is None else (
            (left + s["xs"][i] * PLOT_W, xy(0, v, 2)[1]) if s.get("xs") is not None
            else xy(i, v, len(s["values"]))) for i, v in enumerate(s["values"])]
        bounds = s.get("bounds")
        if bounds:
            pairs = [None if b is None else (xy(i, b[0], len(bounds)), xy(i, b[1], len(bounds)))
                     for i, b in enumerate(bounds)]
            for segment in _segments(pairs):
                polygon = [p[0] for p in segment] + [p[1] for p in reversed(segment)]
                out.append('<polygon points="' + " ".join(f"{x:.2f},{y:.2f}" for x, y in polygon) +
                           f'" fill="{s["color"]}" opacity="0.09"><title>Full-six plausible sensitivity; not a statistical CI</title></polygon>')
        for segment in _segments(coords):
            out.append('<polyline points="' + " ".join(f"{x:.2f},{y:.2f}" for x, y in segment) +
                       f'" fill="none" stroke="{s["color"]}" stroke-width="1.7" stroke-dasharray="{s["dash"]}"><title>{_esc(s["label"])}</title></polyline>')
        if mode == "threshold":
            for i, point in enumerate(coords):
                if point is not None:
                    x, y = point
                    out.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="2.6" fill="{s["color"]}"><title>{_esc(s["label"])} | {LABELS[i]}: {_fmt(s["values"][i])}</title></circle>')
            if s["topk"] is not None:
                x, y = left + PLOT_W + 39, xy(0, s["topk"], 2)[1]
                out.append(f'<path d="M{x},{y-4:.2f}l4,4 -4,4 -4,-4Z" fill="{s["color"]}"><title>{_esc(s["label"])} | separate topk10: {_fmt(s["topk"])}</title></path>')
    if not values:
        out.append(_text(left + 16, top + 80, "N/A — computed aggregate unavailable (not zero)", font_size=12))
    y = top + PLOT_H + 62
    if legend_note:
        out.append(_text(20, y, legend_note, font_size=11, fill="#596579"))
        y += 22
    legend_rows = [s for s in series if s.get("legend", True)]
    for i, s in enumerate(legend_rows):
        x = 20 + (i % legend_columns) * (PANEL_W - 30) / legend_columns
        ly = y + (i // legend_columns) * 18
        out.append(f'<path d="M{x:.2f},{ly-4}h23" stroke="{s["color"]}" stroke-width="2" stroke-dasharray="{s["dash"]}"/>')
        missing = sum(v is None for v in s["values"])
        label = s.get("legend_label", s["label"]) + (f" · N/A {missing}/{len(s['values'])} (gaps)" if missing else "")
        if mode == "threshold" and legend_topk:
            label += " · topk " + _fmt(s["topk"])
        out.append(_text(round(x + 30, 2), ly, label, font_size=11 if legend_columns > 1 else 10))
    y += math.ceil(len(legend_rows) / legend_columns) * 18
    for note in notes:
        out.append(_text(20, y, note, font_size=10, fill="#596579"))
        y += 16
    return "".join(out), max(y + 18, 340)


def _document(title, panels, footer, page=1, banner=None):
    y, bodies = (112 if banner else 96), []
    for i in range(0, len(panels), 2):
        pair = panels[i:i + 2]
        height = max(h for _, h in pair)
        for col, (body, _) in enumerate(pair):
            x = 20 + col * (PANEL_W + 20)
            bodies.append(f'<g transform="translate({x},{y})"><rect width="{PANEL_W}" height="{height}" rx="10" fill="white" stroke="#dce3ec"/>{body}</g>')
        y += height + 20
    if not panels:
        bodies.append(_text(28, 125, "N/A — no computed rows supplied; no data inferred", font_size=15))
        y = 180
    height = y + 60
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}px" height="{height}px" viewBox="0 0 {WIDTH} {height}" role="img" aria-labelledby="title desc">'
            f'<title id="title">{_esc(title)} — page {page}</title><desc id="desc">{_esc(footer)}. Nulls are N/A gaps, never zero. Lines and sensitivity ranges are descriptive, not statistical confidence intervals.</desc>'
            '<style>text{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#263448}path,polyline{stroke-linejoin:round;stroke-linecap:round}</style>'
            f'<rect width="100%" height="100%" fill="#f5f7fa"/>{_text(28, 35, title, font_size=24, font_weight=700)}'
            f'{_text(28, 62, "Computed report only · correlated seeds/repeats · no heldout threshold selection", font_size=12)}'
            + (_text(28, 84, banner, font_size=13, font_weight=600) if banner else "")
            + "".join(bodies) + _text(28, y + 20, footer, font_size=13, font_weight=600) + '</svg>\n')


def _family_values(index, seed, size, system, metric, intents):
    members = [index.get((seed, size, system, intent)) for intent in intents]
    return _mean(r.get(metric) if r and r.get("complete") is True else None for r in members)


def _sweep(report, populations):
    families = [r for r in _rows(report, "per_family") if r.get("cohort") == "NEW" and r.get("split") == "heldout"]
    index = _index(families, ("seed", "size", "system", "intent_id"))
    contrasts = _index([r for r in _rows(report, "contrasts") if r.get("split") == "heldout"], ("seed", "size", "system"))
    has_u = any(_family_values(index, seed, size, sy, m, FAMILIES) is None
                for seed in SEEDS for size in SIZES for sy in SYSTEMS for m, _ in METRICS)
    common = False
    if populations is not None:
        if (populations.get("before_target_embeddings_and_scores") is not True or
            populations.get("status") != "descriptive_only_not_new_primary_or_promotion_gate" or
            tuple(populations.get("common_fully_known_heldout_semantic_intents_all_three_seeds", [])) != COMMON):
            raise ValueError("requires the pre-embedding common-four descriptive population, not per-seed known-five")
        common = has_u
    bounds = {}
    for row in _rows(report, "new_uncertainty_sensitivity"):
        if row.get("cohort") != "NEW":
            continue
        for b in row.get("bounds", []):
            if b["split"] == "heldout":
                key = row["seed"], row["size"], b["system"], b["metric"]
                if key in bounds:
                    raise ValueError("duplicate sensitivity bounds")
                lo, hi = b["minimum"], b["maximum"]
                _num(lo); _num(hi)
                bounds[key] = None if lo is None or hi is None else (lo, hi)
    panels = []
    for metric, label in METRICS:
        for delta in (False, True):
            lines, primary_lines, common_lines = [], [], []
            for si, size in enumerate(SIZES):
                for sj, seed in enumerate(SEEDS):
                    primary = [_family_values(index, seed, size, sy, metric, FAMILIES) for sy in SYSTEMS]
                    if delta:
                        primary = [0 if primary[0] is not None else None] + [
                            contrasts.get((seed, size, sy), {}).get("paired_deltas", {}).get(metric) for sy in SYSTEMS[1:]]
                    base_label = f"size {size} · seed {seed} · full six"
                    primary_series = _series(base_label, primary, COLORS[si], DASHES[sj],
                        topk=None if delta else _family_values(index, seed, size, "topk10", metric, FAMILIES),
                        bounds=None if delta else [bounds.get((seed, size, sy, metric)) for sy in SYSTEMS])
                    lines.append(primary_series)
                    primary_lines.append(primary_series)
                    if common:
                        vals = [_family_values(index, seed, size, sy, metric, COMMON) for sy in SYSTEMS]
                        if delta:
                            vals = [v - vals[0] if v is not None and vals[0] is not None else None for v in vals]
                        topk = None if delta else _family_values(index, seed, size, "topk10", metric, COMMON)
                        common_series = _series(f"size {size} · seed {seed} · common four diagnostic", vals,
                                                COLORS[si], DASHES[sj], topk=topk)
                        common_series["compact_label"] = f"n={size} · seed{seed}"
                        lines.append(common_series)
                        common_lines.append(common_series)
            # Presentation projection only: retain every source series and its
            # null gaps / sensitivity bounds; compact nine identical N/A legends.
            collapse_null_legend = common and all(
                all(v is None for v in s["values"]) and s["topk"] is None for s in primary_lines)
            if collapse_null_legend:
                for s in primary_lines:
                    s["legend"] = False
                for s in common_lines:
                    s["legend_label"] = s["compact_label"]
            legend_note = "Full six-family metrics: N/A in all 9 seed/size cases (U)" if collapse_null_legend else None
            legend_columns = 3 if collapse_null_legend and all(
                all(v is not None for v in s["values"]) for s in common_lines) else 1
            notes = ["Equal family mean from per_family; required missing families keep full-six N/A.",
                     "Bands: analyzer full-six plausible U sensitivity; not CI; full IDCG in analyzer.",
                     "topk10 diamond is separate, never a radial threshold or primary candidate."]
            if common:
                notes.extend(["Diagnostic only — common four known families;", "original full six unavailable due U", "Same t04/t05/t06/t07 for every seed; not known-five or promotion metrics."])
            elif has_u:
                notes.append("Common-four population not supplied: full-six N/A remains unfilled.")
            panels.append(_panel(label + (" · Δ vs .50" if delta else " · absolute"),
                                 "NEW heldout semantic · per seed and catalog size", lines,
                                 ylim=None if delta else (0, 1), notes=notes,
                                 legend_note=legend_note, legend_columns=legend_columns, legend_topk=False))
    return panels, common


def _scores(report, full=False):
    groups = defaultdict(list)
    # Focus frozen before any geometry: biggest catalog, all heldout semantic
    # query×dataset pairs, every seed, root and child-max strictly separated.
    if not full:
        for seed in SEEDS:
            for path in ("root", "max_authorized_child"):
                groups[("NEW", seed, 2000, "semantic", "heldout", path)] = []
    for row in _rows(report, "native_score_distributions"):
        identity = tuple(row[f] for f in ("cohort", "seed", "size", "query_kind", "split", "score_path"))
        if not full and identity not in groups:
            continue
        if row["score_path"] not in ("root", "max_authorized_child") or str(row["dataset_grade"]) not in ("0", "1", "2", "3", "U"):
            raise ValueError("unknown native score path or dataset grade; ask report owner")
        edges, counts = row["bin_edges"], row["bin_counts"]
        if len(edges) != 51 or len(counts) != 50:
            raise ValueError("native score distributions require the analyzer's fixed 50 bins")
        for i, edge in enumerate(edges):
            if _num(edge, nullable=False) != i / 50:
                raise ValueError("native bin edges must be fixed [0,1] at 1/50")
        for field in ("n", "missing"):
            value = _num(row[field], field, nullable=False)
            if value < 0 or int(value) != value:
                raise ValueError(field + " must be a nonnegative count")
        for count in counts:
            value = _num(count, "bin count", nullable=False)
            if value < 0 or int(value) != value:
                raise ValueError("invalid histogram count")
        if sum(counts) != row["n"]:
            raise ValueError("histogram count differs from n")
        groups[identity].append(row)
    panels = {"PDF": [], "CDF": []}
    for identity, rows in sorted(groups.items(), key=lambda item: (*map(str, item[0][:-1]), "0" if item[0][-1] == "root" else "1")):
        _index(rows, ("dataset_grade", "score_path"))
        cohort, seed, size, kind, split, score_path = identity
        for mode in ("PDF", "CDF"):
            lines = []
            for row in sorted(rows, key=lambda r: (str(r["dataset_grade"]), r["score_path"])):
                grade = str(row["dataset_grade"])
                path = row["score_path"]
                if mode == "PDF":
                    density = row["conditional_density"]
                    if density is None:
                        vals = [None] * 100
                    else:
                        if len(density) != 50:
                            raise ValueError("conditional_density must contain 50 computed bins")
                        # Two endpoints per bin: no KDE or distribution reconstruction.
                        vals = [v for value in density for v in (value, value)]
                else:
                    cdf = row["cdf"]
                    if len(cdf) != 51 or any(_num(p["score"], nullable=False) != i / 50 for i, p in enumerate(cdf)):
                        raise ValueError("CDF must use the analyzer's fixed 51 edges")
                    vals = [p["fraction"] for p in cdf]
                if any(v is not None and _num(v, nullable=False) < 0 for v in vals):
                    raise ValueError("negative native distribution value")
                if mode == "CDF" and any(v is not None and v > 1 for v in vals):
                    raise ValueError("CDF fraction outside [0,1]")
                label = f"dataset grade {grade} · n={row['n']} missing={row['missing']}"
                xs = [edge for i in range(50) for edge in (i / 50, (i + 1) / 50)] if mode == "PDF" else [i / 50 for i in range(51)]
                lines.append(_series(label, vals, COLORS[("0", "1", "2", "3", "U").index(grade)], xs=xs))
            scope = "native root" if score_path == "root" else "native authorized-child max score"
            reported = sum(r["n"] + r["missing"] for r in rows)
            missing = sum(r["missing"] for r in rows)
            coverage = f"Reported pairs={reported}; missing scores={missing}"
            if not full:
                coverage += f"; target pairs={18 * size}."
            panels[mode].append(_panel(f"{cohort} · size {size} · seed {seed}",
                                 f"{mode} · {scope} · {kind} / {split}", lines,
                                 mode="score", ylim=(0, 1) if mode == "CDF" else None, cutoffs=True,
                                 notes=("Fixed 50 bins [0,1]; density per score unit; CDF values from report.",
                                        "Dataset grade is not child relevance or evidence completeness.",
                                        "Query×dataset pairs, not independent observations; includes U separately.",
                                        ("Target: all 18 fixed heldout semantic queries × ALL dataset IDs." if not full else "Each exact report kind/split/path population is preserved separately."),
                                        coverage,
                                        "Stored float32 docvalues script geometry; not Faiss/HNSW admission scores.",
                                        "Nominal .45/.50 cutoffs: SQ/HNSW may round or miss; equality ≠ admission.",
                                        "Boundary disagreement cause unproven; boosted/fused scores NOT this axis.",
                                        "Child maximum is pipeline scope, not every child's score or relevance.",
                                        "Default size2000 focus prespecified before geometry; other sizes in JSON.")))
    return panels


def _false_positives(report):
    rows = [r for r in _rows(report, "per_query") if r.get("cohort") == "NEW" and
            r.get("split") == "heldout" and r.get("kind") in _analysis.NEGATIVE]
    index = _index(rows, ("seed", "size", "system", "query_id"))
    ids = defaultdict(set)
    for row in rows:
        ids[row["seed"], row["size"]].add(row["query_id"])
    exposures = [r for r in _rows(report, "false_positive_exposures")
                 if r.get("split") == "heldout" and r.get("kind") in _analysis.NEGATIVE]
    exp = _index(exposures, ("seed", "size", "system", "query_id"))
    panels = []
    for k in (5, 10):
        for incremental in (False, True):
            lines = []
            for si, size in enumerate(SIZES):
                for sj, seed in enumerate(SEEDS):
                    qids = sorted(ids[seed, size])
                    vals = []
                    for sy in SYSTEMS:
                        if incremental:
                            if sy == SYSTEMS[0]:
                                # This is the identity reference only if every baseline query is available.
                                values = [0 if index.get((seed, size, sy, qid), {}).get(f"grade0_count_top{k}") is not None else None for qid in qids]
                            else:
                                values = [exp.get((seed, size, sy, qid), {}).get(f"new_grade0_top{k}") for qid in qids]
                        else:
                            values = [index.get((seed, size, sy, qid), {}).get(f"grade0_count_top{k}") for qid in qids]
                        vals.append(_mean(values) if len(qids) == 8 else None)
                    lines.append(_series(f"size {size} · seed {seed} · queries n={len(qids)} / expected 8", vals, COLORS[si], DASHES[sj]))
            panels.append(_panel(f"Negative queries · top{k} · {'new-ID additions vs .50' if incremental else 'absolute grade0'}",
                                 "Mean distinct dataset IDs/query · NEW heldout validated negatives", lines,
                                 notes=("New = report-computed candidate grade0 ID-set additions, NOT net count delta.",
                                        "Not proof of vector causality: prior keyword eligibility can promote into topK.",
                                        "Grade1/U excluded; no raw ranks read; missing rows keep matched means null.",
                                        "Counts, native crossings and full-eligibility vector admission are distinct.")))
    return panels


def _latency(report):
    groups = defaultdict(list)
    for row in _rows(report, "latency"):
        n = _num(row["n"], "latency sample count", nullable=False)
        if n < 0 or int(n) != n:
            raise ValueError("latency n must be a nonnegative integer")
        if n < 100 and row.get("guard_eligible") is True:
            raise ValueError("n<100 cannot be guard eligible")
        groups[row["group"]].append(row)
    panels = []
    for group, rows in sorted(groups.items()):
        index = _index(rows, ("seed", "size", "system"))
        for metric in ("median_ms", "p95_ms"):
            lines = []
            for si, size in enumerate(SIZES):
                for sj, seed in enumerate(SEEDS):
                    rs = [index.get((seed, size, sy)) for sy in SYSTEMS]
                    ns = []
                    eligible = []
                    for r in rs:
                        ns.append("N/A" if r is None else str(r["n"]))
                        eligible.append(r is not None and r.get("guard_eligible") is True)
                    count_label = f"n={ns[0]} each" if len(set(ns)) == 1 else "n=" + "/".join(ns)
                    status = "report guard eligible" if all(eligible) else "descriptive / no guard where ineligible"
                    topk = index.get((seed, size, "topk10"))
                    lines.append(_series(f"{size} / {seed} · {count_label} · {status}",
                        [r.get(metric) if r else None for r in rs], COLORS[si], DASHES[sj],
                        topk=topk.get(metric) if topk else None))
            notes = ["Local warmed client milliseconds · one warmup excluded; 10 measured/query.",
                     "p95: frozen analyzer interpolation (n−1)×.95; never recomputed here.",
                     "n<100: descriptive p95, NO guard; heldout exact expected n=90.",
                     "Repeated requests are correlated; no p95 invariance or production-latency claim."]
            topks = [r for r in rows if r["system"] == "topk10"]
            if topks:
                notes.append("topk10 separate n by size/seed: " + "; ".join(f"{r['size']}/{r['seed']}={r['n']}" for r in topks[:3]))
                for start in range(3, len(topks), 3):
                    notes.append("topk10 n continued: " + "; ".join(f"{r['size']}/{r['seed']}={r['n']}" for r in topks[start:start+3]))
            panels.append(_panel(f"{group} · {'median' if metric == 'median_ms' else 'descriptive p95'} (ms)",
                                 "Separate fixed query population; counts follow .50/.48/.46/.45/.44/.42/.40", lines, notes=notes))
    return panels


def render_report(report, output_dir, *, descriptive_populations=None, full_distributions=False):
    """Write exclusive SVG pages and return their Paths; never read actual inputs.

    `report` must be the computed dictionary returned by threshold/analyze.py.
    `descriptive_populations` is the separately frozen pre-embedding dictionary,
    not a path or a data-selected subset. Existing targets always raise.
    """
    if not isinstance(report, dict) or type(report.get("schema_version")) is not int or report["schema_version"] != 1:
        raise ValueError("expected computed analyzer report schema_version=1")
    diagnostic = (report.get("diagnostic_policy") is not None or
                  report.get("analysis_mode") == "forced_D_nonpromotional" or
                  report.get("forced_recommendation") == "D")
    footer = ("Diagnostic only; recommendation D; not production evidence" if diagnostic else
              "Descriptive only; analyzer decisions not certified by this plotter; not production evidence")
    sweep, common = _sweep(report, descriptive_populations)
    scores = _scores(report, full=full_distributions)
    sections = [("threshold-sweep", "Threshold sweep · absolute values and matched .50 deltas", sweep),
                ("native-score-pdf", "Stored-vector L2 score PDF · unboosted script geometry", scores["PDF"]),
                ("native-score-cdf", "Stored-vector L2 score CDF · unboosted script geometry", scores["CDF"]),
                ("negative-false-positives", "Negative-query grade0 exposures · absolute and incremental", _false_positives(report)),
                ("latency", "Frozen local warmed latency · median & interpolated p95", _latency(report))]
    documents = []
    for stem, title, panels in sections:
        chunks = [panels[i:i + 6] for i in range(0, len(panels), 6)] or [[]]
        for number, chunk in enumerate(chunks, 1):
            name = stem + (f"-{number:03d}" if len(chunks) > 1 else "") + ".svg"
            banner = COMMON_LABEL if stem == "threshold-sweep" and common else None
            documents.append((name, _document(title, chunk, footer, number, banner)))
    target = Path(output_dir)
    target.mkdir(parents=True, exist_ok=True)
    paths = [target / name for name, _ in documents]
    # Check the full set before touching any existing deliverable. x-mode also
    # protects against a race; an already-created file is never overwritten.
    for path in paths:
        if path.exists() or path.is_symlink():
            raise FileExistsError(path)
    for path, (_, content) in zip(paths, documents):
        with path.open("x", encoding="utf-8") as stream:
            stream.write(content)
    return paths


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path, help="already-computed analyzer JSON; never a raw run manifest")
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--descriptive-populations", type=Path)
    parser.add_argument("--full-distributions", action="store_true", help="paginate every native score identity instead of the prespecified size2000 heldout semantic focus")
    args = parser.parse_args(argv)
    report = json.loads(args.report.read_text(encoding="utf-8"))
    populations = json.loads(args.descriptive_populations.read_text(encoding="utf-8")) if args.descriptive_populations else None
    for path in render_report(report, args.output_dir, descriptive_populations=populations,
                              full_distributions=args.full_distributions):
        print(path)


if __name__ == "__main__":
    main()
