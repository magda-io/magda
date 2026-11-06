# Actual service authorization regressions — #3903

**Result: 7 passed, 0 failed, first attempt, exit 0.** These reuse the existing #3900-era actual Registry → Indexer → Auth API/OPA → Search API regressions, including both #3886 distribution branch-isolation cases. They are not substitute synthetic-visibility tests.

## Gate, command and evidence

The parent explicitly authorized execution after preregistration freeze commit `c9139bd4b419a9c815d3135d57b8c42d4f54317f` (freeze `2026-11-05T23:53:16Z`). Before authorization, this role only inspected source, checked ports, started isolated Docker and pulled images; it ran no search tests and created no fixture metadata. The full suite ran `2026-11-05T23:55:01Z`–`23:57:58Z`, in the parent's coordinated CPU/sbt window before benchmark latency measurement.

```sh
DOCKER_HOST=tcp://127.0.0.1:12375 \
TMPDIR=/tmp/magda-3886-tools/harness-tmp \
POSTGRES_PASSWORD=password \
PATH=/tmp/magda-3886-tools/bin:$PATH \
yarn --cwd magda-int-test-ts test --grep 'search api auth integration tests'
```

The package script sets `PGUSER=postgres` and invokes Mocha. The suite heading was inspected in the unchanged [test source](<magda-int-test-ts/src/tests/searchApiAuth.spec.ts#L89>). Mocha reported `7 passing (3m)`; Yarn reported `175.47s`. Full machine-readable versions, image RepoDigests, isolation, hashes and per-test results are in [service-regressions.json](<search-relevance-eval/synthetic/results/service-regressions.json>).

The actual [raw local log](</tmp/magda-3886-tools/issue3903-service-regressions-attempt1.log#L600-L640>) has 640 lines / 61,306 bytes, SHA256 `94c8dacf0e83c7f96ec6c567e83a96d782ae2cef22eb026bae150233ff65cb23`. It is an ephemeral local artifact, not committed; the JSON retains all seven test names/results/durations. Start/end markers are in managed-job output, outside this hashed raw test log.

| Existing regression | Result | Test duration |
|---|---|---:|
| Hidden distribution keyword match, #3886 | passed | 19,393 ms |
| Hidden distribution vector match, #3886 | passed | 6,744 ms |
| Dataset and distribution access-control indexing/projection | passed | 3,237 ms |
| Public draft → published access, anonymous/authenticated | passed | 3,099 ms |
| Org-unit restriction and ancestor membership | passed | 1,306 ms |
| Constraint exemption / permission allow-exemption | passed | 2,468 ms |
| Explicit pre-authorised permission association | passed | 1,278 ms |

## What the actual branch-isolation tests establish

Each #3886 branch creates four published parents and eight children through Registry: a matching public, draft, org-unit-restricted or legacy/no-publishing child, plus an unrelated accessible sibling for each parent. Indexer produces the real access metadata; tests assert indexed owner/org-unit/tenant/publishing fields. Legacy publishing is removed through Registry, not a replacement search fixture. See the [existing fixture/assertion implementation](<magda-int-test-ts/src/tests/searchApiAuth.spec.ts#L147-L390>).

Only vectors are manipulated to deterministically isolate a branch: keyword removes vectors; vector uses the real 768-dimensional query embedding for the matching child and far-away parent/sibling vectors. Both anonymous and ordinary authenticated users retain identifier access to the published parent and accessible sibling, but cannot match through or receive the draft/restricted child. Public/legacy matching parents remain positive results. Administrator `publishingState=*` matches all four; explicit published filtering still excludes the draft child. The existing suite uses radial/in-memory search, hybrid enabled, no `k`/max-distance and minimum score `0.5`.

The remaining five tests also passed using actual service permissions, not an inferred owner predicate. Node `22.23.1`, Yarn `1.22.22`, sbt `1.4.9`, Temurin Java `11.0.32.1+1`, Docker `28.5.0`, OpenSearch `2.19.1`, PostgreSQL `17.5`, OPA `0.37.2-static`; observed migrator Flyway `12.11.0`, ARM64 images and dataset index version `54`. Embedding image `1.1.0` matched digest `sha256:7faca54ae24ce1c03d4213d3a3c2109ff57b23c644e4d22523e1c861201fb6ec`.

## Isolation and cleanup

**Never run this harness against ordinary user Docker:** [ServiceRunner.destroy](<magda-int-test-ts/src/ServiceRunner.ts#L248-L282>) globally prunes networks/containers/volumes. The test and its children inherited `DOCKER_HOST=tcp://127.0.0.1:12375`, a fresh managed DinD named `magda-3903-regression-dind` (daemon ID `19317470-43ef-4edf-be3c-3d43b10ef3ed`). The workspace mount was read-only; only loopback ports `12375/5432/8181/9200/3000` were exposed. Other evaluation endpoints `19200/13000` were untouched.

Managed jobs: daemon `bash-f4da5c5bf0514d55`; image pulls `bash-d68ce200e25f4a15`; tests `bash-74ca5629c5844cde`; exact-ID-guarded cleanup `bash-a3d5016abcc04f7b`. All completed exit 0. Harness teardown left zero inner containers/volumes and only built-in networks; host service ports `6101`–`6104` had no listeners. The exact owned DinD was stopped/auto-removed at `23:58:22Z`; forwarded ports were released. Ordinary Docker's user minikube `6268563a4a13` remained running before/after. No ordinary-daemon prune was invoked.

## Boundaries

- **Baseline only:** production TypeScript/Scala, test source and ServiceRunner were not changed. Source hashes before/after matched; production-path diff check exited 0. This run is not a full-service OPA test of the experimental normalized candidate. Candidate literal-filter preservation and the separate synthetic engine controls remain separate evidence, not authorization equivalence proof.
- The harness re-pulls existing mutable tags. The JSON records observed RepoDigests, including the migrator's `next` digest, without changing production harness behavior.
- No test failures, pull-stream race or retries occurred. Initial readiness failures, fresh-index setup messages, existing database notice and duplicate-logback warnings resolved successfully. `lsof` emitted unrelated inaccessible Time Machine SMB stat warnings.
- No public MAGDA access, benchmark corpus/query generation, public credentials or production behavior changes were used. Only ephemeral local test credentials and controlled authorization fixtures were involved.
