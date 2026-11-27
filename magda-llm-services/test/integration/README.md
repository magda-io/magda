# Isolated LLM access qualification (#3945 / #3950)

This **opt-in API integration harness** connects the real current-source Authorization API, real OPA with this worktree's policies, real PostgreSQL with both services' SQL migrations, and the real current-source LLM facade. **LiteLLM and the provider are explicitly FAKE**: an in-process HTTP fixture returns deterministic usage metadata (7 input + 3 output tokens), without model output or external provider calls.

It complements, rather than replaces, the focused service/policy suites. It does not qualify browser/UI/Gateway/DSH integration or real provider compatibility.

The separate, optional [live browser smoke](./live-browser-smoke.cjs) **does** access a deployment and sends one billable provider request. Its environment setup, recorded live metadata and the combined PASS/FAIL/SKIPPED matrix are in the [local qualification report](../../../docs/docs/e2e-test-cases/llm-services.md). The safety/isolation guarantees below apply to `run.mjs`, not that separate operator-invoked live check.

## Run

From the repository/worktree root, with Node 22+, installed root `node_modules`, Docker and these locally cached images:

```sh
docker pull postgres:17-alpine
docker pull openpolicyagent/opa:0.37.2-static
node magda-llm-services/test/integration/run.mjs
```

Image fetching is a separate, explicit operator action. The runner uses `--pull=never`. PostgreSQL's major version is selected by tag (not an immutable release pin); OPA 0.37.2 matches the repository's Dockerfile. The summary records resolved immutable image IDs for evidence. Override image names with `HARNESS_POSTGRES_IMAGE` and `HARNESS_OPA_IMAGE` if necessary; overriding OPA to a Rego-v1-only version is not supported.

To save metadata-only JSON evidence, choose a new output file:

```sh
HARNESS_EVIDENCE_FILE=/tmp/magda-3945-evidence.json \
  node magda-llm-services/test/integration/run.mjs
```

The child runs under the harness-specific TypeScript configuration, mapping common-package imports back to **this worktree's source**, even if root dependencies are symlinked from another worktree. No build artifacts or existing source files are changed. The integration directory is deliberately outside the default `src/test/**/*.spec.ts` discovery and normal production compilation.

Optionally run every existing LLM Services spec plus the three Auth API LLM profile migration/support/partial-decision specs against the same disposable dependencies:

```sh
HARNESS_EVIDENCE_FILE=/tmp/magda-3945-evidence.json \
HARNESS_EXISTING_EVIDENCE_FILE=/tmp/magda-3945-existing.json \
  node magda-llm-services/test/integration/run.mjs --existing-tests
```

The companion uses a programmatic Mocha file list (no package-config spec expansion) and a metadata-only reporter; raw service logs and assertion payloads are suppressed. Pending/skipped tests make this command fail rather than inflate a pass claim. Existing service tests often deliberately fake Auth/provider behavior, whereas the new 17-group qualification suite always uses the real local Auth API/OPA.

A nonzero exit means setup, an assertion, or cleanup failed; no unavailable-service skip is counted as a pass. A `harness-summary` contains each named assertion group, durations, pass/fail counts, revision, topology, image IDs, and limitations. The optional existing-test evidence also records pass/fail/pending counts per file. The last `harness-cleanup` verifies container removal separately from the summary.

## Safety and isolation

- No kubeconfig access, deployment writes, `helm upgrade`, port-forwards, existing services, existing databases, or production credentials are used.
- Each run starts uniquely named, ownership-labelled Docker containers, binding random ports on **127.0.0.1 only**. PostgreSQL data lives in tmpfs, with no persistent volumes. OPA receives a read-only policy mount.
- JWT signing material, fake backend credentials and the PostgreSQL password are generated for the run, passed in environment variables and never printed. They are not read from MAGDA Secrets. The runner removes every inherited `PG*` and `POSTGRES_*` environment variable, then sets its own loopback host, random mapped port, database, username, generated password and `PGSSLMODE=disable`. This also prevents inherited TLS certificate paths, service-file settings and `PGOPTIONS` startup options from changing these test connections.
- The migrations create fresh `auth` and `llm` databases in that disposable PostgreSQL instance. The Authorization `V1_2` migration (cluster client-login creation) is skipped, as in the existing DB test helper; schema/data migrations run with the existing helper's `clientUserName`/`clientPassword` placeholder substitution. SQL text is otherwise unmodified. The harness uses the isolated postgres login rather than pretending to verify production login/GRANT privileges or Flyway packaging.
- Real HTTP APIs provision users, roles, permissions and profiles. Only the audience org-tree fixture is inserted through the real `NestedSetModelQueryer`; usage is generated through facade requests and checked by read-only ledger queries. LLM Services itself uses only the real Auth API, never Auth tables.
- Authorization is **not** bypassed: `skipAuth` is false. Profile manager requests are authenticated with a non-administrator's session. The facade makes lifecycle Auth API changes using its internal administrator session.
- Request fixtures are synthetic; no secrets, sessions, prompts, model output or arbitrary service errors are emitted. Service console logging is suppressed in the test process to prevent incidental request-object logging. Assertion failures emit only literal assertion labels or HTTP path/status metadata.
- The runner removes only its generated names after verifying its ownership label, in `finally`, on ordinary failures and handled SIGINT/SIGTERM. A hard host crash or SIGKILL cannot run cleanup. In that case inspect Docker containers labelled `magda.integration-run` and remove only the run-specific names printed in the cleanup result; never broadly prune containers/volumes.
- Do not run the child `suite.ts` directly against another database. The runner is the supported entrypoint and does not expose an external-DB mode. The run-ID check is an accidental-misuse guard, not a security boundary against an operator intentionally changing the harness.

