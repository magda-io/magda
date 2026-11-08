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
- The original #3902 and #3909 bundles were not committed to Magda, but both originals have now been recovered without regeneration/repacking and preserved as checksummed GitHub Release assets in the private artifact repository below. Their exact bytes match both the original committed manifests and the independently downloaded release copies. They remain outside Magda's Git history. This restores the retained historical bundle scope, not a complete machine/container/model environment or full public-catalogue export.
- Do not rewrite or prune the historical evaluation commits simply to shrink the branch: preserve provenance. For future studies prefer a smaller tracked source/results tree plus explicitly retained, checksummed release/CI artifacts.

## Original reproduction bundles: durable private release

**Repository:** [magda-io/magda-search-eval-artifacts](https://github.com/magda-io/magda-search-eval-artifacts) (private; authentication with read access required). Large assets are stored in **GitHub Releases**, not committed into either repository's source history.

**Prerelease:** [Magda Search Relevance Evaluation — 2026 Archive](https://github.com/magda-io/magda-search-eval-artifacts/releases/tag/search-relevance-eval-2026-v1), tag `search-relevance-eval-2026-v1`. [SHA256SUMS](https://github.com/magda-io/magda-search-eval-artifacts/releases/download/search-relevance-eval-2026-v1/SHA256SUMS) covers both original filenames.

| Evaluation / original manifest | Original release asset | Exact bytes | SHA-256 |
|---|---|---:|---|
| [PR #3902](https://github.com/magda-io/magda/pull/3902), [pilot manifest](results/pilot/reproduction-bundle.json) | [magda-3901-frozen-evaluation-inputs.tar.gz](https://github.com/magda-io/magda-search-eval-artifacts/releases/download/search-relevance-eval-2026-v1/magda-3901-frozen-evaluation-inputs.tar.gz) | 58,472,927 | `e52c3d913b2e7b7a05b9888299438607946d3c5ba555599fcb38441070ad13bd` |
| [PR #3909](https://github.com/magda-io/magda/pull/3909), [synthetic manifest](synthetic/results/reproduction-bundle.json) | [magda-3903-frozen-execution.tar.xz](https://github.com/magda-io/magda-search-eval-artifacts/releases/download/search-relevance-eval-2026-v1/magda-3903-frozen-execution.tar.xz) | 44,068,152 | `f2643eb7180f229407c99e6af2cdb40ccf1f7d5369120ed122776dc3fb836aea` |

The real-pilot gzip contains18 files: the selected494-record public metadata snapshot, selection/acquisition evidence,15 tasks, frozen corpus/query vectors, actual production request/mapping exports, raw runs/request receipts, protocol, anchors and WordNet input. It does not contain the full113,117-record Registry inventory or downloaded distribution files. The synthetic XZ contains261 files: historical evaluation source/protocols, three synthetic corpora, frozen vectors, actual exports/raw replay evidence and known/U/review provenance, including a nested review-source archive.

### Download, verify, restore — no services required

Use Python3.9+ and an authenticated `gh` CLI. Start with fresh sibling checkouts (example below); use new directory names if they already exist. Do not modify a current working tree or unpack historical source over this consolidated archive.

```sh
gh repo clone magda-io/magda -- --single-branch --branch archive/search-relevance-evaluations-2026
gh repo clone magda-io/magda-search-eval-artifacts
cd magda
mkdir -p search-relevance-eval/.local
mkdir search-relevance-eval/.local/original-bundle-downloads
gh release download search-relevance-eval-2026-v1 \
  --repo magda-io/magda-search-eval-artifacts \
  --dir search-relevance-eval/.local/original-bundle-downloads
(cd search-relevance-eval/.local/original-bundle-downloads && shasum -a 256 -c SHA256SUMS)
```

Compare the exact sizes/checksums above as well as the authenticated release checksums. The [standard-library verifier](https://github.com/magda-io/magda-search-eval-artifacts/blob/main/verify_bundle.py) checks the complete original archives and **every member** against the trusted committed Magda manifests, rejecting missing/extra/duplicate/nonregular/unsafe paths. It makes no backend/model/search requests:

```sh
python3 ../magda-search-eval-artifacts/verify_bundle.py \
  --bundle search-relevance-eval/.local/original-bundle-downloads/magda-3901-frozen-evaluation-inputs.tar.gz \
  --manifest search-relevance-eval/results/pilot/reproduction-bundle.json
python3 ../magda-search-eval-artifacts/verify_bundle.py \
  --bundle search-relevance-eval/.local/original-bundle-downloads/magda-3903-frozen-execution.tar.xz \
  --manifest search-relevance-eval/synthetic/results/reproduction-bundle.json
```

To restore, repeat the corresponding command with **`--restore-to search-relevance-eval/.local/restored-pilot3901`** or **`--restore-to search-relevance-eval/.local/restored-synthetic3903`**. Each destination must not already exist. Verification completes before restoration; existing code/files are never overwritten. The pilot snapshot has flat members such as `corpus.jsonl` and `development-runs.jsonl`; the synthetic snapshot retains repository-relative `search-relevance-eval/...` paths. Original historical source in that snapshot can differ from the consolidated branch: keep it isolated and use a disposable matching historical checkout for any service replay. Restoring archives is not itself rerunning or validating a benchmark.

Original workspace archive locations were `search-relevance-eval/.local/magda-3901-frozen-evaluation-inputs.tar.gz` and `search-relevance-eval/synthetic/.local/magda-3903-frozen-execution.tar.xz`. Both original files were retained after the published copies passed independent full-hash verification; no original bundle bytes were changed.

### Reproduction environment and retained limitations

- Follow the [pilot instructions](README.md), [synthetic instructions](synthetic/README.md), [production exporter instructions](scala/README.md) and [pinned synthetic Compose services](synthetic/compose.yaml). The original production baseline is `ba18156201c50565c85c62f76469245925994ece`.
- Service replay requires Java11/sbt1.4.9, appropriate Scala/dependency tooling, OpenSearch2.19.1 with the recorded Faiss/HNSW/L2 mapping and WordNet synonym input, and the recorded embedding environment. The synthetic Compose pins OpenSearch image digest `72fe2fc84be8295906b8efca020b46c58ed45c8da60cd9b8b49e1991e38e89a4` and embedding API digest `7faca54ae24ce1c03d4213d3a3c2109ff57b23c644e4d22523e1c861201fb6ec`. Frozen vectors preserve historical inputs without new inference; re-embedding/model availability is a separate requirement, not guaranteed by these bundles.
- A different host, index construction or approximate engine can change ranking/timing; exact old results are preserved as raw evidence, not promised to reappear bit-for-bit in a new service run. No service or search evaluation was executed during this archival task. Clean-checkout verification covered archive/member integrity and isolated restoration, not backend replay.
- Preserve all historical unknown labels, failed controls and C/D dispositions. Newly restored data does not turn diagnostic outcomes into validated production recommendations. Public catalogue metadata can contain public contact names/emails; it is not claimed to be free of public personal information. Archive-wide content/path scans found no active credential/API/private-key material or unrelated private workspace files. Historical source does retain explicit loopback-only demo passwords and dummy credential/test-URL fixtures, not discovered live provider credentials. These checks are not a formal proof of absence of every possible secret or privacy defect.
- **#3913 is not duplicated here.** Its existing [four-part capture manifest](threshold/capture-archive-parts.json), [checksummed restoration](threshold/capture-restore-notes.md) and [offline instructions](threshold/REPRODUCE-RESULTS.md) remain in this Magda branch unchanged.

## Maintenance policy

- Keep this branch as a **long-lived reference**, not the default branch or an automatically deployed test target.
- Closing evaluation PRs **without merging** does not delete this branch and does not change `main`. Avoid deleting this archive while its evidence is needed.
- OpenSearch, k-NN / FAISS, indexing, Magda query-builder, permissions, score calibration, and embedding model may change. Revalidate all assumptions before reusing it after an OpenSearch 3.x upgrade.
- The recorded outcomes are engineered diagnostics, **not** human-labelled proof of production search quality or a universal optimal threshold.
