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

### My Usage tab — personal quota and history

This is a **top-level Settings → LLM Services → My Usage** tab, **not** a profile-specific Usage tab. Show it to every authenticated user who has **any** `llm/access/invoke` permission (whether unconstrained, owner, orgUnit, combined or pre-authorised), plus MAGDA administrators. A permission need not currently match a ready profile for the tab to be visible. The endpoint derives the user UUID from the trusted authenticated session; no arbitrary user ID may be supplied.

Display:

| Section | Content |
| --- | --- |
| **Total usage** | All tracked tokens since accounting began; if historical rows are purged, label the period explicitly as **Tracked since DATE** |
| **Today** | Current local-day measured + estimated tokens |
| **This week** | Current ISO Monday–Sunday token usage |
| **This month** | Current calendar-month token usage |
| **Remaining quota** | **Per public model alias**, eligible profile allowances and effective **approximate** amount remaining until soft cutoff; show Unlimited / Exhausted / No eligible model profile separately |
| **Daily usage history** | Paginated daily rows, sortable by date and filterable by model/range: local date, model alias, measured input, measured output, estimated tokens, total |

A profile gives a user/model independent daily/weekly/monthly quotas. To compute remaining for one profile: subtract consumed tokens in each period from that profile's applicable limit (negative values clamped to zero); **take the minimum of the non-null remaining limits**. A null limit is unlimited. When several **fully eligible** profiles grant this model, take the **maximum** across those complete-profile remaining results, not sums or mixing one profile's daily limit with another's monthly limit (OR/non-stacking). No eligible profile means **No eligible model profile**, even if an Invoke permission exists. Administrators may be **Unlimited**, subject to deployment model allowlist.

Always show the configured IANA timezone (default `Australia/Sydney`) and mark measured versus estimated tokens. Usage is per **user + public alias across all profiles**, and remaining quota is only a **soft admission indication**: concurrent requests/overshoot, window reset and subsequent provider accounting can change it.

### User Usage tab — other users' accounting

This is a separate **top-level Settings → LLM Services → User Usage** tab, shown only to MAGDA administrators or operators with **unconstrained global `llm/access/update`**. It is not part of a profile's General/Access view. Ordinary profile-scoped editors cannot see other users' global per-alias accounting.

Authorized operators may search/filter by user ID, permitted display name/email, public model alias and date range; select a user and see Total, Today, This week, This month, measured vs estimated, effective remaining quota where evaluable, and a **daily usage history** grid. Directory search must respect the caller's actual user-read policy. The table makes clear that the ledger **may include requests authorized through several different profiles**, not just the one the operator happens to manage.

Both tabs use server-side pagination, non-cacheable session-bound responses and no leaked user identities. Provide loading/no-data/error states, per-alias selector and usage-history download only if separately authorized; no billing-grade dollar accounting or "reset quota" UI is proposed.

## API operations and consistency

All routes below are **proposed** and relative to `/api/v0/llm`. LLM Services is the browser-facing entry point; no privileged Authorization API credentials are exposed to the UI.

