# Isolated qualification evidence — 27 November 2026

## Final combined run

From the worktree root (the deliberately invalid inherited PostgreSQL values verify runner isolation, not an external database mode):

```sh
PGHOST=invalid.harness.invalid PGPORT=1 PGSSLMODE=verify-full \
PGSSLROOTCERT=/nonexistent-harness-ca \
PGOPTIONS=-csearch_path=must_not_use POSTGRES_HOST=invalid.harness.invalid \
HARNESS_EVIDENCE_FILE=magda-llm-services/test/integration/evidence-isolated.json \
HARNESS_EXISTING_EVIDENCE_FILE=magda-llm-services/test/integration/evidence-existing.json \
  node magda-llm-services/test/integration/run.mjs --existing-tests
```

**Exit 0. New integrated qualification: 17/17 groups passed. Existing regression suites: 216 passed, 0 failed, 0 pending.**

- Run ID: `magda-3945-9ecdc7f2-befb-447b-9226-1de74a8887c0`.
- Integrated summary: `2026-11-27T08:55:22.224Z` (19:55:22 Australia/Sydney).
- Regression summary: `2026-11-27T08:55:28.893Z`.
- Git HEAD baseline: `2116edda899c4db0d91cb5f3a202d5bdf5312400`. Tests ran **current worktree source, including uncommitted changes**, not a clean checkout or built image. The revision is a baseline identifier, not a claim that the checkout was clean.
- Real local services: Authorization API, OPA 0.37.2 + worktree policies, PostgreSQL 17 + fresh Auth/LLM migrations, LLM facade.
- **FAKE LiteLLM/provider:** 26 forwarded synthetic requests. No external model calls.
- PostgreSQL resolved image: `sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`.
- OPA resolved image: `sha256:60b6b0cc860b0442ea94269cbe13e3a6e9443d665b65be9aad7f2bafeca87fb0`.
- Local HTTP servers and pools closed. Runner emitted `harness-cleanup` with `ok: true`, both exact generated container names, and `persistentVolumes: false`.

The per-group integrated results are retained in [integrated evidence](./evidence-isolated.json). The exact existing-spec file list and counts are retained in [regression evidence](./evidence-existing.json). Both are metadata-only JSON, with no sessions, credentials, prompts or model output. See [harness instructions and limits](./README.md).

### Integrated groups

All passed:

1. AUTH-3/8/12: manager create/attach uses internal admin, not role-update rights; correctly flagged managed permission; detach/delete lifecycle.
2. AUTH-8: forbidden Admin/Anonymous attach; invoke-only management denial.
3. AUTH-3: constrained create/update cannot manage or attach.
4. LIFE-2: stale revision 409; missing If-Match 428.
5. USE-2/6/7: quota 429 versus denial 403; refusals neither forwarded nor debited; request user spoof ignored; private cache headers; own-usage identity and usage-read denial.
6. DATA-3/USE-5: zero, unlimited and profile OR without cross-profile period splicing.
7. AUTH-5: real org ancestors; own/ancestor allowed; descendant/sibling/null denied; no-unit caller denied.
8. AUTH-6: Public requires exemption-capable permission, never anonymous.
9. AUTH-4: owner-constrained invoke matches no private profile.
10. AUTHAPI-3: body/query/JWT context forgery, including fabricated ancestor membership; invalid signature.
11. EVAL-3: real-time 4-second decision/whoami cache; role revoke bounded by expiry; per-user isolation; SQL profile disable immediate.
12. EVAL-3: zero TTL sees revoke on next request.
13. MODEL-1/2/3: wildcard served/allowed intersection; unavailable-list fallback; user/alias quota separation.
14. AUTH-10: administrator quota bypass and accounting, still deployment-allowlist-bound.
15. METER-4 smoke: fake missing/malformed/oversize usage yields positive estimates, never measured zero.
16. METER smoke: fake Chat/Responses streams settle measured metadata once.
17. AUTH-8: attaching a private, no-audience profile to Authenticated Users grants two existing users and a user created afterward; all invoke and are metered separately, anonymous is denied, and detach revokes all three while retaining the managed permission.

### Existing tests executed by the combined run

All 10 existing LLM Services spec files plus the Auth API LLM partial-decision, migration and support specs. This includes real Postgres ledger/repository/API tests and real OPA residual-to-SQL agreement tests. Some existing focused tests intentionally mock Auth/provider data; their 216 passes must **not** be represented as 216 real-provider E2E cases. The actual current suite count is recorded rather than inferring an expected count from earlier edits.

