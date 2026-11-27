# LLM access profiles and soft usage limits: v8 release notes

**Status:** Release-note draft for the unreleased v8 development line and [#3950](https://github.com/magda-io/magda/issues/3950) qualification of the [#3937](https://github.com/magda-io/magda/issues/3937) implementation PoC. This is not an announcement of a release or production readiness. Test results belong in the qualification evidence, not implied by this document.

## Access change (DEP-4)

**LLM access is no longer implied by `agentWorkspace/access`.** That permission lets a user open Agent Workspace; model invocation now uses `llm/access/invoke` and access profiles. Independent LLM clients do not need Workspace access. Existing administrators remain able to invoke deployment-allowed aliases without a profile or quota, and their requests are still metered.

For ordinary Workspace users, the standard setup is:

1. Assign **Agent Workspace Users**, which now includes the audience/exemption-capable invoke permission as well as Workspace access.
2. Create an enabled profile covering the required model, and either mark it **Public** or put it on the user's org unit or an ancestor.

Alternatively, attach a profile's managed invoke permission to an existing role and assign users to that role, or use another appropriate invoke grant. A parent-unit user does not inherit a child's audience profile. Public still needs an exemption-capable invoke grant and never means anonymous access.

**Authenticated Users is intentionally allowed in the profile's role picker: attaching it gives this profile to everyone signed in (AUTH-8).** This broad grant is an explicit manager action, never a migration default. Anonymous Users and Admin Users cannot be selected. Managers do not receive general role-update authority.

The Authorization DB migration seeds the unassigned **LLM Profile Managers** role (central profile management, invoke, all-user usage and read-only org-unit access). It adds the stock invoke permission to Agent Workspace Users only if that role exists. It does not assign users, recreate a deleted role, seed a default profile or give every signed-in user access automatically.

## Deployment impact

Deploy the matching LLM Services, Authorization API, OPA, Gateway, web client and database migrators together. The feature adds the component-owned **`llm` database** and its migrator on the existing combined-db or configured external PostgreSQL topology. **No new PostgreSQL server, Redis, LiteLLM database, virtual keys or LiteLLM budgets are required.** Back up profiles and usage alongside other component databases.

The bundled backend pin is **`ghcr.io/magda-io/litellm:v1.83.14-stable.patch.3`** (LiteLLM 1.83.14), not the initial observer PoC's 1.81.12. The deployment allowlist comes from `global.llmServices.defaultModel` and `additionalModels`; the old `llm-services.allowedModels` is not the configuration interface. The allowlist applies to administrators too. Provider credentials remain private to LiteLLM.

v8 is unreleased, so there is no released-v8-user migration. Operators of pre-release deployments must still run both migrations, configure access explicitly and verify ordinary-user behaviour; they must not assume the older Workspace-only route grants survive. Do not repair Flyway history or delete existing databases indiscriminately.

## What the limits do—and do not do

Profiles have daily, Monday-start weekly and calendar-month limits, independently per user and public model alias. Blank is unlimited; `0` blocks new non-administrator calls. Several eligible profiles combine as alternatives, not stacked budgets. Usage is attributed to the request-start local date in the configured IANA timezone (default `Australia/Sydney`).

The ledger distinguishes measured usage from calibrated estimates when final usage is absent/unusable. Both count toward soft token-volume limits. Current metering fields/defaults are in the [chart values](../../deploy/helm/internal-charts/llm-services/values.yaml); see the [architecture's metering boundary](./architecture/llm-services.md#metering-boundary). These counts are not invoices, dollar budgets or guaranteed provider-token accuracy.

There are no reservations or in-flight cut-offs. Concurrent requests can overshoot; a process crash can lose a not-yet-settled request; duplicate suppression and the post-write-failure admission gate are process-local, not durable multi-replica coordination. A failed write is not replayed, and a healthy database later does not reconstruct lost usage. Other providers/backends need their own compatibility and cancellation checks. Do not claim universal qualification or production-ready accounting from the existence of the UI or Helm templates.

## User-facing changes

**Settings → LLM Services** provides Access Profiles for central managers, My Usage for users with invoke permission (the API accepts any authenticated user), and User Usage for unconstrained usage readers. Names/emails require the viewer's normal user-read rights; otherwise IDs remain available. Histories survive profile/user deletion. Workspace displays a no-model-access message when its user lacks eligible models; operators may configure safe help text and an HTTP(S) request-access link.

`403 llm_no_eligible_profile`, `429 llm_quota_exceeded` and `503 llm_usage_unavailable` distinguish missing access, exhausted limits and accounting failure. Quota refusals send `x-should-retry: false`. Remaining quota is an admission indicator, not a promise of tokens a running call may consume. User-specific responses are `private, no-store`.

See the [operator procedure](./agent-workspace-deployment.md#llm-access-profiles-and-usage), [architecture](./architecture/llm-services.md), [ADR 0013](./adrs/0013-central-llm-profile-management-and-invoke-grants.md) and [ADR 0014](./adrs/0014-translate-llm-invoke-decisions-to-profile-sql.md).
