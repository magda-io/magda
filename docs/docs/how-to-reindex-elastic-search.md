## How to Reindex Elasticsearch

MAGDA uses [Elasticsearch](https://www.elastic.co/) as our search engine. You need to index all datasets metadata to make data available from search API, which is backed by the elasticsearch search engin. In event of losing Elsticsearch index storage data, we will need to reindex Elasticsearch.

### Reindex Process

Indexer is the MAGDA component that is responsible for indexing Elasticsearch. Generally, the reindex process is an automated process. When the Indexer starts up, it will check whether any required index is missing. If any index is missing, the Indexer will start to index the relevant data in Elasticsearch automatically.

Should you need to manually trigger this process, you have the following options:

-   Delete the index (via [Elasticsearch REST API](https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-delete-index.html)) and restart the Indexer pod. After the restart, the Indexer will start to reindex the relevant index automatically.
-   Send HTTP `POST` request to Index endpoint: [/v0/reindex](https://dev.magda.io/api/v0/apidocs/index.html#api-Indexer-PostHttpIndexerV0Reindex)
    -   This Indexer API is only accessible within the cluster. Therefore, you need to port-forward the Indexer pod [port 6103](https://github.com/magda-io/magda/blob/master/docs/docs/local-ports.md) using [kubectl](https://kubernetes.io/docs/tasks/access-application-cluster/port-forward-access-application-cluster/) before making the HTTP request.
    -   This API will NOT reindex `regions` index. If you need to reindex `regions` index, the only option is delete the `regions` index and restart Indexer.

### Other Considerations

When Indexer starts the reindex process on an empty Elasticsearch cluster, it will, by default, index the `regions` index first. This is a quite large index (may take 50 mins to complete) but has little impact to the system functionality (only impact the available options of region filters). Because of this, you might want to skip indexing `regions` index, index the `datasets` first and index `regions` once the key `datasets` index is completed.

To do so, you can:

-   Delete the `datasets` index via [Elasticsearch REST API](https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-delete-index.html)
-   Restart the Indexer pod
-   After the restart, the Indexer will start to work on `datasets` index (as an incomplete `regions` has been created by Indexer before the restart)
-   Once the `datasets` indexing is complete, delete the `regions` index (via [Elasticsearch REST API](https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-delete-index.html))
-   Restart the Indexer pod and the Indexer should work on indexing `regions` index this time.
