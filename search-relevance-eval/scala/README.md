# Production baseline request exporter (issue #3901)

Evaluation-only Scala sources are loaded into **searchApi / Test** by a transient setting; production sources and build definitions are unchanged.

```sh
sbt \
  'set searchApi / Test / unmanagedSourceDirectories += (ThisBuild / baseDirectory).value / "search-relevance-eval/scala"' \
  'searchApi/Test/runMain au.csiro.data61.magda.search.eval.ExportBaselineRequests --input search-relevance-eval/tasks-vectors.jsonl --output search-relevance-eval/baseline.jsonl --index eval-datasets --dimension 768 --limit 50 --facet-size 10 --mapping-output search-relevance-eval/mapping.json --config-output search-relevance-eval/search-config.json --baseline-commit ba181562'
```

Add `--config /absolute/path/runtime.conf` for full index/search settings; ordinary JVM `-Dconfig.file=...` is also honored by AppConfig. Defaults come from **AppConfig**, including hybrid enabled, radial `minScore=0.5`, dimension 768, and the production pipeline configuration. `--k N` is optional and changes the frozen baseline configuration, so do **not** set it for the default main baseline. `--dimension N` must match the frozen embedding model. Full effective config is hashed with SHA-256; `--config-output` only exports the elasticSearch section, not unrelated application secrets. AppConfig/system properties may make this full-config hash environment-specific.

Input UTF-8 JSONL:

```json
{"id":"q1","query":"water quality","vector":[0.1,0.2,0.3],"filters":{"publisher":"Example Publisher","format":["CSV"],"dateFrom":"2020-01-01","dateTo":"2024-01-01","regions":["ste:1"]}}
```

The example vector needs `--dimension 3`; real evaluation uses frozen model vectors at their actual dimension. Strings or arrays are accepted for publisher(s), format(s), region(s). Dates accept the production query parser's syntax, but relative `now` is unsuitable for frozen experiments. Unknown filters, invalid dates, invalid regions, duplicate IDs, nonfinite vectors, and dimension mismatches fail rather than silently changing the task. Authorization is fixed to UnconditionalTrueDecision for both dataset/distribution; tenant 0, publishing state published. This only represents the all-accessible public evaluation corpus.

Each output row contains `query_id`, `request.body` (JSON emitted by the production builder), `request.query_params` (all parameters emitted by elastic4s' production request handler, including `search_pipeline`), HTTP method/path, `config_sha`, `baseline_commit`, and explicit region-augmentation metadata. `baseline_commit` is an owner-provided provenance label, **not** a runtime Git verification. Neither experimental queries nor candidate transforms are implemented here. Downstream Python must derive experimental families from the exported exact baseline, preserving all filters.

## Optional production region augmentation

With no endpoint, building/exporting requests makes no HTTP requests. The embedding HttpFetcher is fail-fast; vectors always come from the input. Without `--regions-endpoint`, rows explicitly record `boost_regions_augmentation: "disabled"`: they do not claim equivalence to the API's online boost-region augmentation.

To execute the API's actual `augmentWithBoostRegions` step before the actual `buildQueryWithAggregations` call, add:

```sh
--regions-endpoint http://127.0.0.1:19200
```

Only that step performs HTTP: a read-only search on the configured/default regions index (`regions27`). The dataset index alone is overridden by `--index`. Every selected region's ID, name, bounding box, short name, and hierarchy IDs is frozen in `boost_regions`; record the source regions-index provenance separately with the experiment. The exporter does not write to or initialize the source endpoint. There is no automatic embedding call, region-geometry resolution, index creation, or pipeline creation.

## Mapping export

`--mapping-output` emits the JSON body from the production `IndexDefinition.dataSets.definition(indices, config)` via `client.show`, including dataset and nested-distribution queryContext/vector mappings and configured analysis/index settings. Missing shard/replica settings default to 1/0 for the local evaluation index; explicit runtime settings take precedence. Mapping export itself does not create anything. Provision the production `analysis/wn_s.pl` synonym file on the target OpenSearch node; do not replace analyzers or mappings in the baseline. Use `esInstanceSupport=false` for OpenSearch (the common default). Pipeline creation is intentionally not performed; the exact pipeline ID/config is exported through request parameters/config output for the evaluation runner.

`client.show` includes an HTTP verb/URL prefix: the adapter strips only the leading prefix with `dropWhile(_ != '{')`, parses JSON, and applies no query-body transformations.
