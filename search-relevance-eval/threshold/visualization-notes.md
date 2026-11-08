# Threshold report SVG presentation

## Boundary and status

[Renderer](</Users/t1000/development/magda/search-relevance-eval/threshold/visualize.py>) is a presentation-only stdlib SVG consumer of the dictionary returned by [analyzer](</Users/t1000/development/magda/search-relevance-eval/threshold/analyze.py#L1078-L1182>). No actual report, model output, ranking, vector, generated corpus, new score, sweep or backend was read/run to implement it. [Tests](</Users/t1000/development/magda/search-relevance-eval/threshold/test_visualize.py>) construct invented computed rows only, in temporary directories. Parent alone owns actual execution/release and later human report tables. No architecture, gate, label, evaluator or production request changes are made here.

## API and exclusive output

```python
paths = visualize.render_report(
    computed_report,
    output_dir,
    descriptive_populations=pre_embedding_population_dictionary,
)
```

The population dictionary is optional. Without it, undefined full-six means remain undefined: no known-only fallback is inferred. It must identify the pre-embedding, all-seed common `t04/t05/t06/t07` population, not a different known-five set for each seed. The [pre-embedding population registration](</Users/t1000/development/magda/search-relevance-eval/threshold/descriptive-populations.json>) is an explicit caller input; the renderer never implicitly opens it.

CLI, after parent authorizes analysis and supplies a computed report:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 search-relevance-eval/threshold/visualize.py \
  COMPUTED_REPORT.json OUTPUT_DIRECTORY \
  --descriptive-populations search-relevance-eval/threshold/descriptive-populations.json
```

All output paths are under the directory explicitly passed by the caller, not a service directory. Returns a list of `Path` objects. Every destination is preflighted and opened with exclusive `x` mode; an existing file or dangling symlink raises `FileExistsError`. There is deliberately no overwrite/force switch. Existing unrelated files are untouched. Race-time creation can leave earlier newly created pages; it cannot overwrite a competing file. Use a new directory for each released report.

## Default documents and prespecified native focus

Five document types, white panels, two columns, maximum six panels/page:

1. **Threshold sweep**: three metrics × absolute/matched-.50 delta. All seven registered systems appear in order `.50, .48, .46, .45, .44, .42, .40`, with distinct catalog-size colors and seed dash patterns. `.45` is marked **fixed primary, not a selected winner**. Separate topk10 diamonds sit outside the radial axis and are never connected into the sweep or assigned cutoff0. Their values remain in accessible marker titles, not repeated in every sweep legend. When all nine full-six radial/topk series are null, their duplicate legend entries collapse to one neutral statement: **Full six-family metrics: N/A in all 9 seed/size cases (U)**. All eighteen source series, null gaps and any supplied full-six sensitivity bands remain unchanged. The nine common-four legends use concise catalog `n`/seed labels in three columns; any partially missing common-four series retains a single-column legend with explicit N/A gap count. A partly defined full-six series prevents collapse.
2. **Native score PDF**: six panels, three seeds × separate root / authorized-child maximum.
3. **Native score CDF**: the same six exact populations.
4. **Negative-query grade0 exposures**: absolute and new-ID-addition counts at top5/top10, independently by seed and catalog size, on the fixed eight heldout validated negatives. These are exposure plots, **not vector-causality plots**.
5. **Latency**: median and interpolated p95 for every named report group. Only this document type normally needs extra pages (six panels/page); groups are never silently dropped to keep one sheet.

The default native source focus was fixed **before any geometry/outcome inspection**: `cohort=NEW`, `size=2000`, `query_kind=semantic`, `split=heldout`, all three seeds, score paths `root` and `max_authorized_child` in separate panels. Its target is all eighteen fixed heldout semantic queries crossed with all dataset IDs, not just returned hits/useful pairs. Each panel displays reported pair count (sum of `n+missing`), missing scores and the fixed 36,000-pair target, rather than claiming a partial report is complete. Grades0/1/2/3/U remain separate overlays with source `n` and `missing` counts. These are query×dataset pairs, **not independent observations**. The root panel is left and child-max panel right for each seed.

The child maximum is the native authorized-child maximum in the analyzer pipeline, **not** a score for every child or child relevance truth. Dataset grade is not independent branch evidence completeness or a child-local qrel. The histogram report does not contain an independent branch-evidence-role facet; none is fabricated.

Core60/1000 and other kinds/splits remain in the complete machine report. Optional `full_distributions=True` or CLI `--full-distributions` exports every exact native population in bounded pages. Default rendering never repools those identities or chooses a favorable subset after outcomes.

## Exact computed source fields

| Presentation | Fields consumed from computed analyzer report |
|---|---|
| Full-six absolute curves | `per_family`: `cohort`, `seed`, `size`, `system`, `split`, `intent_id`, `complete`, `recall_at_10_ge_2`, `success_at_5_ge_2`, `ndcg_at_10` |
| Full-six paired deltas | **`contrasts`**, not an invented `comparisons` key: `seed`, `size`, `system`, `split`, `paired_deltas[metric]`; baseline is identity0 only when defined |
| Common-four descriptive absolute/delta | The same `per_family` rows, exactly t04–t07 across all seeds, using analyzer `_mean` for equal family means; subtraction of presented computed means only |
| Separate full-six uncertainty ranges | `new_uncertainty_sensitivity`: `cohort`, `seed`, `size`, `bounds[{system,split,metric,minimum,maximum}]`; no scenarios evaluated or interval manufactured |
| Native PDF/CDF | `native_score_distributions`: `cohort`, `seed`, `size`, `query_kind`, `split`, `dataset_grade`, `score_path`, `n`, `missing`, `bin_edges`, `bin_counts`, `conditional_density`, `cdf[{score,fraction}]` |
| Absolute negative exposures | `per_query`: NEW/heldout negative `kind`, `seed`, `size`, `system`, `query_id`, `grade0_count_top5`, `grade0_count_top10` |
| Incremental negative exposures | `false_positive_exposures`: `seed`, `size`, `system`, `split`, `kind`, `query_id`, `new_grade0_top5`, `new_grade0_top10`; ID-set difference already computed upstream |
| Frozen latency | `latency`: `group`, `seed`, `size`, `system`, `n`, `median_ms`, `p95_ms`, `guard_eligible` |
| Mandatory diagnostic footer | Non-null `diagnostic_policy`, or `analysis_mode=forced_D_nonpromotional`, or `forced_recommendation=D` |

Unknown source schemas should be resolved with the analyzer owner, not adapted with guessed aliases. Mixed diagnostic role-pair result grids and eligibility attribution events are not relabeled as primary candidates. Separate growth-difference tables remain the human report writer's task; the plotter does not recreate growth gates or an attribution engine.

## Nulls, uncertainty, score axes and interpretation

- Full-six uses **all** t03–t08, with no dropping of unavailable families. Missing/null values split polyline segments and get visible N/A counts. Entire unavailable panels say N/A, not an empty-looking success. Missing matched FP rows keep the fixed-query mean null; fewer than eight negative query IDs also gives N/A.
- If the original full-six aggregate is unavailable and the registered population dictionary is supplied, the additional curves are always labeled: **Diagnostic only — common four known families; original full six unavailable due U**. They never replace primary rows, imply original validation, or create promotion metrics. Per-seed known-five means are not substituted.
- Full-six plausible U sensitivities use the analyzer's already computed minima/maxima, drawn **separately** from common-four point curves. Analyzer handles full-IDCG recomputation and correlation. Bands are assumption-dependent ranges, **not statistical confidence intervals**. No paired-delta interval is invented from unrelated endpoint subtraction.
- PDF is a step drawing of the report's fifty fixed `[0,1]` density bins, using exact bin endpoints. CDF connects the report's fifty-one edge fractions, not a reconstructed raw-score ECDF or smoothed estimate. Vertical cutoffs are only `.45` and `.50`, labeled as **nominal minScore cutoffs**, not admission guarantees. The exact source is `engine_exact_docvalues_l2`: **unboosted stored-vector L2 score (script geometry)** from stored float32 docvalues, separately root and authorized-child maximum. These are not Faiss/SQ/HNSW admission scores or an exact HNSW oracle. Approximate retrieval and index SQ fp16 may round or miss; equality at a nominal cutoff does not guarantee admission. A boundary disagreement does not prove quantization caused it. Model q8 inference and index SQ fp16 are independent mechanisms; neither is inferred from these plots. Root boost50 and raw boosted/fused scores are **not** this axis. No new cutoffs, KDE or normalization is computed.
- New grade0 topK exposure is the report-computed addition count relative to the same baseline topK. It is **not** candidate absolute minus baseline absolute: substitutions can add IDs while leaving total counts unchanged. Keyword-eligible rank promotion still counts as a new exposure. These plots do not turn an old keyword OR mistake into a newly vector-admitted document. Grade1 is not FP; U is not0. Native crossings, actual full eligibility admission and topK rank exposure require separate upstream attribution, not plotting inference.
- Latency uses source median/p95 values without recomputing percentiles or samples. Counts are visible per system (or `n=... each` if identical), including separate topk counts. Groups with `n<100`, including heldout exact n90, display descriptive interpolated p95 and **NO guard**. Claiming guard eligibility at n<100 raises. The frozen interpolation is `(n−1)×.95`; correlated repeats are not production latency or statistical proof. Missing values stay null gaps. No invariance claim is inferred from an unchanged summary.
- Every page under active diagnostic policy has the literal footer **Diagnostic only; recommendation D; not production evidence**, even if a stale supplied decision says A. Strict-mode decisions are also explicitly **not certified by this plotter**. No green winner/promotion style is used.
- Strings use `html.escape`; files have the XML SVG namespace, pixel units, title/description and system-font text. Plotted numerics reject booleans/nonfinite values. No unsafe HTML binding or generated image service is involved.

## Validation

Run only invented computed-row unit tests:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s search-relevance-eval/threshold -p test_visualize.py -v
```

Tests cover XML parseability, exact source/bin coordinates, all seed/size curves, common-four registration, full-six nulls and uncertainty bounds, no known-only promotion, gap topology, exclusive-file preflight, bounded optional pagination, HTML escaping, finite-number validation, new-ID additions despite unchanged totals, missing exposure rows, n90 descriptive p95, missing latency rows, source-object immutability and no evaluator calls. Actual data publication is intentionally not tested/run here.
