### magda-int-test-ts

This module contains all integration tests written in typescripts.

To run the tests:

- for local testing:
  - Make sure Docker daemon is running & accessible
  - run `yarn test`

You can also use the `run-service` CLI tool to launch core services (e.g. auth API) for ease of debugging / development.

```bash
# Run with no parameter will print help info
$ yarn run-service

Usage: Magda Service Runner [options]

A CLI tool run key Magda services (e.g. auth) in Docker containers without k8s cluster. It's for local dev or running test cases only.

Options:
  -V, --version                     output the version number
  --auth                            Start auth related services. Including postgres DB with latest schema, OPA and
                                    Auth API. This option doesn't require a local docker registry.
  --jwtSecret, -s <JWT Secret>      Specify JWT secret all service used. If not specified, a random generate
                                    secret will be used.
  --debug                           Turn on debug mode of Auth Service. Auth API will output all auth decision
                                    details.
  --skipAuth                        When specify, Auth API will skip query OPA but always assume an
                                    `unconditionalTrue` decision. For debug purpose only.
  --es                              Start Magda's elasticsearch service. Requires built Magda elasticsearch docker
                                    image available in local registry localhost:5000 (or use --registry, -r to
                                    specify a different registry).
  --registry, -r <docker registry>  Specify alternative docker registry. Default: localhost:5000
  --tag, -r <docker registry>       Specify alternative default image tag. Default: latest
  -h, --help                        display help for command
✨  Done in 4.11s.
```
