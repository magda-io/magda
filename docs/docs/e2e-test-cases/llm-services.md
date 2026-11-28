# LLM access profiles: test procedure

Use this procedure to check profile authorization, invocation, metering, soft limits and deployment wiring. It is a reusable procedure, not a record of a particular run. Keep dated results, counts, environment details and sanitized screenshots with the PR or release evidence rather than committing them to this page.

## Prerequisites and safety

- Use the feature revision consistently across LLM Services, Authorization API, OPA, Gateway, web client and both database migrators.
- Install the repository's Node dependencies and use its supported Node version.
- Use Docker for the isolated API harness. Cache the images described in the [harness README](../../../magda-llm-services/test/integration/README.md); the runner never pulls them implicitly.
- For a deployed smoke check, use an owned disposable installation or dedicated test accounts. Do not alter another user's grants or usage history.
- Never publish passwords, sessions, provider credentials, prompts, model output or tool arguments. Keep evidence to status codes, counters, terminal types, byte counts and reviewed screenshots.
- Record real and fake components separately. A fixture result is not provider compatibility evidence, and an update of an existing installation is not a fresh-install smoke.

## 1. Isolated API vertical slice

From the repository root:

```sh
node magda-llm-services/test/integration/run.mjs --existing-tests
```

To retain metadata-only results outside the checkout, choose new output destinations:

```sh
HARNESS_EVIDENCE_FILE="${TEST_ARTIFACT_DIR:?}/llm-isolated.json" \
HARNESS_EXISTING_EVIDENCE_FILE="${TEST_ARTIFACT_DIR:?}/llm-existing.json" \
  node magda-llm-services/test/integration/run.mjs --existing-tests
```

Create `TEST_ARTIFACT_DIR` first and keep it outside the checkout. The runner creates uniquely labelled loopback-only PostgreSQL and OPA containers, generates credentials, removes inherited PostgreSQL connection settings, applies service SQL, and removes its containers afterward. It neither reads kubeconfig nor accesses an existing deployment.

### Component boundary

| Component                | Isolated harness                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------- |
| Authorization API        | Real source, authorization enabled; manager calls use a non-administrator session   |
| OPA                      | Real engine with the checkout's policies                                            |
| Auth and LLM databases   | Real fresh databases in a disposable PostgreSQL instance                            |
| LLM facade               | Real source: profile lifecycle, residual-to-SQL admission, metering and ledger      |
| LiteLLM and provider     | Explicit HTTP fixtures with deterministic usage metadata; no external model request |
| Gateway, browser and DSH | Not exercised by this runner                                                        |

The harness uses an isolated postgres login and skips the cluster client-login migration, as the component tests do. It tests service schema/data integration, not Flyway packaging or deployed database-login privileges. The fresh-install smoke below covers that narrower deployment boundary.

### Expected checks

| Area                | Check                                                                                                                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Central management  | Stock profile manager can create and attach; constrained or invoke-only management cannot; manager cannot mutate unrelated role permissions directly                                                                          |
| Managed permission  | Exactly one correctly flagged invoke permission per profile; idempotent attach; reverse role listing; last detach retains permission; profile delete retains roles/users                                                      |
| Role access         | A role member discovers and invokes its profile's alias; an unrelated user gets empty discovery and `403`                                                                                                                     |
| AUTH-8 broad role   | Authenticated Users attachment grants everyone who can sign in, including later accounts; anonymous has no individual identity to meter; Admin attachment is rejected because administrators already have every allowed model |
| Audience and Public | Own/ancestor audience allowed; descendant/sibling/no-unit cases denied; Public requires an exemption-capable grant and never permits anonymous invocation                                                                     |
| Forged context      | Client `user`/user-ID fields, body/query user context, extra JWT role/ancestor claims and invalid signatures do not elevate access or redirect accounting                                                                     |
| Model coverage      | Disabled profiles do not admit; wildcard is bounded by the deployment allowlist and served aliases; unavailable served-list fallback does not permit arbitrary provider IDs                                                   |
| Quota               | Exhaustion returns `429` with `x-should-retry:false`; no eligible profile returns `403`; neither refusal forwards or debits; zero/unlimited and OR semantics remain distinct                                                  |
| Identity isolation  | Usage and limits are separate per authenticated user and public alias                                                                                                                                                         |
| Administrator       | Allowlist remains enforced, quotas bypassed and usage recorded                                                                                                                                                                |
| Revocation          | Cached role grants expire within the configured TTL; TTL zero sees the next request; profile disabling applies without waiting for the caller cache                                                                           |
| Usage privacy       | Own report ignores a supplied subject; other-user report requires usage-read permission; user-specific responses are `private, no-store`                                                                                      |
| Metering            | Fixture Chat/Responses settle once; missing, invalid and oversize usage estimates instead of becoming measured zero                                                                                                           |