## Coverage and interpretation

| Group                   | Real integrated behavior checked                                                                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Role-manager lifecycle  | Non-admin manager create; generated pre-authorised permission flags; manager's direct role mutation denied; attach grants only its profile; idempotent attach; reverse role listing; last detach retains permission; delete removes permission but keeps role/user |
| Management denials      | Invoke-only user denied create/attach; constrained management denied even for Public profile; Admin/Anonymous roles rejected                                                                                                                                       |
| Authenticated Users     | Attaching a private, no-audience profile to Authenticated Users intentionally grants all signed-in users, including a user created afterward; anonymous still denied; detach revokes every tested user and keeps the permission                                    |
| Concurrency contract    | Missing `If-Match` → 428 and stale revision → 409 (not simultaneous-request race testing)                                                                                                                                                                          |
| Admission/quota         | 403 versus 429; deterministic measured settlement; denied requests neither forwarded nor debited; spoofed request `user` cannot redirect accounting; zero/NULL limits; OR without splicing periods                                                                 |
| Audience                | Real Auth DB user's unit + ancestors: own and ancestor allowed, descendants/sibling/null denied; no-unit caller denied audience access; residual translated to SQL and used by discovery and invoke                                                                |
| Public                  | Requires exemption-capable grant; no grant/no exemption denied; anonymous → 401                                                                                                                                                                                    |
| Owner                   | Owner-constrained invoke does not grant a private profile                                                                                                                                                                                                          |
| Forged context          | Auth decision body/query user context and extra signed JWT role/ancestor claims cannot elevate access; invalid signature → 401                                                                                                                                     |
| Decision cache          | TTL=0 refreshes on next request; real-time 4-second cached decision/whoami survive revoke until expiry, then deny; other users do not share access; profile disable applies immediately while decision is cached                                                   |
| Wildcard                | Deployment allowlist ∩ served aliases; arbitrary provider IDs denied; served-list failure falls back to allowlist; quota separated per alias and per user                                                                                                          |
| Administrator           | Deployment allowlist still enforced; quota bypassed and usage recorded                                                                                                                                                                                             |
| API/stream smoke        | `Cache-Control: private, no-store`; `/usage/me` ignores supplied identity; User Usage permission denied; fake Chat and Responses streams settle measured metadata exactly once                                                                                     |
| Estimate fallback smoke | Missing usage, invalid negative token counts, and response JSON exceeding a deliberately small observer cap each settle a nonzero estimate and increment estimated requests, never measured usage                                                                  |

The 4-second TTL keeps the suite practical and exercises the actual clock/cache, not a fake timer. It does **not** claim a 30-second wall-clock test. The served-model cache is configured to zero solely to test deterministic availability transitions; the decision cache remains the real implementation under test.

## Deliberate gaps

- No browser login, Settings role/profile UI, Gateway route/header behavior, DSH/tool continuation, deployment packaging, Helm migration/GRANT ordering or running-cluster qualification.
- No actual LiteLLM binary or provider. Streaming checks are integration smoke tests only, not METER-1..7 compatibility certification, token billing validation or arbitrary fragmentation/backpressure/cancellation qualification.
- No outage injection, commit-acknowledgement loss, create/delete compensation races, concurrent attach/delete, lost permission re-creation, concurrent ledger upserts, midnight/DST/month/week transitions, SDK retry integration or all usage-report variants. Existing focused tests remain important; run them separately with their documented dependency setup.
- No newly seeded or inherited constraints are assumed: API permission fixtures use **snake_case** flags and verify the flags returned by Auth API, because camelCase request flags can silently create unconstrained permissions.

The broader qualification work is tracked separately: [fresh v8 install/full browser and recovery #3972](https://github.com/magda-io/magda/issues/3972), [provider-specific qualification #3971](https://github.com/magda-io/magda/issues/3971), [unbounded-profile ledger-read behavior / USE-10 #3969](https://github.com/magda-io/magda/issues/3969), [multi-replica/durable settlement #3970](https://github.com/magda-io/magda/issues/3970), and [DSH bounded title retries/shutdown cancellation #38](https://github.com/magda-io/dsh-fork/issues/38). This harness does not close those follow-ups.

Latest design reviewed from `git show origin/design/3838-llm-profiles-soft-usage-limits:docs/design/agent-workspace/llm-access-profiles.md` (branch tip e1ce44ba4a3915f22ca8015661c7c49a77b9cf61 at implementation time). Requirements in that design, not the older root handoff examples' particular cluster IDs or credentials, define the intended assertions.
