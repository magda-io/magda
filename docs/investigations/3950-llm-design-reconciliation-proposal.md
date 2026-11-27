# #3950: LLM design reconciliation proposal

**Status: docs-only proposal on the implementation work branch.** This does not edit, approve, retire or merge the design branch. Applying changes to that branch requires explicit user go-ahead. It is not a qualification report or a claim of production readiness.

## Comparison baseline and authority

Reviewed the actual LLM Services, OPA, Authorization DB migration, LLM Services DB migration, Helm and web access implementation on the #3950 work branch. Read the latest available design through `git show origin/design/3838-llm-profiles-soft-usage-limits:docs/design/agent-workspace/llm-access-profiles.md` and its UI companion, at **`e1ce44ba4`** (latest locally available remote-tracking commit when reviewed). No remote fetch or claim about unseen later commits is implied. The working-tree design copy was **not** used as the design baseline.

The maintained current contracts are now [LLM Services architecture](../docs/architecture/llm-services.md), [operator setup](../docs/agent-workspace-deployment.md#llm-access-profiles-and-usage), [DEP-4 release notes](../docs/llm-services-release-notes.md), [ADR 0013](../docs/adrs/0013-central-llm-profile-management-and-invoke-grants.md) and [ADR 0014](../docs/adrs/0014-translate-llm-invoke-decisions-to-profile-sql.md). Tests, validators and implementation remain executable authority. Do not turn this proposal into a second maintained specification.

## Recommended reconciliation, subject to approval

| Design area                              | Current implementation / recommendation                                                                                                                                                                                                                                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header and UI header: “Not implemented”  | Replace with implemented PoC on the v8 development line, with qualification tracked separately. Do not replace with “production ready”, “released” or “all acceptance tests passed”. Link maintained architecture and guides.                                                                                                     |
| Registry ownership in older architecture | Profiles and daily usage are LLM Services-owned SQL tables in `llm`, not Registry records. Preserve service ownership and no direct Auth DB access.                                                                                                                                                                               |
| MODEL-1: `llm-services.allowedModels`    | Replace with aliases from `global.llmServices.defaultModel` + `additionalModels`, shared by LLM Services, LiteLLM and Workspace. Public aliases remain exact, operator-bounded and mandatory for administrators too.                                                                                                              |
| MODEL-2 backend availability             | Preserve wildcard fallback to the configured allowlist; explain successful/failure model-list caching and distinguish model discovery from provider health. Explicit aliases are validated on writes against available aliases.                                                                                                   |
| AUTH-3/5/6/7 and EVAL-1                  | Keep the decisions but move durable rationale to ADRs 0013/0014. Central management, audience direction, exemption matching and one managed permission are implemented. Do not preserve future-tense claims.                                                                                                                      |
| AUTH-8                                   | Explicitly state **Authenticated Users is intentionally allowed and means everyone signed in**. Preserve exclusions only for Anonymous Users and Admin Users. Public plus exemption-capable invoke is a different path, not automatically all users. Add a regression/acceptance case for the broad role.                         |
| AUTH-11                                  | Keep the stock manager role's read-only org-unit permission, and clarify the migration does not assign users, seed a profile, attach Authenticated Users or recreate a deleted Agent Workspace Users role.                                                                                                                        |
| EVAL-3                                   | Keep the design's at-most-30-second bound. #3950 aligns the parser and constructor to 0–30 (older code accepted 300); callers must not increase revocation delay through a 300-second setting. Profile attributes still read each request.                                                                                        |
| METER-4 and DEP-3                        | Replace `ceil(bytes/4) + 4096` with the implemented calibrated estimate, below. Valid final usage remains the preferred measurement, never discounted. Do not relabel estimates as actual provider counts.                                                                                                                        |
| METER-3                                  | Add metadata-only output-byte/terminal/status/done-marker fields; counting deltas does not mean retaining output. Retain bounded observation, unchanged forwarding and no prompt/output/tool-argument logging.                                                                                                                    |
| METER-2 and PoC evidence                 | Keep 1.81.12 findings as dated historical evidence only. Current bundled image is `ghcr.io/magda-io/litellm:v1.83.14-stable.patch.3` (1.83.14). Qualification against that pin must have its own actual results, especially first streams after restart, tools, incomplete events and cancellation.                               |
| USE-10                                   | Reconcile the current fail-closed read behaviour: all non-administrator eligibility reads join usage, even unbounded profiles. The narrower write-failure gate does allow unbounded profiles after a successful read. Do not claim general unbounded-profile availability during a ledger/read outage. See follow-up scope below. |
| USE-7/10, METER-5                        | State settlement deduplication and write-failure admission gating are process-local. No durable idempotency journal, multi-replica shared gate, replay or crash-loss recovery exists. Do not imply exactly-once or coordinated hard budget enforcement.                                                                           |
| API-11 lifecycle errors                  | Preserve safe errors but do not promise a failed request changed nothing. Auth API refusal may surface as 502; uncertain outcomes can have side effects. Distinguish that from invocation 403/429/503.                                                                                                                            |
| API-7/8/12/14 and UI                     | Preserve subject-grant eligibility, viewer-scoped names/search and deleted-user history. State history API date filters are inclusive while internal SQL sums use half-open ranges. My Usage API is any authenticated user; navigation requires an invoke permission or administrator.                                            |
| DEP-1/2/4                                | Keep separate component database on existing PostgreSQL topology, no new PG server/Redis/LiteLLM DB; include backup/restore and both migrators. Keep explicit Workspace access change in release notes; unreleased v8 does not excuse pre-release operator setup.                                                                 |
| TEST-\*                                  | Mark procedures separately from actual observed evidence. Do not inherit the initial observer experiment's test count or provider claims as current full-feature qualification.                                                                                                                                                   |

### Metering text to reconcile

The final #3950 implementation has `usage.estimate.bytesPerToken: 6`, `outputAllowanceTokens: 256`, `incompleteFactor: 0.25`, `outputTokens: 4096`, and `outputTokensByModel: {}` by default. Consult [settlement](../../magda-llm-services/src/metering/settlement.ts) and [chart values](../../deploy/helm/internal-charts/llm-services/values.yaml) when applying the change.

```text
input = ceil(forwarded request body bytes / bytesPerToken)
if visible text/tool output deltas were observed:
    visible = ceil(observed output bytes / bytesPerToken)
    allowance = outputAllowanceTokens
else:
    visible = 0
    allowance = outputTokensByModel[alias] or outputTokens
factor = 1 if normally completed, otherwise incompleteFactor
estimate = visible + ceil((input + allowance) * factor)
```

Failed/incomplete terminal, absent terminal, interruption, unobservable format and observer failure are not normal completion. The visible contribution is never discounted. Valid final usage is measured unchanged, including incomplete/failed events; the formula applies only when valid final usage is absent. Output-byte observation is metadata, not storage or logging of output. The heuristic intentionally leaves hidden reasoning and billing reconciliation approximate. `outputTokensByModel` is a fallback override, not a per-model hidden-allowance map.

### Document lifecycle recommendation

After user approval, reconcile the design branch once against the final #3950 code and observed evidence, then either archive the historical design with stable redirects/links or leave a clearly labelled transitional historical page pointing to maintained contracts. Preserve requirement IDs for existing issue/test references. Keep only genuine open proposals there; do not maintain two competing descriptions of implemented APIs. Do not silently delete established design links before checking callers.

## Concrete follow-up issue scopes

These gaps are tracked, not fixed or silently waived:

- [#3969 — unbounded-profile ledger read failures](https://github.com/magda-io/magda/issues/3969);
- [#3970 — multi-replica accounting and durable settlement guarantees](https://github.com/magda-io/magda/issues/3970);
- [#3971 — provider-specific qualification](https://github.com/magda-io/magda/issues/3971);
- [#3972 — fresh v8 install and full browser/recovery qualification](https://github.com/magda-io/magda/issues/3972);
- [dsh-fork#38 — bounded title retry and shutdown cancellation](https://github.com/magda-io/dsh-fork/issues/38).

The following scopes explain the first four technical recommendations; the qualification report records actual results separately.

### 1. Clarify and test unbounded-profile availability on usage read failure (USE-10)

**Problem:** [Admission.eligibility](../../magda-llm-services/src/access/Admission.ts) always joins period usage with profiles. A usage-table/read failure prevents even an unbounded profile from admitting, contrary to a broad reading of USE-10's “profiles without limits follow their normal path”. A complete database outage also removes profile authority, so bypassing all DB checks is unsafe.

**Scope:** Decide explicitly between retaining documented fail-closed behaviour or adding a profile-only fallback that can prove enabled state, covering alias and caller residual for a wholly unbounded profile without depending on usage-table reads. Never infer access from a stale model list alone. Keep administrator behaviour separate.

**Acceptance:** Tests distinguish unavailable whole DB/profile table, usage-read-only failure, bounded-only, mixed bounded/unbounded, zero limit, no eligible profile and write-gate-only failure. Published contract states exactly which failures permit unbounded calls; no unnoticed unchecked bounded spending.

### 2. Define multi-replica accounting failure and durable settlement guarantees

**Problem:** [UsageLedger](../../magda-llm-services/src/usage/UsageLedger.ts) has per-process gate/dedup memory; a crash before settlement loses counts, another replica does not inherit a failed-write gate, and readiness only probes connectivity. Soft limits intentionally allow overshoot, but this is weaker than a deployment-wide halt after accounting failure.

**Scope:** First decide whether these remain accepted PoC limits or are prerequisites for a supported multi-replica mode. If stronger guarantees are required, design durable request IDs/idempotency and shared failure signalling/recovery within the existing database topology; do not add PG/Redis by default or retry uncertain writes without idempotency. Specify safe health/alert semantics and backup/restore implications. Do not expand #3950 into billing-grade reservations.

**Acceptance:** Two-replica failure tests show the agreed gate behaviour; crash/unknown-commit tests cannot double-debit; operators can distinguish response success from committed settlement and know which losses are unrecoverable. Architecture and readiness docs match the agreed guarantee.

### 3. DSH auxiliary title retry/cancellation in the maintained dsh-fork

**Problem:** Auxiliary title/background requests are independently forwarded and metered. Retry/cancellation policy belongs in DSH, not facade request-count special cases; local runtime-source changes here would not update the pinned release archive.

**Scope:** A small dsh-fork issue should reproduce and bound title retries/cancellation during shutdown/failure, decide the intended user experience and retry policy, add focused regression tests, and publish a new maintenance release only if needed. MAGDA then changes its runtime pin with actual qualification. Do not exempt titles from accounting or relabel retries as one wire request.

**Acceptance:** Metadata-only evidence distinguishes title attempts, continuations and user turns; failed/incomplete/shutdown cases avoid unintended retry amplification; every forwarded attempt retains normal measured/estimated settlement. No prompts, output or credentials in evidence.

### 4. Extend provider-specific metering qualification

**Problem:** One OpenAI/Responses route and synthetic fixtures do not qualify Anthropic, Bedrock, Azure, external OpenAI-compatible backends, all model/tool combinations or provider billing.

**Scope:** Add a provider/model/endpoint/mode matrix against the current LiteLLM pin, including cold-start streams, tool continuations, `response.incomplete`, cancellation, absent usage, duplicate/conflicting snapshots and malformed/oversize observation. Calibrate byte ratios/hidden allowance with safe aggregate metadata only.

**Acceptance:** Each claimed supported route has actual reproducible results and explicit untested cells. Missing usage never becomes free, final usage is never doubled, forwarding is unchanged, and no claim of billing accuracy is made without independent reconciliation.

## Handoff restrictions

All changes here are documentation only, on the work branch; no design-branch edit, commit or push. No test results are asserted by this proposal. Release qualification should attach safe metadata and observed outcomes separately, without credentials, prompts, model output, tool arguments or attribution text.
