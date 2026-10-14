# Web and product integration design

**Status:** Draft  
**Owner ticket:** TBD  
**Depends on:** #3823, #3824, #3825 and mutation approval

## Product lifecycle

The initial #3850 Agent Workspace page was hard-gated to the Admin Users role. **Expanded MVP target (#3858):** one grantable OPA operation **`agentWorkspace/access`** controls only the authenticated user's own Workspace lifecycle, DSH HTTP and WebSocket; the initial role grant remains admin-only by default. This is an API-side authorization check, not a menu visibility decision. The product supports one current Workspace per authenticated Magda user **per installation**, with multiple DSH sessions inside. Fine-grained LLM-model authorization remains separate (#3838).

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

## Agent Skills catalogue and agent-led creation (expanded MVP)

**Authoritative permissions, sharing and sync contract:** [skill authorization and Workspace manifest decisions](./skills-authorization-and-workspace-manifest.md). **Skill discovery is based on the intended user; skill access is based on authorization; skill synchronization is optional to Workspace availability.**

Settings navigation is a non-clickable **Agent Workspace** group with independent children:

```text
Agent Workspace
  Open Workspace    /settings/agent-workspace
  Agent Skills      /settings/agent-workspace/skills
  Shared Skills     /settings/agent-workspace/shared-skills  # future #3861
```

`Open Workspace` depends on `agentWorkspace/access`; `Agent Skills` visibility uses relevant `object/agentSkill/system/read` or `object/agentSkill/user/read` permission (or standard admin override). Future `Shared Skills` requires appropriate user-source read/install permissions and does not implicitly require Workspace access. Whoami navigation is **not** authoritative authorization; all endpoints enforce permission.

**Agent Skills** is a paginated READY-only, primarily read-only catalogue and introduction. Show user/system publication metadata derived from ZIP `SKILL.md` (name/description, `type`, immutable target `userId` where applicable, record ID and publisher history). User-owned ZIPs may be downloaded and an **existing** user skill ZIP replaced with proper typed read/update permission and immutable name/ID; do not build direct upload-to-create, arbitrary metadata edit or system-skill ZIP management UI in #3857. System skills show metadata only initially. Keep workflow-capture example encouraging user to ask DSH to turn a successful CSV-cleanup procedure into a skill and explicitly publish after review. Existing `mgd agent-skill` CLI handles local drafts, validation, publish and manual sync; published skill updates do not promise immediate live sync.

**Shared Skills** (#3861) has (a) All available, listing readable READY other-user shared publications for optional Install, and (b) Installed, listing current recipient's `agent-skill-installation.userId` records, source/revocation diagnostics and Uninstall. Sharing via simplified user-UUID input/member UI should reuse Access Group components/backend ideas with typed operations, not broad `object/record/read`. Installation never copies or grants the source ZIP. Name collision asks for alias; alias rename needs uninstall+reinstall, not `install/update`. Readable does not mean installed.

**Workspace skill-sync feedback:** Essential Workspace startup launches DSH even if some/all publication/installation sync fails. Prefer a simple MAGDA Settings Workspace-page banner/status above the embedded standard DSH UI, reporting `success`, `partial`, `failed` or `notAttempted`, counts, and sanitized per-skill errors. For Registry/Storage/OPA outage, show a skill-sync failure but **do not block DSH access or misreport a successful zero-skill manifest**. No new retry control/API is required for MVP; termination/restart can retry. Keep the existing best-effort manifest and revoke-on-reconciliation semantics documented in the linked design.

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
