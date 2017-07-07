# MAGDA Local Ports

It is not necessary to allocate ports to microservices when running on a Kubernetes cluster; everything can run on the standard port for its protocol.  When running microservices directly on a development machine, though, we need to make sure each service has a port to bind to on localhost and that everyone agrees what it is.  Here are the allocated local ports:

| Component | Port |
| --------- | ---- |
| `magda-combined-db` | 5432 |
| `magda-elastic-search` | 9300 |
| `magda-gateway` | 6100 |
| `magda-registry-api` | 6101 |
| `magda-search-api` | 6102 |
| `magda-indexer` | 6103 |
| `magda-auth-api` | 6104 |
| `magda-discussions-api` | 6105 |
| `magda-preview-map` | 6106 |
| `magda-web-server` | 6107 |
| `magda-web-client` | 6108 |
