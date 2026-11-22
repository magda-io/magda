# LLM Access Profiles — Settings UI proposal

**Status:** proposed UX/API contract for [#3838](https://github.com/magda-io/magda/issues/3838) and design [PR #3932](https://github.com/magda-io/magda/pull/3932), **not implemented**. Read with the [SQL / authorization / usage design](./llm-access-profiles.md). This document is a screen and interaction specification, not a new independent permission model.

## Objectives and principles

Support a simple user workflow ("create profile, add another person's user ID, grant Use") **without requiring the operator to understand role/permission creation**. Keep the full MAGDA authorization model available for advanced operators through an explicit **Pre-authorised permissions** tab. Follow existing **Settings → Access Groups** design/navigation and accessibility conventions.

- The **three managed roles per profile** are always present: Use, View, Edit. Edit implies View (the Edit role contains the same profile Read permission); Use is independent.
- A **separate** SQL `profile_pre_authorised_permissions` table contains the three mandatory managed permission UUIDs and optional advanced custom UUIDs. Both are rendered into the **trusted OPA** `access-control.preAuthorisedPermissionIds` array.
- Do **not** show an inferred list of users or roles that "effectively" have global, ownership or orgUnit-constrained permission. That requires potentially system-wide authorization discovery, is often incomplete and risks leaking users.
- Treat LLM Services as the sole browser-facing profile/managed-grant API. Reuse Authorization API's own user/orgUnit/role lookup and authorization checks behind it. Never expose privileged Auth API role/permission mutation credentials to the browser.
- Use a fresh server decision for each action. Button disabling and hidden tabs are UX only, not authorization enforcement.
- Do not provide dynamic model/credential/LiteLLM route management in this feature. A profile model `["*"]` matches only currently served and deployment-allowed aliases.

## Navigation and access

**Settings → LLM Services** has three **top-level tabs**, with independently evaluated visibility:

| Tab | Visibility | Main purpose |
| --- | --- | --- |
| **Access Profiles** | Administrators, or users authorized to read/create/manage profiles | Search, create, and manage profiles; each profile has **General**, **Access** and **Pre-authorised permissions** tabs |
| **My Usage** | **Any authenticated user holding any `llm/access/invoke` permission** (all constraint types), or a MAGDA administrator | Own total/today/week/month usage, per-model remaining quota, daily history, **even without profile-management visibility** |
| **User Usage** | MAGDA administrators or users with an **unconstrained global `llm/access/update`** grant | Search other users and inspect their overall per-model usage history |

For **My Usage**, a user who holds an Invoke permission but currently matches **no** ready profile still sees their usage history, with "No eligible model profile" instead of quota zero. Never conflate possessing an Invoke permission with being currently eligible to invoke a model.

The Access Profiles page has a searchable table and Create Profile action. Profile detail provides General, Access, and advanced Pre-authorised permissions; **no per-profile Usage tab** because accounting is stored across all profiles on user + alias. Follow existing Settings → Access Groups navigation conventions. List/read/link visibility and counts are filtered through typed server authorization; no unauthorized deep-link access.

A separate read-only model alias summary is optional. Never expose provider Secrets or dynamic model configuration.

### Access Profiles list

| Column | Notes |
| --- | --- |
| Name | Link to profile if the caller can read/manage it |
| Owner | Display name/user ID if authorized; fallback user ID |
| OrgUnit | Human-readable name or **No orgUnit**; no implicit global access |
| Model coverage | Explicit aliases or **All available models (*)** |
| Daily / weekly / monthly limits | Compact summary; values are **per user + public model**, not total shared quota |
| Status | Enabled/Disabled; optional administrator-only provisioning/repair status |
| Actions | View/Edit/Delete only if authorized; deleting/repair state clearly shown |

Search and pagination must operate over only profiles the caller can see. Do not leak totals for hidden records. No generic SQL filtering by client-supplied owner/permission IDs without a server-side OPA decision.

### Create profile and General tab

| Field | Control | Validation / authorization |
| --- | --- | --- |
| Name | Required text field | Trim nonempty; show errors inline |
| Owner | User ID field, verified against Auth API | Defaults to creator. No free-text name as authoritative ID |
| OrgUnit | Authorized searchable dropdown + **No orgUnit** | Use trusted Auth API; show explanation of scope and nested orgUnits. Choosing null means **no orgUnit-constrained grant matches** |
| Allowed models | Multi-select of configured public aliases, or exclusive **All available models (*)** | Never mix `*` with explicit model IDs. Help text: newly deployed allowed aliases become available under `*` |
| Enabled | Toggle | New enabled profile only becomes usable after managed-role provisioning succeeds |
| Daily / weekly / monthly limits | Optional nonnegative integer fields | Each limit is **per user and per public model**. Blank/null means no limit in that period; 0 blocks new bounded requests |
| Revision | Hidden ETag/expected revision for update | A stale save returns `409`, shows "Profile changed; reload" and preserves unsaved form text for comparison |

Create may use owner/orgUnit-constrained global `llm/access/create` on the validated proposed object. When a user changes owner or orgUnit, the service applies **before-and-after** `update` decisions; an owner-scoped editor cannot give a profile to a different user without broader rights. An orgUnit move may change who matches **owner/orgUnit-scoped invocation policies**; show a concise confirmation before saving.

Only administrator/unconstrained global update may enable a disabled profile, expand allowed models/enable `*`, raise/remove token limits, change exemption, or grant broader advanced permissions. Scope-limited editors can rename, narrow models, reduce quotas, or disable where authorized. Never allow the browser to submit role/permission UUID mappings, `state`, admin decision context or Secret values.

**OrgUnit scope help text:** "A user's orgUnit-scoped permission applies to profiles in the user's assigned orgUnit or any sub-orgUnit. Profiles with no orgUnit are not covered by orgUnit-scoped permissions. Ownership/orgUnit alone does not grant invocation: the user still needs a matching Invoke permission."

### Access tab — ordinary direct grants

Show only users assigned at least one of this profile's **three managed roles**, in a paginated grid:

| User ID / name | Use | View | Edit | Actions |
| --- | --- | --- | --- | --- |
| Authorized user display | Managed Use role | Managed Read **or Edit** role | Managed Edit role | Modify/Remove managed grants |

**Search user and grant access:**

1. Provide a searchable **user picker** for name, email or exact user ID. Use a server-mediated `GET /access-profiles/:id/user-search?q=...` lookup with minimum search length, pagination, rate limiting and minimum authorized identity fields. It must apply the caller's real Auth user-read/directory policy (or an explicitly approved limited lookup scope). Managing one profile must not silently confer unrestricted user-directory access.
2. Select an existing user, display the verified name + UUID, choose Use/View/Edit levels, and confirm. A validated **user ID-only fallback** remains available when the caller lacks directory-search rights.
3. The backend rechecks profile `llm/access/update`. Profile-scoped editors can add/remove Use/View, but assigning/revoking Edit requires admin/unconstrained global update. Edit implies View, while Use remains independent.
4. The UI reports **direct grant removed**, never guarantees the user lost all effective LLM access: another profile, owned/orgUnit policy or custom role may still allow use.

**Required note:**

> Users may also have access through profile ownership, its orgUnit scope, or custom roles and permissions configured in MAGDA Authorization. This list shows direct user grants only.

Do **not** enumerate supposed effective Authenticated Users/orgUnit role memberships or imply direct users are all authorized users. Handle missing/ambiguous search matches, validation, paging, duplicate grants and removal confirmations.

### Pre-authorised permissions tab — advanced mode

**Visibility:** The tab is shown to any user holding an **unconstrained `authObject/permission/create`** permission (or global MAGDA administrator role) who can navigate to the profile. No additional `llm/access/update` check is needed **to show the tab**. Each API action separately enforces its real profile-level, permission-object and role-specific authorization; a tab-visible user may have disabled actions.

Only **tab-created, profile-owned custom permissions** appear, excluding exactly the three system-managed permission UUIDs from `profile_managed_roles`. A permission owned by this tab belongs **exclusively to this profile**, enforced by unique permission UUID mapping; it can be assigned to multiple existing Auth roles, but cannot be linked to another profile in this version.

The data grid columns are **exactly**:

| UUID | Permission name | Operations | Actions |
| --- | --- | --- | --- |
| UUID from Auth API | Name | Read / Update / Delete / Invoke, as selected | Four-item menu |

The row **Actions** menu has **only four options**:

1. **Edit:** Show a name/description and operation picker for any nonempty subset of `read`, `update`, `delete`, `invoke`. **Do not permit changing role assignments from this view.** `create` is unavailable because a nonexistent profile cannot be matched through a pre-authorised permission ID. LLM Services checks actual caller `authObject/permission/update` on this permission plus admin/unconstrained profile update and confirms changes that widen operations already held by roles.
2. **Assign to Role:** Open a modal with a **searchable existing-role dropdown**, showing role label and UUID. Search/list only roles the caller is authorized to inspect; before assignment, require effective `authObject/role/update` on the selected role, unrestricted profile-update/admin permission, and validate the custom permission belongs here. Exclude protected system-managed roles (including the profile's three managed roles). Confirm role identity and operations.
3. **View Assigned Roles:** Open a new modal/dialog listing roles assigned this permission, with role UUID/name (subject to the caller's role-read permissions) and a **Remove** button on each row. Clicking Remove detaches this permission from **that role only** after caller-specific `authObject/role/update` authorization. It does not modify the permission definition or its profile association. A role visible but not editable gets a disabled Remove button.
4. **Delete:** Show a strong confirmation listing the permission name/UUID, its operation set and **all roles to be affected** (without exposing restricted role details). This **single logical action** must revoke its profile association, remove it from **every assigned Auth role**, and delete the underlying Auth **permission itself**. There is **no Detach option** and no separate "remove from profile" row action. Require caller `authObject/permission/delete` and effective `authObject/role/update` on **every role** as well as unrestricted profile update/admin; if any check fails, reject before any mutation. Do not delete the roles or users.

The current Auth API refuses to delete a permission still assigned to roles. The service therefore needs an **authoritative permission→all-roles reverse lookup**, potentially a focused new Auth API endpoint, rather than trusting a filtered UI list as complete. Validate rights over all role references, mark custom SQL mapping `state='deleting'` so it is immediately excluded from OPA, detach every Auth role association, recheck for remaining references, delete the permission through Auth API, verify absence and then delete the mapping. Prevent/revalidate races with concurrent role assignments. If an Auth call fails after mapping revocation, retain the permission UUID for idempotent **Cleanup needed** recovery and **never report success early**.

**Create permission** is a standalone page action above the grid, not a row menu item: enter name/description and select `read`, `update`, `delete` or `invoke` operations. LLM Services creates the permission with `resourceUri="llm/access"`, `preAuthorisedConstraint=true`, no owner/orgUnit constraint and no exemption, and registers its exclusively owned SQL link. The actual caller must have the tab's unconstrained permission-create grant plus unrestricted profile-update/admin authority. **Role assignments are separate through Assign to Role**, never in the Edit dialog. No pre-authorised `create` operation is offered.

When the owning profile itself is deleted, apply this same full Delete cleanup to each of its custom permissions; do not leave externally assigned orphan permissions. Unrelated Auth roles remain, only their association to the now-deleted permission is removed. Failure leaves the profile disabled/deleting and retains enough UUIDs for repair.

### Usage tab

Expose a personal usage summary where appropriate; only administrators or callers with **unconstrained global profile update** may see other users' per-alias usage rows. Ordinary scoped profile managers must not see other users' **cross-profile** activity merely because they manage one profile: the SQL usage ledger is keyed by **user + public model alias**, not profile.

Show selected public model, date window (Today / ISO week / calendar month), measured input tokens, measured output tokens, estimated tokens/requests, displayed total, and this profile's applicable daily/weekly/monthly limit. Explain that a user may have accessed the same model via more than one profile and the usage is **shared across eligible profiles**; never label it "tokens consumed by this profile". Timezone label defaults to **Australia/Sydney** (Helm-configurable); a request is attributed to its **local start date**.

No dollar-cost estimate or billing-grade guarantee. For absent provider final usage, estimates remain marked, not exact zero. There is no quota reset/mid-stream cutoff button in this proposal.

## API operations and consistency

All calls below are **proposed**, relative to `/api/v0/llm`; the core specification defines server authorization. Use normal MAGDA session auth, not browser-held privileged Auth API credentials.

| User action | HTTP API | Server checks |
| --- | --- | --- |
| List/create/read/edit/delete profile | `GET/POST /access-profiles`, `GET/PUT/DELETE /access-profiles/:id` | Per-record typed OPA; proposed state for create/update; `revision` precondition |
| List direct users | `GET /access-profiles/:id/users` | Typed `update`; paginated; only three managed-role memberships |
| Add / replace / revoke user's managed access | `POST/PUT/DELETE /access-profiles/:id/users/:userId` | Typed `update`; Edit assignment/removal needs unconstrained/admin; only managed-role assignment changes |
| List advanced permissions | `GET /access-profiles/:id/pre-authorised-permissions` | Admin/unconstrained profile `update`; exclude managed three |
| Create and link advanced permission | `POST /access-profiles/:id/pre-authorised-permissions` | Advanced profile right **and** caller `authObject/permission/create`; validate ops/resource/constraint flags |
| Add/remove custom permission to existing role | `POST/DELETE /access-profiles/:id/pre-authorised-permissions/:permissionId/roles/:roleId` | Advanced profile right **and** caller `authObject/role/update` on **target role**, verify mapping and no protected role |
| Detach custom permission from profile | `DELETE /access-profiles/:id/pre-authorised-permissions/:permissionId` | Advanced profile right; can't detach three managed IDs; SQL-only removal |
| Profile usage | `GET /access-profiles/:id/usage` | Personal or unrestricted administrative visibility; avoid leaking other users' cross-profile use |
| Model discovery | `GET /v1/models` | Deployment allowlist + actual eligible profile `invoke`; no profile metadata in model response |

Every action may fail with `401`/`403`, `404` without disclosing hidden profiles, `409` stale revision, `422` invalid fields/unsupported operation combinations, or `503` unavailable Auth/ledger/reconciliation. Do not optimistically claim grants saved before cross-API operations confirm success.

Use `Cache-Control: private, no-store` for user-specific profile, grant, advanced-permission, usage and model-discovery responses. List and search endpoints must not expose invisible rows through counts or pagination.

## Lifecycle and accessibility

- **Pending provisioning:** show "Setting up permissions"; no Use/Advanced grant actions until all three managed roles and mandatory permission mappings are verified. Failed remote Auth API creation stays pending and needs repair, not silently marked ready.
- **Disabled:** visible to authorized managers; no model invocation, but editable fields may still be shown. Enabling requires admin/unconstrained update.
- **Deleting:** no new model use or role grants; show a non-sensitive cleanup status. Retry only after verifying the three owned managed Auth objects; custom permissions in user roles survive, with their SQL association revoked on profile removal.
- **Partial advanced creation:** if a permission is created in Auth API but SQL association or role attachment fails, show truthful partial completion and retry guidance; prevent duplicate permission creation where possible by idempotent keys/returned UUIDs.
- **Stale changes:** `409` conflict prompts reload and preserves unsaved form edits; never overwrite an unseen revision.
- **Accessibility:** all form controls have labels; role/operation selections are keyboard-operable and have explicit checked state; status is not conveyed by color alone; confirmation dialogs explain the difference between deleting a profile link, detaching from a role, and deleting a permission in Authorization.

## UI acceptance cases

1. Create a profile with owner ID and an orgUnit; the service provisions exactly three managed permissions and roles, inserts all three mandatory pre-authorised mapping rows, and shows `ready` only after successful validation.
2. Assign User A the managed Use role: that user may invoke an eligible model, but cannot enumerate all profile metadata or its members. Give User B Edit: it includes View, not Use.
3. Attempt Edit-role assignment as a profile-scoped editor: **deny** even if the button was manipulated. Use/View assignment can succeed with typed update authority.
4. Create a profile with **No orgUnit**. A user with only an orgUnit-constrained Invoke permission **cannot** use it. Matching managed/custom pre-authorised, owner or unconstrained grant still can, if otherwise eligible.
5. Parent orgUnit user with an orgUnit-constrained Invoke grant can invoke an eligible profile in their orgUnit or its child; a user only in a child cannot invoke an otherwise inaccessible parent profile.
6. With orgUnit-constrained Invoke on Authenticated Users, no per-profile direct membership is required. The Access tab still shows only managed direct grants plus the explanatory note, not a guessed orgUnit-wide user list.
7. Advanced operator with required profile/Auth rights creates a custom `read+delete+invoke` pre-authorised permission, attaches to an authorized existing role, and grants exactly those operations on the linked profile. A role holding the same permission is **not** authorized on unrelated profiles without their own mapping.
8. Advanced operator cannot choose pre-authorised Create, change the permission resource, or attach a permission to a role that they may read but **cannot update**. Calls using the LLM Services service-admin identity must not bypass this.
9. Detaching a custom permission from one profile revokes its effect **only there**, leaves it in its existing roles and other linked profiles, and never touches the three managed IDs. Detaching from a role is separate and leaves its profile link intact.
10. A user with only profile Read cannot enumerate members or see custom-role membership details. Ordinary profile editors cannot see the advanced tab. Unauthorized deep links fail server-side.
11. Daily/weekly/monthly usage uses Australia/Sydney and the request-local start day; show measured versus estimated and avoid implying per-profile attribution for the user/model ledger.
12. Missing Auth API permissions, pending/deleting states, stale revisions, failed permission creation, and an externally deleted custom permission produce safe, actionable errors without access escalation.

**Out of scope:** global role or permission editor replacement, arbitrary role creation, full effective-access enumeration, system/provider model CRUD, a new Auth DB ownership-metadata migration, billing-grade usage allocation, or a UI for creating pre-authorised **profile-create** grants.
