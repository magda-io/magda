# Search fusion evaluation — #3901 (evaluation only)

This directory evaluates [#3885](https://github.com/magda-io/magda/issues/3885); it **does not change production search-ranking code**. The baseline is exported by calling the actual search query builder on pinned `main` after #3900. Experimental query transformations, local fixtures, anonymized judging, and metrics stay here. A positive result is not assumed: keeping raw fusion or declaring the evidence inconclusive are valid outcomes.

Read [protocol.md](protocol.md), [protocol.json](protocol.json), [task-provenance.md](task-provenance.md), and the final [report](report.md) before interpreting results. Raw grades are agent judgments, not human-validated ground truth. Held-out tasks must not be used to tune weights.

## Requirements and safety

- Python 3.9+ standard library and `curl`; Node/Magda build dependencies plus sbt/Java to export the production baseline.
- A **local** OpenSearch 2.19.1 instance with Magda's production analyzers (`analysis/wn_s.pl` and region synonyms), k-NN/neural-search plugins, and optional version-27 region index for production geographic augmentation.
- A frozen local embedding service. This pilot used `ghcr.io/magda-io/magda-embedding-api:1.1.0` at digest `sha256:7faca54ae24ce1c03d4213d3a3c2109ff57b23c644e4d22523e1c861201fb6ec`: Alibaba-NLP/gte-base-en-v1.5, 768 dimensions, q8 inference, CLS pooling, normalized output, maximum 1024 tokens. The public deployment's private vector/model configuration was not exposed; this is a controlled **re-indexed snapshot** comparison, not an exact production-vector replay.
- Public acquisition is anonymous GET-only with verified HTTPS, bounded pagination, throttling, retries and immutable hashes. No content downloads, indexing or destructive operations occur on dev.magda.io. See the readiness-probe caveat in [environment.json](results/pilot/environment.json).
- Replay/embedding endpoints accept only explicit local HTTP origins. Writes require `--allow-local-writes` and owned `magda-relevance-eval-*` index names. Never use public endpoints as a replay target. `verify.py` creates and deletes only its exact UUID resources. The main replay index is intentionally retained until you explicitly delete its exact name.
- Bulk metadata, vectors, source requests and initial blind packets are **not committed**. Keep them in `.local/` (gitignored) or another private working-artifact directory, not in the repository history. No credentials belong in inputs or manifests.

## 1. Acquire and freeze a public snapshot

Check the CLI context first. To explicitly use anonymous public access without changing an existing profile:

```sh
MGD_PROFILE=eval-public-3901 MGD_BASE_URL=https://dev.magda.io/api \
MGD_API_KEY_ID= MGD_API_KEY= mgd auth status --json

python3 search-relevance-eval/acquire.py \
  --data-root /tmp/magda-3901-data --size 500 --interval 0.75
```

The raw endpoint is necessary because curated `mgd` commands do not provide bulk Registry cursor export. Acquisition inventories anonymous Registry records with `dcat-dataset-strings`, presamples IDs using seeded equal-publisher and uniform components, then validates **exact identifier equality** in indexed public metadata. Unresolved IDs are skipped without replacement. Title/publisher lookups may introduce additional coverage bias; they are not relevance queries used to select favorable results. All request receipts and snapshots are immutable and hashed. Reuse the data root to resume cached requests; `--refresh` creates a new dated cache.

For the pilot: 113,117 Registry records; 500 selected, 494 retained, 312 nonempty publisher names and 1,892 distributions. Registry and Search totals differ, so this is not a complete Search-index snapshot. Publisher oversampling and a ~0.44% sample change IDF, competitors and score ranges. A newly acquired corpus need not reproduce old hashes because the public catalogue changes. Exact old-result reproduction requires the retained immutable corpus/vector artifacts; public API availability alone is insufficient archival provenance.

The [frozen tasks](queries.jsonl) include 5 development and 10 held-out needs. [anchors.jsonl](anchors.jsonl) is a restricted objective-control manifest: **never give it to relevance judges**. Freeze hashes, prompts, model metadata, run settings and expansion decision before viewing held-out results.

## 2. Freeze embeddings and export production requests

Run the pinned embedding image on an available local port (example 3000), then:

```sh
python3 search-relevance-eval/run.py prepare \
  --corpus /PATH/TO/FROZEN/corpus.jsonl \
  --queries search-relevance-eval/queries.jsonl \
  --embedding-url http://127.0.0.1:3000 \
  --cache search-relevance-eval/.local/embedding-cache \
  --output-corpus search-relevance-eval/.local/embedded-corpus.jsonl \
  --output-queries search-relevance-eval/.local/embedded-queries.jsonl
```

Embeddings are cached by exact UTF-8 input SHA256. Preserve the cache with the frozen model/image identity; do not reuse it across models. Public Search supplies indexed `queryContext` strings but omits vectors. Every compared system uses identical regenerated vectors. Query embedding and corpus preparation time are excluded from retrieval latency.

Export unchanged-main requests with a **transient sbt setting**, not a production build/source change:

```sh
sbt 'set searchApi / Test / unmanagedSourceDirectories += (ThisBuild / baseDirectory).value / "search-relevance-eval/scala"' \
  'searchApi/Test/runMain au.csiro.data61.magda.search.eval.ExportBaselineRequests --input search-relevance-eval/.local/embedded-queries.jsonl --output search-relevance-eval/.local/baseline-requests.jsonl --index magda-relevance-eval-pilot3901-20261106 --mapping-output search-relevance-eval/.local/mapping.json --config-output search-relevance-eval/.local/search-config.json --regions-endpoint http://127.0.0.1:19200 --baseline-commit ba18156201c50565c85c62f76469245925994ece'
```

See [the adapter documentation](scala/README.md). The adapter calls production `Query.fromQueryParams`, geographic augmentation and `buildQueryWithAggregations`, and exports production `IndexDefinition`. It does not hand-build baseline DSL. The revision label is supplied by the caller: verify `git rev-parse HEAD`/base and no production diff separately. Region augmentation is read-only against a **local** region index and its selected references are recorded. Omitting it records an explicit semantic limitation. The public-only corpus uses tenant 0, published filtering and unconditional public dataset/distribution decisions; it does not reproduce arbitrary real-user OPA decisions.

## 3. Install locally and run registered systems

```sh
python3 search-relevance-eval/run.py install \
  --engine-url http://127.0.0.1:19200 \
  --index magda-relevance-eval-pilot3901-20261106 \
  --mapping search-relevance-eval/.local/mapping.json \
  --corpus search-relevance-eval/.local/embedded-corpus.jsonl --allow-local-writes

python3 search-relevance-eval/run.py run \
  --engine-url http://127.0.0.1:19200 \
  --index magda-relevance-eval-pilot3901-20261106 \
  --requests search-relevance-eval/.local/baseline-requests.jsonl \
  --corpus /PATH/TO/FROZEN/corpus.jsonl \
  --output search-relevance-eval/.local/runs.jsonl \
  --repetitions 10 --depth 10 --allow-local-writes
```

For a preregistered development-first study, split request rows by the frozen task split **before running**; execute held-out requests only after the expansion/stop decision is recorded. The pilot retained development and held-out artifacts separately.

Systems are fixed in advance: raw `baseline`; normalized `candidate_03_07` primary; `.5/.5` and `.7/.3` weight sensitivities; a `.3/.7` sensitivity retaining dataset-vector boost50; keyword and vector-family controls. Primary normalization also removes boost50, so it is a **compound intervention**. The keep50 sensitivity is necessary before attributing an effect to normalization alone. Experimental branches preserve parent filters, child access matching, quality/region functions, and facet eligibility unions; score functions now operate before family normalization. Inner hits move to a logically optional post-filter because OpenSearch does not extract them inside top-level hybrid branches. These differences are reported, not claimed mathematically equivalent.

The runner warms each query/system once, then interleaves measured configurations with deterministic rotations. It retains all scores, IDs, facet responses, measured samples and ranking signatures. Errors/timeouts abort rather than being silently excluded. The local descriptive latency guard and correlated-repetition caveats are in [registration.json](results/pilot/registration.json).

## 4. Objective correctness controls

```sh
python3 search-relevance-eval/verify.py \
  --engine-url http://127.0.0.1:19200 \
  --baseline-requests search-relevance-eval/scala/smoke/baseline.jsonl \
  --mapping search-relevance-eval/scala/smoke/mapping.json \
  --output search-relevance-eval/results/controls-3901.json --allow-local-writes
```

The small fixture uses a production-exported request and mapping, deterministic dimension-3 vectors and a **translated synthetic owner predicate, not real OPA**. It verifies draft/tenant/owner match eligibility, projected accessible siblings, facet counts, actual pipeline weight reversal, raw-baseline invariance, and exact cleanup. Existing facet-source/projection limitations are disclosed in [the control report](results/controls-3901.json). This does not replace real-service authorization tests or prove production security.

## 5. Blind pooling, independent judging and metrics

```sh
python3 search-relevance-eval/evaluate.py pool \
  --queries search-relevance-eval/queries.jsonl --runs search-relevance-eval/.local/runs.jsonl \
  --packets search-relevance-eval/.local/packets.jsonl \
  --mapping search-relevance-eval/.local/private-mapping.jsonl --seed 3901

python3 search-relevance-eval/make_judge_batches.py \
  --packets search-relevance-eval/.local/packets.jsonl \
  --output-dir search-relevance-eval/.local/judge-packets --phase heldout

python3 search-relevance-eval/evaluate.py metrics \
  --queries search-relevance-eval/queries.jsonl --runs search-relevance-eval/.local/runs.jsonl \
  --mapping search-relevance-eval/.local/private-mapping.jsonl \
  --judge-a /PATH/TO/judge-A.jsonl --judge-b /PATH/TO/judge-B.jsonl \
  --anchors search-relevance-eval/anchors.jsonl --baseline baseline --candidate candidate_03_07 \
  --output search-relevance-eval/.local/metrics.json --csv search-relevance-eval/.local/metrics.csv \
  --bootstrap-samples 10000 --seed 3901
```

Only public blind packets and [judging-prompt.md](judging-prompt.md) go to judges; never give them the private mapping, rankings, anchors, report, expected IDs or other judges' outputs. Long metadata strings are losslessly chunked to prevent tool-line truncation. Persist raw assessments with pair ID, grade0–3/U, field evidence, constraints, uncertainty and observable judge/model parameters. Use separately shuffled packet order for independent contexts. Same-family agents are correlated, and no unexposed temperature/model snapshot should be invented. Keep initial grades during adjudication; unresolved conflicts remain U.

Primary NDCG@10 uses original ranks, pooled IDCG, gains `2^grade-1`, and U/unjudged gain0 as an explicit computational convention—not proof of irrelevance or a mathematical lower bound. Zero IDCG is undefined, never automatically zero/a tie. Report judge A/B/agreement-only consensus and unknown coverage; condensed NDCG is secondary. Exact-identifier/title Success@5/MRR@10 use frozen objective IDs, never LLM guesses. Report missing-answer tasks separately; zero retrieval or a zero grade does not establish catalogue-wide absence. Pilot intervals are descriptive, not evidence of statistical significance.

### Recompute the published adjudicated/sensitivity report

The final report excludes the two preregistered missing-answer diagnostics from the primary positive-intent population and keeps development separate. It computes a fixed adjudicated-defined cohort, assessor A/B, agreement, U->3, conflict min/max, binary>=2 and strict-family sensitivities. A third assessor reviews every disagreement plus a seeded10% agreed-numeric audit; original assessments remain intact. [prepare_review.py](prepare_review.py) constructs this review solely from public packets/assessments, without system/rank data.

```sh
python3 search-relevance-eval/report_results.py \
  --queries search-relevance-eval/queries.jsonl \
  --runs search-relevance-eval/results/pilot/rankings.jsonl \
  --mapping search-relevance-eval/results/pilot/pair-mapping.jsonl \
  --judge-a search-relevance-eval/results/pilot/judge-A.jsonl \
  --judge-b search-relevance-eval/results/pilot/judge-B.jsonl \
  --adjudication search-relevance-eval/results/pilot/adjudication.jsonl \
  --families search-relevance-eval/results/pilot/families.jsonl --baseline baseline \
  --output search-relevance-eval/.local/graded-results-full.json \
  --csv search-relevance-eval/.local/graded-results.csv --seed 3901 --bootstrap-samples 10000

python3 search-relevance-eval/publish_results.py \
  --input search-relevance-eval/.local/graded-results-full.json \
  --output search-relevance-eval/.local/graded-results-published.json
```

The committed [metric JSON](results/pilot/graded-results.json) omits only duplicated `raw_records` and duplicate A/B/adjudication payloads inside `resolved_judgments`; original input files are separately committed and SHA256-listed in `evidence_files`. Every metric/scenario row is retained. The [CSV](results/pilot/graded-results.csv) matches the command above byte-for-byte. Resampling one defined task yields a mechanically degenerate interval, not useful evidence: this pilot's held-out1.0 NDCG describes only one exact-title lookup, and is explicitly **not** an improvement/equivalence claim.

## Tests

```sh
python3 -m unittest discover -s search-relevance-eval -p 'test_*.py' -v
```

Synthetic tests cover metrics hand calculations, blindness/target redaction, sparse ranks, uncertainty, objective anchors, deterministic pooling, endpoint/resource safety, experimental family separation and control-fixture injection. No test sends requests to the public catalogue. See report for actual engine/tool versions, hashes, raw judged outputs, coverage, limitations and the evidence-based A/B/C recommendation.

### Recompute published operational evidence

The compact [rankings](results/pilot/rankings.jsonl) retain IDs, scores and raw latency samples, but omit bulk metadata/facet bodies. Recompute objective metrics, latency, overlap and reported repeat signatures from the retained raw local runs:

```sh
python3 search-relevance-eval/analyze.py \
  --queries search-relevance-eval/queries.jsonl --anchors search-relevance-eval/anchors.jsonl \
  --runs search-relevance-eval/.local/development-runs.jsonl \
  --runs search-relevance-eval/.local/heldout-runs.jsonl \
  --output search-relevance-eval/.local/operational.json \
  --rankings-output search-relevance-eval/.local/rankings.jsonl
```

A separate, gitignored [frozen reproduction bundle](.local/magda-3901-frozen-evaluation-inputs.tar.gz) contains the selected corpus, generated vectors, production mapping/query exports, exact executed request bodies, raw measured outputs and synonym input. Its SHA256/member hashes are in [reproduction-bundle.json](results/pilot/reproduction-bundle.json). It is **not stored in the PR**; obtain/retain it separately to reproduce this historical snapshot, rather than expecting live acquisition to yield the same corpus. The full 113,117-record Registry inventory is not inside this smaller selected-snapshot bundle; original acquisition working artifacts retain it for sample auditing.
