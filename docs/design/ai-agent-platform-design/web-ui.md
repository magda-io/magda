# Web and product integration design

**Status:** Draft  
**Owner ticket:** TBD  
**Depends on:** #3823, #3824, #3825 and mutation approval

## Product lifecycle

The initial #3850 Agent Workspace page was hard-gated to the Admin Users role. **Implemented expanded MVP (#3858, reviewed/closed):** one grantable OPA operation **`agentWorkspace/access`** controls only the authenticated user's own Workspace lifecycle, DSH HTTP and WebSocket; the initial role grant remains admin-only by default. This is an API-side authorization check, not a menu visibility decision. The product supports one current Workspace per authenticated Magda user **per installation**, with multiple DSH sessions inside. Fine-grained LLM-model authorization remains separate (#3838).

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

## Stage-3 Agent Skill publication confirmation (2026-10-19)

**Authoritative:** [Workflow capture and single-approval design](./workflow-capture.md). The existing per-command DSH sandbox escalation UI remains available to other tools, but **is not the normal Agent Skill publication confirmation mechanism**. An agent's explicit `mgd agent-skill publish` intent should execute through a small trusted, typed deployment DSH tool, in the same nonroot user's Kubernetes Sandbox, preserving normal Bash sandboxing. **One user decision**: if the agent judges the user clearly approved the specific reviewed draft in chat (`userApproved: true`), publish directly; otherwise the typed tool itself invokes `ctx.userQuestions.ask()` and displays a selectable **Publish / Cancel** card, continuing within the same tool invocation after Publish. No custom modal required for the MVP; no extra model turn between UI approval and operation. Cancelling or absent question UI does not publish.

**The same selectable UI for system and user publications.** A user skill dialog states it is saved to that user's account and reused in later Workspaces. A system skill dialog explicitly explains broader visibility: other authorised MAGDA users and Workspaces may gain access, subject to backend access controls; system publication is not anonymously/public-internet accessible. **Do not add a second system-specific dialog or permission mechanism.** Existing typed Agent Services system/user authorization is authoritative. No new Settings skill editor or publish UI in #3857 is required by Stage 3.

## Agent Skills catalogue and agent-led creation (expanded MVP; #3857 reviewed/closed)

**Authoritative permissions, sharing and sync contract:** [skill authorization and Workspace manifest decisions](./skills-authorization-and-workspace-manifest.md). **Skill discovery is based on the intended user; skill access is based on authorization; skill synchronization is optional to Workspace availability.**

Settings navigation is a non-clickable **Agent Workspace** group with independent children:

```text
Agent Workspace
  Open Workspace    /settings/agent-workspace
  Agent Skills      /settings/agent-workspace/skills
  Shared Skills     /settings/agent-workspace/shared-skills  # implemented in draft #3864 (#3861), pending merge
```

`Open Workspace` depends on `agentWorkspace/access`; `Agent Skills` visibility uses relevant `object/agentSkill/system/read` or `object/agentSkill/user/read` permission (or standard admin override). Future `Shared Skills` requires appropriate user-source read/install permissions and does not implicitly require Workspace access. Whoami navigation is **not** authoritative authorization; all endpoints enforce permission.

**Agent Skills** is a paginated READY-only, primarily read-only catalogue and introduction. Show user/system publication metadata derived from ZIP `SKILL.md` (name/description, `type`, immutable target `userId` where applicable, record ID and publisher history). User-owned ZIPs may be downloaded and an **existing** user skill ZIP replaced with proper typed read/update permission and immutable name/ID; do not build direct upload-to-create, arbitrary metadata edit or system-skill ZIP management UI in #3857. System skills show metadata only initially. Keep workflow-capture example encouraging user to ask DSH to turn a successful CSV-cleanup procedure into a skill and explicitly publish after review. Existing `mgd agent-skill` CLI handles local drafts, validation, publish and manual sync; published skill updates do not promise immediate live sync.

### System skill access management — public by default

