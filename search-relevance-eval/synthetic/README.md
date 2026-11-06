# Controlled synthetic hybrid-search benchmark — #3903

This suite extends the existing [evaluation harness](../README.md), not production ranking. It complements the real-catalogue pilot in #3901/PR #3902; synthetic design truth is **not** human relevance ground truth or production-representative utility.

**Status:** the original confirmatory validation is incomplete. Independent review verified40,488 query/document/seed labels but retained12 as U (a057 under factory-sanitation and ambiguous plant intents). Queries, criteria and proposed qrels were not changed to force agreement. Only an explicitly approved [supplementary diagnostic replay](diagnostic-protocol.md) is permitted; its recommendation is **forced C**, with promotion disabled regardless of outcomes.

## Registration and responsibilities

The original 75 query texts, relevance rules, 180 stable record plans, expected grades, three seeds, eight systems, split and decision gates were frozen in commit `c9139bd4b419a9c815d3135d57b8c42d4f54317f` **before dataset generation**. An independently reviewed compatibility correction was re-frozen in commit `c70f46f5f`: title-only *primary* metadata still appears in the mandatory production-derived queryContext. It changes no query, label, ID, seed, system or weight. All original bytes/checker remain in [v1 history](registration-history/v1/archive-manifest.json); [the amendment](registration-amendment-v2.json) and active [freeze](spec-freeze.json) are auditable.

- Architect: frozen [intents](intents.jsonl), [queries](query-spec.jsonl), [generation requirements](generation-spec.json), [rubric](relevance-rubric.md), [decision gates](decision-gates.json).
- Generator: deterministic searchable metadata from those requirements; no embeddings/rankings/outcomes.
- Independent validator: actual text and field evidence, not generator tags or search results. All anchors/near misses/partial rules and answerability must pass before retrieval. See [validation instructions](validation-prompt.md) and [preflight audit](validation-plan.md).
- Engine implementer: shared production exporter, replay, real embeddings/analyzers and correctness controls; cannot repair labels or tune weights after seeing scores.
- Analyst: validated frozen qrels and machine outputs, per-seed/per-intent comparisons, exact-match regressions and explicit A/B/C decision.

## Corpus and queries

Each seed has a joint 180-record index: Suite A exactly20 cocoa/cacao,50 confectionery,30 chocolate-flavoured beverages; Suite B80 confusable technical/product identifier records. The other suite acts as a distractor. IDs and intended claims stay fixed across seeds39031,39032,39033; natural wording, metadata length/completeness, publishers, numeric examples and distribution variants change. Neutral primary quality1 avoids confounding relevance with quality boosts; fixed supplementary quality/spatial probes audit scorer placement separately.

There are36 semantic queries over12 independent intents,24 exact/near-exact queries,9 functional queries over3 intents,4 ambiguous diagnostics and2 no-answer diagnostics. Whole intent families—not individual paraphrases—are held out. The main relevance cohort is8 held-out Suite A families; exact precision is separately scored on all24 critical cases. No-answer and ambiguous cases never become ordinary zero-NDCG wins.

Baseline raw50, raw_boost1, normalized .3/.7, .5/.5, .7/.3, normalized .3/.7 retaining50, keyword and vector use the same corpus/mapping/query vectors and depth10. Matched-boost contrasts distinguish normalization from removing boost50. Actual OpenSearch analyzer tokens are evidence; no unconfigured equality/keyword field is assumed.

## Local safety and reuse

Use Python3.9+, the repository's sbt/Java build, local OpenSearch2.19.1 with the production synonym inputs, and pinned embedding-api1.1.0 image digest `sha256:7faca54ae24ce1c03d4213d3a3c2109ff57b23c644e4d22523e1c861201fb6ec` (GTE-base-en-v1.5,768 dimensions,q8). Never point replay at dev.magda.io or production. Corpus generation and ordinary CI use no network. Writes require explicit loopback endpoints, an owned `magda-relevance-eval-*` prefix and local-write opt-in. Existing user indexes/region indexes are not modified.

The actual Registry/Indexer/OPA baseline regressions run only inside an isolated disposable Docker daemon because the existing ServiceRunner globally prunes its daemon. [Seven real-service tests passed](service-regressions.md); this is baseline authorization evidence, not a claim that every normalized request was tested through real OPA.

## Before execution

```sh
python3 search-relevance-eval/synthetic/freeze.py verify
python3 search-relevance-eval/synthetic/generate.py \
  --output-dir search-relevance-eval/synthetic/.local/corpora-v4
```

The generator refuses unknown existing bytes. Historical first-realization prose defects and pre-retrieval text corrections must be preserved, not overwritten or tuned using scores. A generator self-check is **not** the independent validation gate. The final corpus paths/hashes and full query×record qrels must be bound to a passed independent validation manifest plus explicit parent approval before any embedding/replay command can proceed.

### One-command reproduction

First verify all frozen generation/evidence without network or services:

```sh
python3 search-relevance-eval/synthetic/reproduce.py --diagnostic-only --validate-only
```

Then rerun using this suite's pinned, loopback-only Docker Compose services (Java11/sbt1.4.9 must be installed):

```sh
python3 search-relevance-eval/synthetic/reproduce.py \
  --diagnostic-only --secondary-topk --compose --allow-local-writes --sbt sbt
```

This explicitly opts into the supplemental forced-C scope; omission does **not** silently fall back to partial validation. It exclusively restores the sealed historical review sources (including rejected/corrected source snapshots) from [the hash-bound archive](review-source-archive.json), regenerates byte-identical final text/qrels, rechecks the actual independent observations and U mask, runs local controls, prepares all three vector sets before timing, and reuses the shared production exporter/replay/metrics. Use a new empty `--artifact-root` for another run; previous results are never overwritten. Existing correctly pinned local services may instead be supplied using `--engine-url` and `--embedding-url` (omit `--compose`).

Compose services remain available for inspection. Remove only this suite's own project when finished:

```sh
docker compose -f search-relevance-eval/synthetic/compose.yaml down --volumes
```

The wrapper does not rerun the historical full Registry/Indexer/OPA integration suite. Those [baseline service regressions](service-regressions.md) remain separate evidence, not a claim that every normalized candidate was exercised through real OPA. See the final report/results for actual diagnostic replay status and limitations.

## Results and release checks

See the [report](report.md) and [machine results](results/analysis.json). Across the three seeds, the primary normalized profile improves the seven known semantic-family NDCG means by +.171/+.199/+.140, but exact lookup top1 falls17→15,18→17,15→13 out of24. This is not the unavailable eight-family confirmatory primary; recommendation stays C.

Release checks:248 offline tests,26 unchanged Scala search/access-filter tests and7 actual Registry/Indexer/OPA baseline tests passed. Primary radial controls23/23 and quality/spatial probes passed; the reused radial exact-set oracle failed under k1 candidate-pool truncation, so complete normalized top-k coverage is not claimed. All21 owned benchmark resources were [cleaned up](results/cleanup.json); existing user resources were preserved.

## Offline tests

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s search-relevance-eval -p 'test_*.py' -v
```

The existing offline CI discovers this subpackage. Metrics reuse the parent NDCG/latency implementations, including undefined zero-IDCG handling. Seed-level regressions and exact target displacement cannot be averaged away by an overall improvement.
