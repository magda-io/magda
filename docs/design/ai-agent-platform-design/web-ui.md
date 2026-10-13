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

**Settings navigation:** the existing `Agent Workspace` entry becomes a non-clickable group (the existing `SideNavigation.tsx` behavior for parents with children):

```text
Agent Workspace
  Open Workspace      /settings/agent-workspace
  Agent Skills        /settings/agent-workspace/skills
  Shared Skills       /settings/agent-workspace/shared-skills  # future #3861
```

`Open Workspace` appears if whoami includes `agentWorkspace/access` or the user has the existing administrator override; `Agent Skills` appears if whoami indicates `object/agentSkill/read` (including owner-scoped grant) or admin. The present children are independent; future **Shared Skills** will appear under its own permission/feature visibility independent of Workspace access. The parent is visible if any authorized child is available. **Server-side OPA remains authoritative**; visibility is merely a UI hint. Do not gate the catalogue on permission to start a Workspace.

The **Agent Skills** page is a **paginated, primarily read-only catalogue and learning surface**, not a general skill creator/editor. It shows authorized **READY** Registry records carrying the `agent-skill` aspect (system + own user skills) with a scope filter (All / My Skills / System Skills), optional search and skill ID, name, description, createdAt/by, updatedAt/by and scope. `createdBy` and `updatedBy` are user UUIDs. Registry values are derived from the published archive's `SKILL.md` (apart from owner/actor/timestamps/ID), not editable here.

- **System skills:** view general metadata only; no system ZIP download/upload in this UI, even for admin.
- **User skills:** download their published ZIP through an **Agent Services** endpoint that proxies the authenticated Storage API response; replace the **ZIP of an existing owned skill** with the same authenticated Agent Services validation/publish endpoint used by `mgd`. All catalogue metadata reads use Agent Services -> Registry API. **Agent Services additionally checks `object/agentSkill/read` using each existing skill's Registry-fetched `scope`/owner before download/metadata return, and `object/agentSkill/update` before ZIP replacement.** Registry and Storage APIs also enforce their normal downstream OPA. Description/updatedAt/updatedBy automatically refresh; the deterministic record ID, **skill name**, owner, createdAt and createdBy are immutable. Replacements with a different SKILL.md name are rejected. Published system names must start with `system-`; user names may not. No uploading a ZIP to **create** a new skill, delete button or general metadata editor.
- Accessible loading/empty/error/retry/pagination states; no file explorer editing or DSH session management on this page.
- After successful replacement: **“Your skill has been updated. To use the latest copy in a running Workspace, ask your agent to resynchronise your skills, or run `mgd agent-skill sync` within Agent Workspace.”**

Prominently explain the difference between durable reusable skills and disposable conversation histories, and direct users to **ask the agent to capture a successful procedure**, with a concrete example:

> “We just cleaned up a CSV with inconsistent column headings and produced a file using consistent names. I regularly receive similar CSVs from different teams. Can you capture the approach we used—matching equivalent columns, handling ambiguous headings, and checking the output—as a reusable skill for future files?”

Link to **Open Workspace** for users with access; do not show a dead action when they lack `agentWorkspace/access`. The catalogue should visibly teach the feature even for users who are not authorized to run a Workspace yet.

**Agent-led authoring remains the primary workflow:** the user asks DSH to create/update/delete a skill, guided by the immutable `capture-workflow` runtime skill and `mgd agent-skill` commands. Local `SKILL.md` drafts can be reviewed in DSH's existing read-only file explorer or via the agent. Local Bash edits are not published. The agent requests explicit approval before publishing; the prompt suffix occasionally suggests capture after substantial repeatable work. Published skills survive Workspace deletion and sync after claim/bootstrap. See [skills.md](./skills.md), #3854–#3857, #3858 and future sharing #3861.


### Future Shared Skills page (#3861 — separate feature)

The third Settings child is **Shared Skills** (preferred to Skill Marketplace, because it describes access without implying purchasing). Explain that another user's shared publication remains owned/updated by its publisher; **discovering** a skill does not install it, and **installing** creates a lightweight recipient-owned Registry record, not a ZIP copy. Installation can be revoked when source read permission is withdrawn.

- **All available** (default): paginated and keyword-searchable READY skills published by *other users* and explicitly shared with the current user. Show publisher, name, description, installed status, and **Install** action.
- **Installed**: paginated recipient-owned `agent-skill-installation` records, resolved source status and **Uninstall** action. If the source is gone/revoked, do not run it; permit uninstall and display a useful explanation.
- When installing, detect same-name conflicts with the recipient's own publications, prior installations, reserved runtime names and system prefix. Prompt the user to nominate a valid alias. Installation's effective name / ID must remain unique within the recipient namespace. Installation does not permit editing the original ZIP. An alias changes only the **locally extracted** SKILL.md used by DSH after verifying the original source ZIP.
- If a Workspace is active, explain that the new installation/removal will appear on the next sync, or ask the agent to run `mgd agent-skill sync`; do not promise automatic sync without implementation.
- Keep Server-side Agent Services, Registry/Storage and OPA authorization separate from menu visibility. Feature #3861 owns this screen, associated share/install APIs and policy. Existing #3857 implements only the first two children but should not hardcode a two-child group.

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
