# LLM access profiles and soft usage limits: v8 release notes

**Status:** Release-note draft for v8. Test outcomes and deployment-specific evidence belong with the PR or release validation, not in this maintained document.

## Access change (DEP-4)

**LLM access is no longer implied by `agentWorkspace/access`.** That permission lets a user open Agent Workspace; model invocation now uses `llm/access/invoke` and access profiles. Independent LLM clients do not need Workspace access. Administrators can invoke every deployment-allowed alias without a profile or quota, and their requests are still metered.

For ordinary Workspace users, the standard setup is:

1. Assign **Agent Workspace Users**, which includes the audience/exemption-capable invoke permission as well as Workspace access.
2. Create an enabled profile covering the required model, and either mark it **Public** or put it on the user's org unit or an ancestor.

Alternatively, attach a profile's managed invoke permission to an existing role and assign users to that role, or use another appropriate invoke grant. A parent-unit user does not inherit a child's audience profile. Public still needs an exemption-capable invoke grant and never means anonymous access.

**Authenticated Users is allowed in the profile's role picker: attaching it gives this profile to everyone who can sign in, including accounts created later (AUTH-8).** This broad grant is an explicit manager action, never a migration default. Anonymous Users is excluded because there is no individual authenticated identity to meter. Admin Users is excluded because attachment is pointless: administrators already have every deployment-allowed model. Managers do not receive general role-update authority.

The Authorization DB migration seeds the unassigned **LLM Profile Managers** role (central profile management, invoke, all-user usage and read-only org-unit access). It adds the stock invoke permission to Agent Workspace Users only if that role exists. It does not assign users, recreate a deleted role, seed a default profile or give every signed-in user access automatically.

## Deployment impact

Deploy matching LLM Services, Authorization API, OPA, Gateway, web client and database migrators together. The feature adds the component-owned **`llm` database** and its migrator on the existing combined-db or configured external PostgreSQL topology. **No new PostgreSQL server, Redis, LiteLLM database, virtual keys or LiteLLM budgets are required.** Back up profiles and usage alongside other component databases.

The bundled backend pin is **`ghcr.io/magda-io/litellm:v1.83.14-stable.patch.3`** (LiteLLM 1.83.14). The deployment allowlist comes from `global.llmServices.defaultModel` and `additionalModels`; the old `llm-services.allowedModels` is not the configuration interface. The allowlist applies to administrators too. Provider credentials remain private to LiteLLM.

The provider-qualified route is the tested **OpenAI Responses streaming** route through bundled LiteLLM. Synthetic Chat/Responses fixtures do not establish support for another provider, backend or endpoint. Additional routes require their own compatibility checks.

v8 is unreleased, so there is no released-v8-user migration. Operators of pre-release deployments must still run both migrations, configure access explicitly and verify ordinary-user behavior; they must not assume the older Workspace-only route grants survive. Do not repair Flyway history or delete existing databases indiscriminately.

## Accounting behavior and limits

Profiles have daily, Monday-start weekly and calendar-month limits, independently per user and public model alias. Blank is unlimited; `0` blocks new non-administrator calls. Several eligible profiles combine as alternatives, not stacked budgets. Usage is attributed to the request-start local date in the configured IANA timezone (default `Australia/Sydney`).

The ledger distinguishes measured usage from estimates when valid final usage is absent. Both count toward soft token-volume limits. The provisional estimate defaults use **5 bytes per token** for both request input and visible output. When nonempty visible text/tool output is observed, its byte estimate is used without an extra output amount. Only when no nonempty visible output is observed does the **4096-token fallback**, or its per-alias override, apply. Incomplete attempts apply **0.25** to estimated input plus any fallback output; visible output is not discounted. Valid final usage is measured unchanged, including failed/incomplete responses.

These are **provisional budget-policy defaults**, not measured token ratios, statistically calibrated values or billing reconciliation. Current fields are in the [chart values](../../deploy/helm/internal-charts/llm-services/values.yaml); see the [exact formula](./architecture/llm-services.md#metering-boundary). Counts are not invoices, dollar budgets or guaranteed provider-token accuracy.

The following behavior is part of the accounting contract:

- **Fail closed on reads:** profiles and usage share the same `llm` database. Non-administrator admission returns `503` when the eligibility/usage query is unavailable, including for unlimited profiles. An unlimited budget does not bypass the database authority needed to prove access.
- **Soft limits:** no reservations or in-flight cut-offs are made, so concurrent and already-running requests can overshoot.
- **Process-local protection:** duplicate suppression and the failed-write bounded-admission gate are per process, not durable multi-replica coordination. An unlimited profile may bypass that write gate only after a successful eligibility read; administrators bypass quota admission.
- **No replay:** a process crash can lose a not-yet-settled request. A failed write is not retried after an uncertain commit, and later database recovery does not reconstruct missed usage. Readiness checks connectivity, not committed accounting or the write gate.

## User-facing changes

**Settings → LLM Services** provides Access Profiles for central managers, My Usage for users with invoke permission (the API accepts any authenticated user), and User Usage for unconstrained usage readers. Names/emails require the viewer's normal user-read rights; otherwise IDs remain available. Histories survive profile/user deletion. Workspace displays a no-model-access message when its user lacks eligible models; operators may configure safe help text and an HTTP(S) request-access link.

`403 llm_no_eligible_profile`, `429 llm_quota_exceeded` and `503 llm_usage_unavailable` distinguish missing access, exhausted limits and accounting failure. Quota refusals send `x-should-retry: false`. Remaining quota is an admission indicator, not a promise of tokens a running call may consume. User-specific responses are `private, no-store`.

See the [operator procedure](./agent-workspace-deployment.md#llm-access-profiles-and-usage), [architecture](./architecture/llm-services.md), [test procedure](./e2e-test-cases/llm-services.md), [ADR 0013](./adrs/0013-central-llm-profile-management-and-invoke-grants.md) and [ADR 0014](./adrs/0014-translate-llm-invoke-decisions-to-profile-sql.md).
