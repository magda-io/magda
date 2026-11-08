# Archived Magda search-relevance evaluation suite (2026)

> **Status: archived, evaluation-only.** This branch is retained as a reference/replay starting point; it is **not** merged into `main`, is **not** a production search implementation, and does **not** authorize deployment of experimental search configurations.

## What is preserved

This branch was created directly from [PR #3913](https://github.com/magda-io/magda/pull/3913)'s commit `26466fdf9ca871d764f47075dd8fb4b5be4a2da4` (before adding this file). The three evaluation pull requests were stacked:

```text
main (pinned baseline following #3900)
  └─ #3902  eval/hybrid-search-fusion-3901
      └─ #3909  eval/synthetic-hybrid-benchmark-3903
          └─ #3913  eval/hybrid-minscore-threshold-3887
              └─ archive/search-relevance-evaluations-2026
```

Because the last head contains the earlier heads' work, this **single branch contains all three evaluations and their Git history**. No cherry-picking, squash merge or changes to production scoring are required.

| PR / issue | Study | Outcome | Main entry points |
| --- | --- | --- | --- |
| [#3902](https://github.com/magda-io/magda/pull/3902) / [#3901](https://github.com/magda-io/magda/issues/3901) | Real public-catalogue sample (494 datasets, 15 tasks); blinded agent judgments and reusable replay/exporter/metrics | **C, inconclusive**. Only one of eight held-out positive-intent tasks had defined NDCG due to inadequate positive coverage | [README](README.md), [report](report.md), [pilot results](results/pilot/) |
| [#3909](https://github.com/magda-io/magda/pull/3909) / [#3903](https://github.com/magda-io/magda/issues/3903) | Target-driven, three-seed synthetic suite: 100 cocoa/chocolate/chocolate-milk records + 80 confusable identifier records per seed | **C, diagnostic only**. Known seven-family semantic NDCG@10 improved **+0.140 to +0.199** with normalized 0.3/0.7 fusion, but exact-ID top-1 accuracy worsened each seed and 12 label pairs remain U | [README](synthetic/README.md), [report](synthetic/report.md), [analysis](synthetic/results/analysis.json) |
| [#3913](https://github.com/magda-io/magda/pull/3913) / [#3887](https://github.com/magda-io/magda/issues/3887) | Native `minScore` sweep (0.50/0.48/0.46/0.45/0.44/0.42/0.40), top-k diagnostic, three 60/1,000/2,000-record synthetic growth corpora, inherited and real-catalogue controls | **D, inconclusive/nonpromotional**. At 2,000 records, `0.45` gives descriptive four-family NDCG gains of **+0.025 to +0.034**, but increases irrelevant exposure and demotes some exact targets; unresolved labels and fixture-conformance defects block default change | [methods](threshold/REPORT-GITHUB.md), [quantitative results](threshold/RESULTS-GITHUB.md), [reproduction](threshold/REPRODUCE-RESULTS-GITHUB.md) |

**Maintainer decisions:** [#3885](https://github.com/magda-io/magda/issues/3885) was closed/deferred with **existing raw fusion retained**, to revisit during an OpenSearch 3.x / Magda v9 architecture assessment. [#3887](https://github.com/magda-io/magda/issues/3887) was completed with **`minScore = 0.50` retained**. Neither the normalized fusion rewrite nor a lower threshold is approved by these studies.

## Reproducing and reusing the archive

1. Check out `archive/search-relevance-evaluations-2026` or a new branch created from it. Read [the base harness](README.md) before using the supplementary suites.
2. For the *original real-catalogue pilot*, follow [the pilot README](README.md) and [report](report.md). Reacquiring public metadata today does **not** reproduce the same 494-record historical snapshot; exact reproduction needs its frozen historical inputs.
3. For the *controlled synthetic study*, follow [synthetic/README.md](synthetic/README.md) and [synthetic/report.md](synthetic/report.md). Its diagnostic replay has **forced C**, not a validated all-label primary result; preserve `U` rather than coercing it to zero.
4. For *the completed threshold study*, first try the [offline reproducibility instructions](threshold/REPRODUCE-RESULTS-GITHUB.md). They document the compressed captures, exact input hashes, safe restoration and analysis-only replay; an OpenSearch/model rerun is a **new** experiment.
5. Any new study should use a **fresh pre-registered set of queries, labels, seeds and decision gates**, retest the actual production query builder and model/mappings, and establish a new held-out set. Never tune against the archived held-out results and claim independent validation.

### Artifact completeness and size

- This branch includes source, scripts, protocol documents, compact outputs, synthetic generation/validation evidence and the committed threshold capture archive pieces named by [threshold/capture-archive-parts.json](threshold/capture-archive-parts.json) (~149.8 MB compressed, four Git files). The threshold analysis is also preserved in compressed form. These binaries are why this is intentionally an **archive branch**, not a normal production PR.
- The **complete original frozen raw inputs** from #3902 were **not committed**; [the pilot bundle manifest](results/pilot/reproduction-bundle.json) contains hashes only and the original bundle lived under `search-relevance-eval/.local/`. Likewise, #3909's complete frozen execution bundle (~44 MB compressed) was not committed; see [the synthetic bundle manifest](synthetic/results/reproduction-bundle.json). Their compact published results and reproducible code **are** in this branch, but those uncommitted historical blobs cannot be recovered from Git alone. If the original evaluation agent still has the bundles, export them to durable storage, confirm SHA-256 and attach their location to this document. Do not claim complete byte-for-byte restoration of those two historical raw runs without them.
- Do not rewrite or prune the historical evaluation commits simply to shrink the branch: preserve provenance. For future studies prefer a smaller tracked source/results tree plus explicitly retained, checksummed release/CI artifacts.

## Maintenance policy

- Keep this branch as a **long-lived reference**, not the default branch or an automatically deployed test target.
- Closing evaluation PRs **without merging** does not delete this branch and does not change `main`. Avoid deleting this archive while its evidence is needed.
- OpenSearch, k-NN / FAISS, indexing, Magda query-builder, permissions, score calibration, and embedding model may change. Revalidate all assumptions before reusing it after an OpenSearch 3.x upgrade.
- The recorded outcomes are engineered diagnostics, **not** human-labelled proof of production search quality or a universal optimal threshold.