Require a zero exit status, no failed or pending component tests, and a successful final cleanup record. Verify both run-specific containers were removed; do not broadly prune Docker resources. The short cache TTL used by the harness exercises the real clock, not a claim about a separately timed deployment run.

## 2. Focused regression suites

Use the isolated runner's `--existing-tests` option for the LLM Services suites and relevant Auth API migration, support and partial-decision suites against disposable dependencies. Some focused tests intentionally fake Auth/provider outcomes to inject failures; preserve that distinction in results.

Run the repository's full Auth API, OPA and web-client test commands as applicable. Build referenced TypeScript projects before interpreting missing-output project-reference notices as source errors:

```sh
npx tsc -b magda-llm-services
npx tsc --noEmit -p magda-llm-services
```

Check these regression boundaries without turning them into real-provider claims:

- Full OPA decisions and partial residuals select the same SQL profiles for every grant type.
- Create/delete compensation, lost Auth outcomes, missing-permission recreation, attach/delete locking and optimistic revisions retain their documented behavior.
- Sydney day, ISO week and month boundaries, both DST transitions and request-start attribution across midnight remain correct.
- Concurrent ledger increments are atomic. Concurrent admissions may overshoot a soft limit; the next request is refused after settlement.
- Responses `[DONE]` alone is not a terminal response; failed/incomplete valid final usage stays measured. Invalid later Chat usage cannot promote an earlier interim zero.
- Fragmented UTF-8/SSE, bounded malformed/oversize parsing, backpressure, cancellation and upstream truncation preserve forwarding behavior.
- Estimates follow the configured policy: the shared default ratio is 5 bytes per input/visible-output token; observed visible output receives no extra amount. The 4096-token/per-alias fallback applies only without nonempty visible output. The incomplete factor of 0.25 applies to input plus any fallback, not visible output. These are provisional policy values, not measured calibration.
- Admission fails closed for non-administrators if the same `llm` database cannot answer eligibility/usage, even for unlimited profiles. Process-local duplicate suppression and write-failure gating are not durable or shared across replicas.

For Helm changes, build dependencies in repository dependency order, run the chart regression scripts and lint:

```sh
for test in deploy/helm/magda-core/tests/*.sh; do
  bash "$test"
done
helm lint deploy/helm/magda-core
```

## 3. Fresh-install smoke

Use a new, owned namespace/release on a local cluster, with the normal deployment procedure and feature-matched images. Check cluster capacity before creating the installation. This is a **fresh-install smoke**, limited to migration, database wiring, stock grants, one authorized invocation and opening My Usage once; an exhaustive new browser, accessibility or distributed-recovery campaign is outside this smoke.