**Accepted UX direction:** Publishing a system skill defaults to **public-to-authorised-users** by setting `access-control.constraintExemption=true`. This is **not** anonymous/public internet access; it means a principal with an applicable `object/agentSkill/system/read` permission whose `allowExemption=true` can read it, regardless of OrgUnit or explicit recipients. Keep the default; do **not** change #3854's current `constraintExemption=true` initial publication behaviour just to make skills private by default.

System-skill management UI (available only to principals with the necessary typed system-skill management permissions) should show:

- A **"Public skill"** checkbox, **checked by default for new system publications**; associate a hover/focus accessible **? / info icon** and detailed tooltip: “When enabled, this skill is available to all users with a system-skill read permission that allows public access, regardless of their organisation or individual grants. It is not available anonymously.” Map checkbox to `access-control.constraintExemption` (true/false).
- **Organisation access**: one `orgUnitId` selector / clearable tree dropdown using existing [dataset-creation `OrgUnitDropDown.tsx`](../../../magda-web-client/src/Components/Dataset/Add/OrgUnitDropDown.tsx) or `AccessGroupFormPopUp` TreePicker patterns. Maps to `access-control.orgUnitId`. Make effective OrgUnit semantics and authorised choices clear. The backend validates that the manager is allowed to set/change this OrgUnit and that the org exists, rather than trusting browser input.
- **Selected users**: add recipients using MAGDA **user UUID** (findable from the recipient's account page), with a **paginated/searchable grid** showing current grants (user ID and human-friendly account identifier if legitimately available), and individual **Remove** actions with confirmation. Reuse [`AccessGroupUsersPanel.tsx`](../../../magda-web-client/src/Components/Settings/AccessGroupUsersPanel.tsx) concepts: user-ID input, add/remove membership endpoints, member table, pagination and status/error handling; use existing Access Group backend patterns with typed `object/agentSkill/system/read` grants. Group-specific pre-authorised permission IDs attach to the source's `access-control.preAuthorisedPermissionIds`; don't confuse the stock role-wide permission with an individual recipient grant.
- Clearly indicate that **access paths are additive (OR)**: while Public skill is checked, OrgUnit and selected-user settings *do not restrict* who can use the skill. To restrict visibility, uncheck Public skill. The UI can collapse or disable restricted controls while public is checked, but must preserve existing restricted settings and avoid silently removing grants.
- When public access is turned off, the manager can grant to an OrgUnit, selected users, or both. No selected OrgUnit or users means no ordinary non-manager reads unless another explicit permission applies. Explain that access changes affect source download at next Workspace reconciliation; they cannot retract already downloaded data instantaneously.

**Implementation status:** System-skill **Manage Access**, recipient sharing and the Shared Skills page are implemented in draft #3864 (#3861), pending merge; #3857's earlier catalogue MVP did not include them. Access Group grants are typed publication-read permissions, never generic `object/record/read`. Agent Services authorizes the real caller before manipulating grants through its internal lifecycle session. The UI is not an authorization boundary.

**Shared Skills** (#3861) has (a) All available, listing readable READY other-user shared publications for optional Install, and (b) Installed, listing current recipient's `agent-skill-installation.userId` records, source/revocation diagnostics and Uninstall. Sharing via simplified user-UUID input/member UI should reuse Access Group components/backend ideas with typed operations, not broad `object/record/read`. Installation never copies or grants the source ZIP. Name collision asks for alias; alias rename needs uninstall+reinstall, not `install/update`. Readable does not mean installed.

**Accepted sync model (2026-10-18):** The [authoritative scan-based Agent Skill sync design](./local-agent-skill-sync.md) uses independent copied skill directories, inline `.magda-skill-install.json` and no central installation index, journal or cross-harness rollback. A partial sync preserves already-successful copies and reports remaining errors. Normal manual sync reinstalls missing eligible directories and repairs exact-content matching metadata without `--force`. All sync conflicts/errors are **non-blocking for Workspace READY and DSH**.

**Implemented in draft #3850 — failed remote preparation versus local conflicts:** If a required Registry/Storage/OPA source or current publication ZIP cannot be obtained/verified, **stop the Manager's online skill reconciliation before changing installed skill directories** and report failure/retry guidance. Do not install stale cached ZIPs as if current. Workspace remains READY and DSH accessible. Conversely, after complete remote verification, an edited local skill blocks **only itself**; clean updates/removals, missing installs and exact-content metadata repair may succeed, so status can be `partial`. The #3857 Retry dialog is still shown **before** any Manager-invoked forced attempt, warning about potential discarding of actual local edits. No new durable unresolved status field is needed.

**Initiator/timing and Retry UI matrix (#3857):**

| Initiator | Behavior | User confirmation | Status/READY |
| --- | --- | --- | --- |
| Manager, genuinely new/empty Sandbox boot | `sync --force --workspace-status` | No | Detached best effort, never gates READY; Manager records claim result |
| Existing Workspace resume/reconnect/reattach | No silent forced discarding; non-forced reconciliation if needed | No | Preserve edits and DSH; report any partial status |
| User clicks **Retry / Re-check** | After confirmation, Manager invokes `sync --force --workspace-status` in that user's current Sandbox | **Yes**: warned local edits/matching files may be lost; Cancel does nothing | Manager verifies own READY claim/UID, dedupes attempt and records result without gating READY |
| User or agent runs manual `mgd agent-skill sync` in Sandbox | Ordinary conflict-aware sync | No | Does not update Manager's last-run annotations |
| User or agent runs manual `mgd agent-skill sync --force` | Explicit force | No additional confirmation | Does not update Manager last-run annotations |

The dialog must be accessible, actionable and only trigger Manager exec when confirmed. Never use a GET-only status refresh as a retry. For detailed failure/partial, scan-recovery and permission semantics, see the [sync design](./local-agent-skill-sync.md). The new authenticated Retry endpoint, button and confirmation belong to #3857, **not** Stage #3855; #3855 retains existing Manager exec/status/CAS foundations.

**Workspace skill-sync feedback (Stage #3855 foundation, #3857 retry UI):** Essential Workspace startup launches DSH even if some/all publication/installation sync fails. The MAGDA Open Workspace Settings page shows a non-blocking banner/status above embedded DSH, reporting `success`, `partial`, `failed` or `notAttempted`, aggregate counts and sanitized errors. For Registry/Storage/OPA outage, display a failed sync without blocking DSH access or mistaking failure for an empty, successful manifest. **Accepted #3857 UX:** after `partial` or `failed`, show a visible **Retry / Re-check skill sync** action with in-progress/disabled and result feedback, retaining DSH/Workspace READY. This is an authenticated Manager-initiated **new sync attempt inside the current user's Sandbox**, not a GET-only status refresh: after user confirmation, Manager invokes `mgd agent-skill sync --force --workspace-status` in the Sandbox, parses/validates the result and updates the Manager-owned SandboxClaim status/counts using existing claim-UID/state checks. The action must verify `agentWorkspace/access` and the caller's own claim, serialize/dedupe against automatic/manual Manager sync and claim deletion, and never allow arbitrary pod targeting or caller-reported success. A manual CLI sync **inside the Workspace** can update skill files independently but need not update the Manager's last-run summary; clicking confirmed Retry starts a Manager-controlled forced sync attempt to refresh it. A CLI sync on an unrelated local computer must **never** update the Workspace summary. `notAttempted` may display progress and optionally an explicit retry if the first attempt was interrupted; no new Workspace-READY gate, forced restart, or admin JWT for downloads. Stage #3855 keeps existing `syncSkills(podName)`, claim CAS annotations and status schema usable by #3857, but **does not need to build the new user endpoint/UI now**; no Stage-2 expansion solely for this later button.

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

## Foreground-work lifecycle contract

Draft #3850 now tracks verified running DSH foreground turns using `api-session/status` events and connection-scoped running-session snapshots, renewing activity during turns longer than 30 minutes. Merely open sockets and keepalives do not count. This implements the previously outstanding foreground-turn requirement; protocol assumptions remain pinned to the tested DSH build. See [session-lifecycle.md](./session-lifecycle.md) and the published [Agent Workspace architecture](https://github.com/magda-io/magda/blob/feat/3849-agent-workspace-mvp/docs/docs/architecture/agent-workspace.md).
