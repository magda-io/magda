# Web and product integration design

**Status:** Draft  
**Owner ticket:** TBD  
**Depends on:** #3823, #3824, #3825 and mutation approval

## Product lifecycle

The v8 alpha implementation (#3850) exposes **Settings → Agent Workspace** only to the **Admin Users** role, with a normal Settings page and a same-origin embedded stock DSH Web UI when the Sandbox is READY. The backend independently checks the administrator role; hiding the menu is not authorization. The product still supports one current workspace per authenticated Magda user **per Magda installation**. Fine-grained feature/model authorization is later design work (#3838).

Expected lifecycle:

- no current Sandbox -> create/open agent;
- ALLOCATING/BOOTSTRAPPING -> show provisioning state;
- READY -> show proxied DSH UI;
- SUSPENDED -> reconnect wakes the same Sandbox/PVC;
- FAILED/DEGRADED -> show actionable status;
- "new agent" warns that current workspace/session state will be deleted, then replaces it;
- explicit logout triggers immediate sandbox/key cleanup.

The normal 30-minute idle suspend is not a user-visible destructive event; returning resumes the same PVC-backed session. The activity-relative 8-hour hard deletion is destructive and starts fresh next time. The managed Magda key expires/renews against the same intended deadline; partial-failure reconciliation is not yet fully settled (see [session-lifecycle.md](./session-lifecycle.md)).

## DSH presentation

Reuse DSH's conversation/tool UI rather than rebuilding the coding-agent frontend.

Magda deployment controls provider/model selection. The production Magda DSH profile should hide/disable generic model selector, model settings and plugin-management surfaces where supported.

New DSH sessions default to `workspace-write` with approval policy `ask`. The managed Magda UI hides the persistent `danger-full-access` selection. Per-action approval remains available when DSH decides an operation needs confirmation/escalation.

The initial #3850 snapshot crops the entire DSH navigation column, although DSH can create multiple sessions. **Agreed target:** retain one Agent Workspace/Sandbox per user per Magda installation while **allowing multiple DSH sessions/conversations**. Reuse a **simplified DSH sidebar** so sessions are visible and switchable instead of hidden. Brand the sidebar **Agent Workspace**; keep DSH's existing **New Session** terminology consistently throughout its UI and **keep Search**. Hide Plugins, Settings, View Options and Add Workspace controls; Settings need only be **hidden**, not disabled at its service level. Do not fork DSH just to replace standard text. Avoid exposing multiple separately managed filesystem Workspaces; DSH sessions share the single managed Sandbox/PVC.

The managed UI still hides deployment-controlled provider/model/plugin management and the persistent Full Access selector. CSS hiding is **not** a security boundary: runtime and Magda server authorization remain authoritative. The stock DSH sidebar/plugin customizations should be implemented through the managed profile where possible, replacing the iframe-crop workaround, with responsive/reconnect tests.

## User-skill experience (future implementation)

There is **no separate MAGDA skill editor/list management UI** in the first skill-system release. The user can ask the DSH agent to create/update/delete or inspect skills through the `mgd agent-skill` CLI, use DSH's **read-only file explorer** to review downloaded/local draft `SKILL.md` and associated resources, and optionally edit local files with DSH Bash. Editing a skill locally does **not** publish it; the agent should present drafts, request explicit confirmation and publish via `mgd`. A `capture-workflow` runtime-bundled skill and a brief configured DSH system-prompt instruction can occasionally suggest saving a successful reusable workflow. Published skills survive workspace deletion and sync after a new claim/bootstrap. See [skills.md](./skills.md).

## Gateway/proxy

Magda Gateway remains the external same-origin entry point.

DSH traffic is proxied:

```text
Browser -> Magda Gateway -> Agent Manager -> Sandbox Service -> DSH
```

The browser never receives a Pod/Sandbox address.

#3824 is Accepted based on #3841. DSH binds directly to the Sandbox Pod network; there is no bridge sidecar. Stock DSH launch-token/cookie authentication is retained for MVP but held entirely server-side by Agent Manager, and `X-Magda-Session` never enters the Sandbox.

## LLM controls

Users do not directly enter OpenAI/Anthropic/AWS/Azure credentials into DSH.

The sandbox is preconfigured to use Magda LLM Services. The default model/reasoning effort is deployment/product policy, and model availability is ultimately enforced by Magda authorisation.

A future product design may expose a Magda-native authorised model selector, but DSH's generic provider-management UI is not the source of truth.

## Migration

Keep the existing WebGPU agent available during early v8 transition behind a separate feature/entry point. Decide later whether it remains a local/privacy mode or is deprecated.

## Foreground-work lifecycle warning

The existing accepted lifecycle treats actively executing foreground turns/tools as meaningful activity, while #3850 currently renews on successful explicit DSH mutation RPCs and resume. A >30-minute turn with no further qualifying HTTP request may be suspended. Product behaviour and warning copy must follow the eventual decision in [session-lifecycle.md](./session-lifecycle.md); do not implicitly promise uninterrupted long-running jobs before the scenario is tested. WebSocket keepalives alone must not renew the deadline.