1. Enable LLM Services and configure a real test provider or a clearly labelled fixture backend using Secrets as in the [operator guide](../agent-workspace-deployment.md#llm-access-profiles-and-usage). Record whether the backend/provider is real or fake; a fixture call does not establish provider compatibility.
2. Install the charts through the normal deployment path in the owned namespace/release, without Helm `--wait`: post-install migration hooks must run before readiness checks that depend on the new schema. Helm waits for hook Jobs; verify application rollouts afterward. Record the revision, image versions and command in the run's evidence, not in this procedure.
3. Check **every migrator installed by the release** completes successfully, including `llm-services-db` and the Authorization DB migrator applying `V2_6__llm_access_profiles.sql`. Verify `access_profiles` and `daily_model_usage` exist and the service can use its configured database login.
4. Verify the seeded LLM operations, unassigned **LLM Profile Managers** role and intended **Agent Workspace Users** invoke permission. The migrations must not silently assign users, create an access profile, attach Authenticated Users or recreate a deleted stock Workspace role.
5. Confirm LLM Services and bundled LiteLLM are ready. Verify `llm` uses the configured existing PostgreSQL topology, without requiring another PostgreSQL server, Redis or a LiteLLM database.
6. As an **administrator**, create an enabled profile for the test alias. Grant a disposable ordinary user access using either **Agent Workspace Users** plus a Public profile, or the profile's permission attached to the user's role. Do not use the administrator's quota bypass as the ordinary-user check.
7. As that ordinary user, use the real Gateway to list models, make **one** real or clearly labelled fixture-backend call, and verify its measured or estimated ledger increment. Open **My Usage once** and verify the report loads. Keep evidence metadata-only. Manager, ungranted-user and exhaustion regressions remain in the isolated API suite, not extra fresh-install requirements.
8. Tear down the owned release and namespace using the normal procedure, including owned retained resources and test credentials. Verify no resources from that test installation remain. Never delete shared database resources, shared provider Secrets or another release's namespace.

## 4. Tested OpenAI Responses route and basic UI smoke

The provider-qualified route is OpenAI Responses streaming through bundled LiteLLM. Use that route for the live smoke; do not infer provider support for Chat, Anthropic, Azure, Bedrock or an external backend from fixture coverage.

The optional [live browser smoke](../../../magda-llm-services/test/integration/live-browser-smoke.cjs) signs in, makes one **billable** model request through the Gateway, drains response content without printing or saving it, waits boundedly for a ledger increase, and opens My Usage:

```sh
MAGDA_E2E_URL=https://your-test-deployment \
MAGDA_E2E_EMAIL=test-account@example.test \
MAGDA_E2E_PASSWORD_FILE="${TEST_PASSWORD_FILE:?}" \
  node magda-llm-services/test/integration/live-browser-smoke.cjs
```

Install Playwright and its browser through the local test setup. If necessary, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to the installed browser; do not commit host-specific paths. Use a dedicated, idle test account so unrelated background traffic cannot satisfy the before/after counter check. Compare safe settlement metadata with counter deltas before claiming that this particular request was measured rather than estimated.

Verify HTTP status, `private, no-store`, terminal type, public alias and measured/estimated counter changes. Check that My Usage shows the accounting timezone and distinguishes unlimited, exhausted and no eligible model profile. A Workspace permission alone must not grant invocation (DEP-4). A focused UI smoke can also create/attach a disposable profile and verify the no-model-access message for an ungranted Workspace user; detailed UI regressions remain in the existing web tests.

`MAGDA_E2E_SCREENSHOT` is optional. Inspect and sanitize each screenshot before attaching it to PR/release evidence. Hiding headers is not a general identity/content redaction guarantee. Keep output and dated run artifacts outside tracked source.

## 5. Record the run separately

For each run, record:

- the exact revision, commands, relevant configuration and backend/provider/model versions;
- which Auth API, OPA, databases, Gateway, LiteLLM, provider, browser and DSH components were real, fixtures or not exercised;
- `PASS`, `FAIL` or `SKIPPED` for each selected check, with safe supporting metadata;
- cleanup outcome and any known limits, without silently upgrading fixture coverage to a real-provider claim.

A useful result template is:

| Check                              | Environment/layer                                  | Result             | Safe evidence or reason                       |
| ---------------------------------- | -------------------------------------------------- | ------------------ | --------------------------------------------- |
| Isolated authorization/quota slice | Real Auth/OPA/DB/facade; fixture backend           | Fill after running | Summary and cleanup metadata                  |
| Component/policy/UI regressions    | State real dependencies and injected fixtures      | Fill after running | Commands and suite summaries                  |
| Fresh-install smoke                | New owned release; actual migrators/database login | Fill after running | Job outcomes, stock grants and one invocation |
| OpenAI Responses live smoke        | Real Gateway/LiteLLM/test provider                 | Fill after running | Status, terminal and ledger metadata          |

Use the [architecture](../architecture/llm-services.md) and [release notes](../llm-services-release-notes.md) for the accepted accounting limits. Do not turn a passing run into a claim of billing accuracy, durable exactly-once settlement or support for untested provider routes.
