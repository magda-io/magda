### magda-int-test-ts

This module contains all integration tests written in typescripts.

### How To Run the Tests:

- for local testing:
  - Make sure Docker daemon is running & accessible
  - run `yarn test`

### Run Service Utility

You can also use the `run-service` CLI tool to launch core services (e.g. auth API) for ease of debugging / development.

```bash
# Run with no parameter will print help info
$ yarn run-service

Usage: Magda Service Runner [options]

A CLI tool run key Magda services (e.g. auth) in Docker containers without k8s cluster. It's for local dev or running test cases only.

Options:
  -V, --version                 output the version number
  --auth                        Start auth related services. Including postgres DB with latest schema, OPA and Auth API.
  --registryApi                 Start registry API.
  --storageApi                  Start registry API. This option includes minio service as well.
  --es                          Start Magda's elasticsearch service.
  --searchApi                   Start Magda's search API service. When this option is set, elasticsearch service will be started as well.
  --indexer                     Start Magda's indexer and keep it running. When this option is set, elasticsearch service will be started as well.Please note: this service will still
                                be run during elasticsearch's starting up in order to setup indices. However, when this switch is off, the indexer will auto-exit after the setup job
                                is done.
  --jwtSecret, -s <JWT Secret>  Specify JWT secret all service used. If not specified, a random generate secret will be used.
  --debug                       Turn on debug mode of Auth Service. Auth API will output all auth decision details.
  --skipAuth                    When specify, Auth API will skip query OPA but always assume an `unconditionalTrue` decision. For debug purpose only.
  -h, --help                    display help for command
✨  Done in 4.11s.
```
