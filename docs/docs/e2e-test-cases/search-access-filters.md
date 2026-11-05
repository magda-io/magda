# Search distribution access filters (#3886)

## Run the generated-query integration suite

Use an isolated **OpenSearch 2.19.1** instance with the k-NN and neural-search plugins (the bundled Magda image). The tests use two-dimensional **Faiss HNSW / l2**, matching the production engine, without an embedding service, search pipeline, registry, or catalog data.

For the local minikube deployment, forward OpenSearch in a separate terminal:

```sh
kubectl --context minikube -n magda port-forward svc/opensearch 19200:9200
```

Then run the [integration suite](../../../magda-search-api/src/test/scala/au/csiro/data61/magda/search/elasticsearch/ElasticSearchAccessFilterSpec.scala) from the repository root:

```sh
MAGDA_SEARCH_TEST_OPENSEARCH_URL=http://127.0.0.1:19200 \
  sbt 'searchApi/testOnly *ElasticSearchAccessFilterSpec'
```

The [query-builder unit suite](../../../magda-search-api/src/test/scala/au/csiro/data61/magda/search/elasticsearch/ElasticSearchQueryerSpec.scala) needs no cluster:

```sh
sbt 'searchApi/testOnly *ElasticSearchQueryerSpec'
```

When running sbt in Docker on macOS, the endpoint may instead be `http://host.docker.internal:19200`. Supply a reachable HTTP endpoint without authentication. Without the environment variable, these optional tests are canceled; ordinary query-builder unit tests remain runnable.

The suite serializes actual `ElasticSearchQueryer.buildQuery` requests and POSTs their JSON bodies to OpenSearch. Each test creates and deletes only its own `magda-search-access-test-<UUID>` index. Never point destructive test tooling at a production cluster. If the process is forcibly terminated, inspect and remove only the exact test index left behind.

## Regression coverage

- Keyword and hybrid search: a visible dataset with a restricted, draft, or wrong-tenant perfect-match distribution and an accessible unrelated sibling must not match the hidden content. Public distribution and dataset-metadata matches remain available.
- Privileged searches with all tenants and `publishingState=*` can match those distributions.
- A restricted perfect vector cannot improve its parent's score over an otherwise identical dataset with only the accessible, less-similar vector.
- Negative controls remove only child matching filters from the generated DSL, demonstrating that the fixtures would reveal the old inclusion/ranking bug.
- Dataset `k=1` prefiltering excludes nearest neighbors with the wrong tenant, authorization, publishing state, or publisher before selecting an eligible neighbor.
- Parent publisher/date facets remain effective. A text match in a CSV distribution plus a separate PDF sibling still satisfies the dataset-level PDF facet; this patch does not change that existing any-sibling behavior.

For a broader deployment smoke test, also verify region filters, nontrivial residual authorization rules, returned inner-hit distributions, facet alternatives, and both `k` and radial `minScore`/`maxDistance` configurations with your actual mappings.

## Version-specific caveats

**Do not copy latest nested k-NN filtering examples without checking the deployed version.** In OpenSearch 2.19.1, [BaseQueryFactory](https://github.com/opensearch-project/k-NN/blob/2.19.1.0/src/main/java/org/opensearch/knn/index/query/BaseQueryFactory.java) uses [NestedHelper](https://github.com/opensearch-project/OpenSearch/blob/2.19.1/server/src/main/java/org/opensearch/index/search/NestedHelper.java) to distinguish parent from child predicates. Direct child-only distribution filters work; mixing parent fields and child predicates in the same conjunction can return no matches. Parent publisher/date/region predicates therefore stay outside distribution matching. Dataset-vector matching retains all dataset-level constraints, using inline prefiltering in top-k mode.

**Radial filter rewrite compatibility:** OpenSearch 2.19.1 [KNNQueryBuilder.doRewrite](https://github.com/opensearch-project/k-NN/blob/2.19.1.0/src/main/java/org/opensearch/knn/index/query/KNNQueryBuilder.java) reconstructs radial queries with both `k=0` and `min_score`/`max_distance` whenever an inline filter is rewritten. Validation then rejects the request with `[knn] requires exactly one of k, distance or score to be set`. The query builder avoids that engine bug by keeping top-k access predicates inline, but placing radial access predicates in an enclosing Boolean filter at the same document scope. For distribution radial queries, that Boolean query stays inside the distribution's nested scope, so an inaccessible sibling cannot provide the match or score. The integration suite exercises radial publisher/date/format filters and compares mixed-sibling scores against an accessible-only control; top-k dataset prefiltering is tested separately. This is not permission weakening: the matching child must still satisfy the access filter. Radial retrieval is still approximate and subject to engine result-window limits; do not interpret this workaround as an unlimited-recall guarantee. Verify behavior again when upgrading OpenSearch or changing vector engines.

**Remaining recall limitation:** parent constraints still post-filter distribution k-NN results. With top-k, vectors belonging to excluded parents can occupy candidate slots, reducing recall. Child authorization is nevertheless enforced before distribution vector selection. Improving parent-prefilter recall requires an engine/version-verified solution, not a raw conjunction of parent and child fields.

**Separate existing facet behavior:** format filtering and format aggregation are not fully child-access-scoped by this patch. Hidden sibling formats/counts need their own security review and tests. Inner-hit selection intentionally remains authorization/tenant-based and returns all accessible siblings, rather than only text/facet matches.