| UI action | Proposed HTTP API | Authorization and behaviour |
| --- | --- | --- |
| Access Profiles list/create/open/update/delete | `GET/POST /access-profiles`; `GET/PUT/DELETE /access-profiles/:id` | Typed per-profile OPA, owner/orgUnit constraints, revision/ETag; full managed/custom cleanup on profile delete |
| Direct Access member list | `GET /access-profiles/:id/users` | Profile `update`; only managed role assignments, server paging |
| **Search users** for Access tab | `GET /access-profiles/:id/user-search?q=...` | Profile `update` + real caller filtered user-read/directory permission; minimal data, limited/rate-limited search |
| Add/modify/remove direct user's grants | `POST/PUT/DELETE /access-profiles/:id/users/:userId` | Profile `update`, unrestricted/admin if touching Edit; only three managed roles |
| List tab-managed custom permissions | `GET /access-profiles/:id/pre-authorised-permissions` | Visibility gate: **unconstrained `authObject/permission/create`**, exclude managed three; selected profile page access |
| Create custom permission | `POST /access-profiles/:id/pre-authorised-permissions` | Unconstrained Auth create **and** unrestricted profile update/admin; only `read/update/delete/invoke` |
| **Edit** permission | `PUT /access-profiles/:id/pre-authorised-permissions/:permissionId` | Auth `permission/update` and unrestricted profile-update/admin; no role assignment mutation |
| **Assign to Role** | `POST /access-profiles/:id/pre-authorised-permissions/:permissionId/roles` | Auth `role/update` on selected existing non-protected role; unrestricted profile-update/admin |
| **View Assigned Roles** | `GET /access-profiles/:id/pre-authorised-permissions/:permissionId/roles` | Complete trusted reverse-role lookup, with displayed metadata filtered by caller's Auth role-read rights |
| Remove from one role in modal | `DELETE /access-profiles/:id/pre-authorised-permissions/:permissionId/roles/:roleId` | Auth `role/update` on target role, unrestricted profile-update/admin; no permission delete |
| **Delete** custom permission | `DELETE /access-profiles/:id/pre-authorised-permissions/:permissionId` | Unrestricted profile-update/admin + Auth `permission/delete` + Auth `role/update` on **every assigned role**, checked **before any side effect**; mark SQL mapping deleting, remove all role links, delete Auth permission, then delete mapping |
| **My Usage** summary/history | `GET /usage/me`; `GET /usage/me/daily` | Authenticated global admin or **any caller held `llm/access/invoke` permission**; only current session user UUID |
| **User Usage** summary/history | `GET /usage/users`; `GET /usage/users/:userId/daily` | Global admin or **unconstrained global `llm/access/update`**, plus caller-authorized directory lookup |
| Effective available models | `GET /v1/models` | Deployment-available alias + eligible full OPA Invoke authorization |

Only the four menu items **Edit**, **Assign to Role**, **View Assigned Roles**, **Delete** appear on custom rows. Creating a custom permission is a standalone page action. No Detach action exists. Never delete managed pre-authorised permission UUIDs from this tab, never delete roles or users, and never use an incomplete UI role list for a permission's global deletion.

The current Auth API refuses permission deletion while assigned to roles. For full and reliable deletion, add or reuse an authoritative **permission→roles** reverse-lookup and safe role-unassign facility behind the trusted Auth API boundary. The list shown to the operator must respect role visibility, but deletion preflight requires **every** actual assignment. Permission deletion may require a dedicated Auth API transactional/serialized operation to prevent concurrent assignments.

Requests may return `401`/`403`, non-leaking `404`, `409` on revision or concurrent cleanup conflicts, `422` for unsupported operations/role selection, or `503` for unavailable Auth/usage/reconciliation. A partially completed delete must be shown as **Cleanup needed**, not success; SQL custom mapping `deleting` is excluded from OPA pre-authorised IDs until reconciliation. Enforce `Cache-Control: private, no-store` on user-specific or permission-specific results.

## Lifecycle and accessibility

- **Pending profile:** show "Setting up permissions"; no direct or custom grant mutation until mandatory three managed role/permission pairs and mappings are ready.
- **Custom permission Deleting:** stop authorizing immediately by excluding its SQL mapping from trusted OPA context; preserve UUID and all cleanup progress until the last Auth role association and permission are removed. Show retry/reconcile status without exposing protected role names to unauthorized callers.
- **Deleting profile:** disable invoke first; clean **all** three managed roles/permissions and **all tab-owned custom permissions** (including their role assignments) before deleting SQL records. If cleanup fails, keep profile Deleting, not a falsely successful deletion.
- **Disabled profile:** managers can view status, but no Invoke; enabling requires admin/unconstrained update.
- **Stale changes:** `409` on concurrent mutation prompts reload, preserves form edits and does not silently overwrite.
- **Search users:** handle no search rights, no matches, multiple names, rate limits, and filtered results. Manual user ID entry remains possible where directory search is not permitted.
- **Accessibility:** labeled search fields and controls, keyboard-operable selectable rows, visible modal headings, focus restoration after close, actionable error text, statuses not conveyed by color alone. Delete confirmation states it affects **every role assignment and the permission**, not just a profile link. The Roles modal Remove button acts on **one role only**.