The metadata-only reporter records per-file counts in the regression evidence, making the total unambiguous: **186 LLM Services tests + 30 Auth API tests = 216**.

| Existing spec                                                                                              | Passed |
| ---------------------------------------------------------------------------------------------------------- | -----: |
| [ProfileRepository](../../src/test/ProfileRepository.spec.ts)                                              |      6 |
| [UsageLedger](../../src/test/UsageLedger.spec.ts)                                                          |      9 |
| [createApp](../../src/test/createApp.spec.ts)                                                              |     13 |
| [invocation](../../src/test/invocation.spec.ts)                                                            |     24 |
| [metering](../../src/test/metering.spec.ts)                                                                |     31 |
| [periodsAndQuota](../../src/test/periodsAndQuota.spec.ts)                                                  |     14 |
| [profileApi](../../src/test/profileApi.spec.ts)                                                            |     24 |
| [usageApi](../../src/test/usageApi.spec.ts)                                                                |     24 |
| [usageObserver](../../src/test/usageObserver.spec.ts)                                                      |     33 |
| [validation](../../src/test/validation.spec.ts)                                                            |      8 |
| [LlmAccessPartialDecision](../../../magda-authorization-api/src/test/LlmAccessPartialDecision.spec.ts)     |      9 |
| [LlmAccessProfilesMigration](../../../magda-authorization-api/src/test/LlmAccessProfilesMigration.spec.ts) |      6 |
| [LlmAccessProfilesSupport](../../../magda-authorization-api/src/test/LlmAccessProfilesSupport.spec.ts)     |     15 |

## Repeatability and runner safety checks

- The final 17-group suite passed twice consecutively, each with 26 fake-provider forwards, 216 existing tests, zero pending/failures, and full container cleanup. The preceding run was `magda-3945-0feb0710-36a0-491f-9f3e-03b8c3201592` at `2026-11-27T08:53:19.188Z`; the final run added per-file reporter counts without modifying product source.
- Both final runs deliberately supplied invalid inherited `PGHOST`, `PGPORT`, `PGSSLMODE`, `PGSSLROOTCERT`, `PGOPTIONS` and `POSTGRES_HOST`. The runner removed them before constructing its disposable connection configuration; both commands exited 0.
- An earlier completed run of the 16 groups also passed 16/16 with 23 fake-provider forwards and complete container cleanup (`magda-3945-b001a8aa-2ff2-40f7-a0db-0ae590939bed`, `2026-11-27T08:45:42.380Z`). The final run additionally strengthened the forged ancestor fixture.
- An earlier 15-group run (before estimate-fallback smoke was added) passed 15/15 and cleaned up.
- Missing-image preflight was tested with `HARNESS_OPA_IMAGE=magda-3945-intentionally-missing-image`. The runner exited 1 without pulling any image or creating any container, and emitted `harness-cleanup` with `ok: true` and an empty container list.
- Focused standalone validation, period/quota, observer and metering specs passed **83 tests**, using the explicit `--no-config --no-package` flags. An initial command omitted `--no-package`, causing package configuration to expand to unrelated DB suites without Postgres; the corrected command and then the complete isolated run above passed. These setup failures were not counted as qualification passes.

## Claim boundary

This qualifies the local real Auth/OPA/Postgres/facade integration for the listed cases. It does not qualify deployed images, Gateway/browser/Settings UI, DSH, real LiteLLM/provider compatibility, billing accuracy, all lifecycle/commit/outage races, production database privilege/migrator packaging, or a 30-second wall-clock cache period. The parent agent owns any separately executed live/browser checks. No cluster mutation, Helm action, commit or push was performed by this isolated harness work.

Open follow-ups remain [fresh v8 install/full UI and recovery #3972](https://github.com/magda-io/magda/issues/3972), [provider qualification #3971](https://github.com/magda-io/magda/issues/3971), [USE-10 unbounded-profile ledger reads #3969](https://github.com/magda-io/magda/issues/3969), [multi-replica/durable settlement #3970](https://github.com/magda-io/magda/issues/3970), and [DSH title retry/shutdown cancellation #38](https://github.com/magda-io/dsh-fork/issues/38). Passing this local harness does not close them.