## UI acceptance cases

1. Access Profiles list respects per-profile OPA read; direct user grant UI adds Use/View/Edit by user ID, with Edit implying View but not Use.
2. **User search:** authorized profile manager can search a name/email/ID, select a unique verified user and grant Use; no ability to dump unrestricted user directory. Denied directory search still permits validated UUID entry where authorized.
3. An ordinary scoped editor can grant/revoke Use or View, not Edit; bypassing disabled UI controls via direct HTTP is rejected.
4. A user holding **any** real `llm/access/invoke` permission sees **My Usage** even if the permission does not currently match a ready profile; no profile management visibility is required. Page derives own ID from session and shows "No eligible model profile" instead of zero budget when none match.
5. My Usage shows Total (or explicitly "Tracked since"), Today, ISO Week, Calendar Month, **per-alias effective remaining** and a paginated **daily usage history** with measured/estimated columns and Sydney timezone.
6. Multiple eligible profiles use OR/non-stacking remaining: per-profile minimum of bounded daily/weekly/monthly remaining, then maximum across profiles; unlimited and exhausted are distinct. No exact-reservation/billing promises.
7. **User Usage** is a separate top-level tab; admins/unconstrained global profile managers can find and inspect other users' totals/daily history. A scoped editor or use-only user cannot access it even by deep link.
8. Advanced-tab visibility uses **unconstrained `authObject/permission/create` only** (plus profile page access). A tab-visible user lacking specific Auth permission-update/delete or target-role-update authority cannot carry out those actions.
9. The custom permissions grid contains **UUID / Permission name / Operations / Actions**, excludes exact three system-managed IDs and shows only tab-owned custom permission IDs.
10. **Edit** changes name/description/selected `read/update/delete/invoke` operations but does not allow changing role assignment; pre-authorised Create is absent.
11. **Assign to Role** uses an authorized existing-role dropdown and confirms role UUID/operations; a role the operator can read but not update cannot be assigned, nor can a protected managed role.
12. **View Assigned Roles** modal lists permitted role details with a per-row Remove button. Removing permission from Role A does not change its association with Role B or the owning profile.
13. **Delete** preflights Auth permission-delete and update-on-**every** assigned role. If any role is blocked, nothing changes. Otherwise Delete marks mapping `deleting`, removes all role assignments, deletes Auth permission, then SQL mapping. User sees success only when both Auth object and link are gone; no detached permission survives.
14. Deletion interrupted halfway remains non-authorizing, retains custom permission UUID and reports **Cleanup needed**; retries clean remaining role links before final deletion.
15. The same custom permission UUID cannot be attached to another profile; assigning it to many authorized roles remains supported. Deleting its owner profile cleans custom permission and role links, without deleting the roles or users.
16. Null profile orgUnit never matches orgUnit-constrained Invoke. A parent-orgUnit caller with matching grant can invoke a child profile, not the reverse; cross-orgUnit custom pre-authorised grants remain valid.
17. A user with only profile Read cannot list direct users or advanced role memberships; no inferred "Policy-based access" users list is shown.
18. Missing Auth API permissions, stale revisions, role changes during Delete, partial creation, invalid tab permissions and unsupported provider metering remain safe, logged and fail-closed.

**Out of scope:** generic permission/role administrator replacement, new role creation in this tab, cross-profile custom permission sharing, effective-role/user enumeration, system-model CRUD, dollar billing, and pre-authorised Create.
