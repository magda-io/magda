# PostgreSQL-backed LLM Access Profiles and soft usage limits

**Status:** Proposed MAGDA v8 design for [#3838](https://github.com/magda-io/magda/issues/3838), **not implemented**. The [LiteLLM/DSH metering PoC #3934](https://github.com/magda-io/magda/issues/3934), documented in [draft PR #3936](https://github.com/magda-io/magda/pull/3936), provides **positive, provider-specific feasibility evidence** for this approach (see below), not a production metering implementation. No v8 release or production deployment exists, so no released-user migration is required.
**Existing implementation:** [LLM Services](../../docs/architecture/llm-services.md), [Workspace security](../../docs/architecture/agent-workspace-security.md) and [deployment](../../docs/agent-workspace-deployment.md).
**Owner:** MAGDA LLM Services; neither Registry nor LiteLLM manages these profiles.


## Decision and rationale: SQL, not Registry records

Store **both access profiles and usage aggregates** in an LLM Services-owned `llm_services` PostgreSQL schema on the **existing Authorization PostgreSQL instance**. Use a dedicated least-privilege login/Secret. The Authorization API, not this schema, owns resources, operations, roles, permissions and user-role assignments; LLM Services calls its **public/trusted service APIs**, never its SQL tables. No new PostgreSQL server, Redis or LiteLLM virtual-key/spend DB is required.

A profile is a small administrative access policy, not a discoverable/federated Registry record. No `llm-access-profile-details` Registry aspect, Registry record or generic `object/record/*` grant is introduced. LLM Services is the only supported profile CRUD/validation surface. We lose Registry event sourcing/partial-evaluation filtering; LLM Services must provide authorization, operational logs and SQL migration/backup ownership. SQL updates and remote Authorization API calls are **not an atomic transaction**.

### Simplification compared with the earlier proposal

- **One shared authorization resource** `llm/access`, with seeded operations `create`, `read`, `update`, `delete` and `invoke`. Do **not** create `llm/access/<profile-id>` resources or per-profile operation URIs.
- **Three automatically managed role/permission pairs per profile** (invoke, read, update), stored in `profile_managed_roles` for the ordinary user-grant workflow. All three permissions have `preAuthorisedConstraint=true` on resource `llm/access`.
- **Retain `profile_pre_authorised_permissions`** for both the three managed permission IDs and optional **profile-owned custom permission IDs** created exclusively through that profile's advanced UI. Enforce unique permission ownership across profiles; a custom permission may be attached to multiple roles but never another profile. LLM Services projects all linked IDs into trusted OPA `access-control.preAuthorisedPermissionIds`, without duplicating user-role membership.
- **No special non-admin wildcard invocation operation** (`llm/access/*/access`). A normal profile with `allowed_models=['*']` and nullable/unlimited ceilings allows administrators to grant unrestricted *profile* use to selected users, always subject to the deployment allowlist. MAGDA's existing global OPA administrator override remains.
- **Model routing stays operator-owned via Helm/Secrets**, not in a new database-backed model catalogue. The existing bundled LiteLLM chart currently configures one alias; multi-model Helm support can be a separate deployment improvement. Neither a SQL model list nor the profile `'*'` wildcard provisions credentials, endpoints or LiteLLM routes.
- **Constrained invocation grants are supported:** owner/orgUnit/unconstrained grants can cover eligible profiles without direct user grants. The orgUnit test is MAGDA's existing `profile.orgUnitId in input.user.managingOrgUnitIds` (the caller's orgUnit plus its descendants); null profile orgUnit never matches. Cross-orgUnit access can use explicit pre-authorised mappings; no `audienceOrgUnitId` column.
- Retain the lightweight `revision` optimistic-concurrency column, `pending/ready/deleting` recovery state and **one daily usage aggregate table**. No request log, reservations, weekly/monthly tables or billing accounting is required.

MAGDA's [Access Group architecture](../../docs/architecture/access-groups.md), [user guide](../../docs/access-groups.md) and [ADR 0012](../../docs/adrs/0012-typed-access-group-authorisation.md) establish the auto-managed role and typed ownership/pre-authorised pattern. The [Registry feature guide](../../docs/architecture/Guide%20to%20Magda%20Internals.md#building-features-on-registry-records) supports the feature-service ownership principle, not a requirement that these SQL-only profiles have Registry aspects.

### Boundaries

```text
Authenticated MAGDA API client or Workspace/DSH
 -> MAGDA Gateway (verified Magda session)
 -> MAGDA LLM Services
      - validates profile management and per-request model entitlement using Auth API/OPA
      - reads LLM-owned profile SQL, managed-role IDs and daily usage counters
      - applies deployment model allowlist and model-specific soft quotas
      - forwards OpenAI-compatible requests through private LiteLLM
      - observes response usage without changing stream bytes
 -> private LiteLLM -> configured model provider

Existing Authorization API: shared llm/access resource and operations,
    profile-owned role/permission records, all user-role assignments
SQL llm_services schema: profile data, three managed role/permission pairs,
    profile-to-pre-authorised permission UUID links (managed + custom),
    one daily usage row per (user, public model alias, local accounting date)
```

Workspace lifecycle/runtime still requires self-only `agentWorkspace/access`; independent LLM clients need a model entitlement, **not** Workspace access. Provider Secrets stay private to LiteLLM. The operator-controlled Helm `llm-services.allowedModels` is an outer safety/availability restriction, including for administrators; model profile membership is an additional permission check for non-admins.

### Profile model wildcard and deployment catalogue

Accept either a list of distinct, nonblank exact public aliases such as `["model-a", "model-b"]` **or exactly** `["*"]`. Disallow mixing `"*"` with any other value, duplicates, unknown aliases (except `"*"`), empty strings or ambiguous whitespace. The model alias `"*"` in a profile is a **whole-element sentinel**, not prefix matching or an SQL wildcard. Literal model IDs must still be validated against configured deployment-allowed aliases at profile write time and checked again on invocation; profiles may become unavailable when operators remove an alias.

`["*"]` means **all aliases currently both configured/served by the backend and allowed by the deployment**; it dynamically covers newly deployed aliases without expanding the SQL array. If a backend's `/models` list is unavailable or untrusted, fail closed to known explicitly configured/validated aliases. The wildcard does **not** mean arbitrary LiteLLM/provider-supported model names, and cannot bypass the deployment-wide allowlist.

Every daily/weekly/monthly ceiling applies **separately to each requested public model alias**, including aliases matched through `"*"`; limits do not create a shared pool across models. Updating an explicit model list to `["*"]`, adding aliases, raising/removing limits, enabling an unavailable profile or altering exemption/ACL grants are widening changes: require administrator or a deliberately **unconstrained** `llm/access/update` grant, not only an owner-scoped or per-profile editor permission.

The Settings UI may display **read-only available system models** derived from the operator-managed configuration (and a verified backend list); model provider credentials and routing are not editable from the profile UI. An eventual system-model CRUD UI would require a separate dynamic provider configuration/Secrets/lifecycle design. Do not introduce a `system_models` SQL table in #3838.


## PostgreSQL schema (logical model)

The following is a **reference SQL shape**, not a shipped migration. Actual names, migrations, indexes, roles and Secrets must follow MAGDA deployment conventions.

```sql
CREATE SCHEMA llm_services;

CREATE TABLE llm_services.access_profiles (
    id UUID PRIMARY KEY,             -- generated once by LLM Services, never reused
    name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
    allowed_models TEXT[] NOT NULL CHECK (cardinality(allowed_models) > 0),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    state TEXT NOT NULL DEFAULT 'pending'
        CHECK (state IN ('pending', 'ready', 'deleting')),
    allowed_daily_tokens BIGINT CHECK (allowed_daily_tokens >= 0),
    allowed_weekly_tokens BIGINT CHECK (allowed_weekly_tokens >= 0),
    allowed_monthly_tokens BIGINT CHECK (allowed_monthly_tokens >= 0),
    owner_id UUID,
    org_unit_id UUID,
    constraint_exemption BOOLEAN NOT NULL DEFAULT FALSE,
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE llm_services.profile_managed_roles (
    profile_id UUID NOT NULL
        REFERENCES llm_services.access_profiles(id) ON DELETE CASCADE,
    access_level TEXT NOT NULL CHECK (access_level IN ('use', 'read', 'edit')),
    role_id UUID NOT NULL UNIQUE,
    permission_id UUID NOT NULL UNIQUE,
    PRIMARY KEY (profile_id, access_level)
);

-- Three mandatory system-managed permission IDs plus profile-owned
-- advanced permissions created via its Pre-authorised permissions tab.
CREATE TABLE llm_services.profile_pre_authorised_permissions (
    profile_id UUID NOT NULL
        REFERENCES llm_services.access_profiles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL UNIQUE,
    -- managed IDs are identified by joining profile_managed_roles;
    -- others are profile-owned custom permissions, with fail-closed cleanup.
    state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'deleting')),
    PRIMARY KEY (profile_id, permission_id)
);

CREATE TABLE llm_services.daily_model_usage (
    user_id UUID NOT NULL,
    model_alias TEXT NOT NULL,
    local_date DATE NOT NULL,
    measured_input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (measured_input_tokens >= 0),
    measured_output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (measured_output_tokens >= 0),
    estimated_tokens BIGINT NOT NULL DEFAULT 0 CHECK (estimated_tokens >= 0),
    estimated_requests BIGINT NOT NULL DEFAULT 0 CHECK (estimated_requests >= 0),
    PRIMARY KEY (user_id, model_alias, local_date)
);
```

- The LLM-owned `allowed_models TEXT[]` is small, validated and replaced as a unit. `["*"]` is its only wildcard form; enforce exact aliases/uniqueness in the service. There is no model catalogue table in this proposal. An optional array index can be added if actual query volume justifies it.
- `owner_id`, `org_unit_id` and `constraint_exemption` are SQL fields, **not a JSONB Registry `access-control` aspect**; LLM Services maps them to that familiar shape **only in trusted OPA input**.
- `profile_managed_roles` has exactly **three rows per ready profile**, one per managed `use/read/edit` role/permission pair. `profile_pre_authorised_permissions` holds those **same three mandatory IDs plus zero or more exclusively profile-owned custom permission IDs** created through its advanced tab. `UNIQUE(permission_id)` prevents the same custom permission from being linked to another profile; **multiple roles may still hold it**. The three managed IDs are classified by joining to `profile_managed_roles`; every additional linked ID is owned by the profile's advanced-tab lifecycle. Do not accept an arbitrary external permission ID or shared cross-profile mapping through this UI. Verify Auth API permissions independently, never cross-schema FK/write. Fail a profile's readiness check if any of its mandatory managed links is missing.
- For each profile, create three permissions on **shared `llm/access`** with exact operation URIs: `use -> llm/access/invoke`, `read -> llm/access/read`, `edit -> llm/access/update`. Each has `preAuthorisedConstraint=true`, `userOwnershipConstraint=false`, `orgUnitOwnershipConstraint=false`. Create three managed roles; the **edit role** contains both the profile's `edit` and `read` permission IDs so editors can open the profile UI. The `use` role only invokes, and the `read` role only views. A user can hold more than one role. LLM Services checks exact role/permission ownership before any assignment or cleanup; names/descriptions are informational, not proof of ownership.
- A `profile_managed_roles` row alone never grants access. The caller must hold a matching managed or custom permission through an Auth API role assignment. A mapped pre-authorised ID never grants access by itself: a real caller permission must match **the same ID, resource, requested operation and `preAuthorisedConstraint=true`**. Normal profile CRUD never accepts client-supplied permission/role IDs; the advanced tab creates a new uniquely owned permission through Auth API and manages its lifecycle. No user-role membership table is duplicated in LLM SQL.
- `state` is service-owned: `enabled=true AND state='ready'` is necessary for invocation. `revision` is a cheap optimistic concurrency token; a stale `If-Match`/expected version gets `409`. Never hold a SQL lock across a slow external OPA/Auth API call; re-check the version and permission-sensitive before/after state at commit. There is **no** broad SQL transaction spanning the Authorization API.
- Null token ceilings mean unlimited for that period **inside an otherwise entitled profile**; zero means no new bounded non-admin request is admitted for that period. `measured_input_tokens + measured_output_tokens + estimated_tokens` is the usage figure checked against each configured ceiling. Guard integer overflow and double settlement.
- The profile `owner_id` and `org_unit_id` are scope attributes for **both management and invocation** when the caller separately holds a matching owner-/orgUnit-constrained operation permission. Owning or belonging to a profile's orgUnit **without the matching `invoke` grant does not** confer model access. A null `org_unit_id` does not match orgUnit-constrained grants. A pre-authorised permission can bridge unrelated orgUnit structures; no separate audience column is required. The existing global administrator override remains.

### Mapping to the former Registry-shaped contract

| Former field/concept | SQL storage and decision representation |
| --- | --- |
| Profile ID, name, models, enabled, daily/weekly/monthly caps | Columns in `access_profiles` |
| `access-control.ownerId` | `access_profiles.owner_id`, projected to OPA `access-control.ownerId` |
| `access-control.orgUnitId` | `access_profiles.org_unit_id`, projected to OPA `access-control.orgUnitId` |
| `access-control.constraintExemption` | `access_profiles.constraint_exemption`, projected to OPA `access-control.constraintExemption` |
| `access-control.preAuthorisedPermissionIds` | All IDs from `profile_pre_authorised_permissions`: three mandatory managed UUIDs plus exclusively profile-owned custom UUIDs, projected into trusted OPA `access-control.preAuthorisedPermissionIds` |
| Per-profile user grants | Three managed roles and their Authorization API `user_roles` assignments; custom permissions may be assigned to multiple existing authorized roles but belong to one profile; **no duplicate user membership table** |
| Model availability/routing | Existing Helm/private LiteLLM configuration, **not** the profile table |

### Deployment and migration ownership

Co-locate the `llm_services` schema on the existing Authorization PostgreSQL instance with a separate least-privilege login and Secret. Prefer MAGDA's existing Authorization DB migrator mechanism with an **explicitly labelled LLM-owned migration** rather than new PostgreSQL infrastructure. Coordinate schema creation, backup/restore, upgrade safety and Secret wiring. Auth API application SQL credentials must not become the LLM SQL credentials and vice versa. Use Auth API service endpoints for its own objects, never cross-schema SQL writes.

For read/list requests LLM Services selects SQL candidate rows and performs **full typed OPA decisions with each trusted profile object**; do not assume users with invoke grants may enumerate profiles or all user memberships. The Admin UI should paginate access-list/member results and fetch personal details via authorized, trusted Auth API endpoints rather than a direct SQL join into the Authorization tables.


## Authorization contract and constraint equivalence

### One typed resource and trusted OPA context

Seed **one** shared Authorization API resource `llm/access` with operations `llm/access/create`, `llm/access/read`, `llm/access/update`, `llm/access/delete` and `llm/access/invoke`. Add an LLM-specific OPA entrypoint delegate for `startswith(input.operationUri, "llm/access/")`. No per-profile Auth API resources/operations: typed decisions scope a shared operation using **trusted per-profile data**, caller permissions and the request operation.

LLM Services verifies the session and fetches the profile, managed-role permission IDs and custom pre-authorised links from SQL. It constructs the **Registry-like `access-control` shape only as trusted OPA input**; no Registry aspect or JSONB column is introduced. The Authorization API, not the caller-supplied payload, fills in the authenticated user, actual roles, orgUnit scope and permissions:

```json
{
  "object": {
    "llmAccessProfile": {
      "id": "<profile UUID from SQL>",
      "allowedModels": ["*"],
      "enabled": true,
      "access-control": {
        "ownerId": "<owner UUID or null>",
        "orgUnitId": "<orgUnit UUID or null>",
        "preAuthorisedPermissionIds": [
          "<managed use permission UUID>",
          "<managed read permission UUID>",
          "<managed edit permission UUID>",
          "<optional advanced custom permission UUID>"
        ],
        "constraintExemption": false
      }
    }
  }
}
```

The array is projected from **active** rows of `profile_pre_authorised_permissions`, **not just three**; `state='deleting'` permissions are excluded immediately from OPA decisions. Exactly three links must point to the three pre-authorised permissions in `profile_managed_roles` for a ready profile; advanced custom links are optional. Every UUID must refer to a real Authorization API permission or be ignored/fail closed for its own match. Client input cannot override SQL fields, this array or the caller identity.

### MAGDA-compatible scope semantics for all operations

For each requested operation, assess a **single caller permission** for the exact shared `llm/access` resource and exact requested operation. Supported alternatives for non-admins are:

| Grant type | Test against trusted profile context |
| --- | --- |
| Unconstrained | Caller has the operation on `llm/access` with **no** owner, orgUnit or pre-authorised flags set. Applies to any existing eligible profile |
| Owner-constrained | Matching permission has `userOwnershipConstraint=true` and `preAuthorisedConstraint=false`; profile `ownerId == input.user.id` |
| OrgUnit-constrained | Matching permission has `orgUnitOwnershipConstraint=true` and `preAuthorisedConstraint=false`; profile `orgUnitId` is non-null **and** `orgUnitId in input.user.managingOrgUnitIds` |
| Combined owner + orgUnit | Both flags on **the same permission**; both tests must pass |
| Pre-authorised | Matching permission has `preAuthorisedConstraint=true`, no owner/orgUnit flags, and **its own permission UUID** is in the profile's `preAuthorisedPermissionIds`. The caller must hold the permission through an Auth API role/grant |
| Exemption (management only) | Profile `constraintExemption=true` **and** a matching management-operation grant permits `allowExemption=true`. Never grant invocation solely because of exemption |

The **orgUnit rule is exactly the existing MAGDA resource-scope rule**, not a new "users in the profile's department" audience rule: `input.user.managingOrgUnitIds` is populated by the Auth API with the **caller's orgUnit and descendants**. A user assigned to a parent orgUnit can have a matching orgUnit-constrained permission over a profile assigned to its child orgUnit. A user assigned only to a child orgUnit does **not** thereby reach a profile assigned to its parent. An access profile with **`orgUnitId=null` never matches an orgUnit-constrained grant**; it can still match another authorized path (e.g. explicit pre-authorised user/role grant or administrator). Do not inherit generic Registry's null-orgUnit read fallback.

`ownerId` and `orgUnitId` have the **same scope meaning for profile management and invocation**. No separate `audienceOrgUnitId` is needed. Assign pre-authorised permissions to a custom role to share a profile across unrelated orgUnit branches. **Belonging to an orgUnit or owning a profile is not sufficient without a matching operation permission**.

For clarity, the operation-specific contract is:

| Operation | Accepted non-admin grant types |
| --- | --- |
| `llm/access/create` | Global unconstrained, owner-constrained, orgUnit-constrained or combined constraint, evaluated on validated **proposed** profile. There is **no existing profile** whose pre-authorised ID list could authorize creation |
| `llm/access/read` | Unconstrained, owner, orgUnit, combined, pre-authorised managed/custom `read`, or matching exemption |
| `llm/access/update` | Unconstrained, owner, orgUnit, combined, pre-authorised managed/custom `update`, or matching exemption; additional field/grant elevation restrictions below |
| `llm/access/delete` | Unconstrained, owner, orgUnit, combined, **advanced custom pre-authorised `delete`**, or matching exemption. There is no managed Delete role |
| `llm/access/invoke` | **Unconstrained, owner, orgUnit, combined or managed/custom pre-authorised `invoke`**. Invocation is only considered for a **ready, enabled** profile that actually covers the requested deployment-allowed, backend-served alias and passes the full soft quota check |

For instance, an authorized administrator may add an **orgUnit-constrained `llm/access/invoke` permission** to the existing **Authenticated Users** role. Each authenticated user then invokes only those ready profiles whose `orgUnitId` is within *that user's own* assigned orgUnit + descendant scope, without being manually added to each profile's Use role. An unconstrained `invoke` permission on that role is much broader and must be treated as an intentional administrator deployment-wide access choice; it **still** requires some enabled eligible profile with remaining quota for that user/model. A profile with `orgUnitId=null` does not become available merely because a caller has an orgUnit grant.

**Global MAGDA administrators** retain the existing OPA administrator-role override and may invoke all **deployment-allowed** models without profile/quota checks. No non-admin special `llm/access/*/access` operation is introduced. The profile's `allowed_models=["*"]` sentinel controls model coverage, **not** authorization by itself.

For pre-authorised permissions, the check is **atomic on the same permission object**: `resourceUri=="llm/access"`, matching requested `operations[_].uri`, `preAuthorisedConstraint==true`, no owner/orgUnit constraint flags, and `permission.id in trusted preAuthorisedPermissionIds`. Do not use a permission ID from one grant with operation flags from another. One advanced permission may list **multiple operation URIs** (e.g. `read`, `update`, `delete`, `invoke`) and satisfy each when it is linked to the profile and held by the caller's role.

**Pre-authorised `create` is deliberately not offered.** A profile's pre-authorised array exists only *after* creation, so it cannot scope who may create that same profile. The advanced UI must exclude `create` from the pre-authorised operation picker, and validate that custom pre-authorised permissions linked to a profile have only `read/update/delete/invoke`. The administrator can grant global `llm/access/create` separately with an appropriate unconstrained, owner or orgUnit constraint. Do not silently interpret a pre-authorised `create` bit as global create authority.

The typed rule should follow [MAGDA Access Group policy](../../docs/architecture/access-groups.md) and [ADR 0012](../../docs/adrs/0012-typed-access-group-authorisation.md), including exact ownership, orgUnit, pre-authorised, combined-constraint and `allowExemption` handling. Each OPA decision is a **full evaluation** with service-fetched SQL context rather than Registry partial-evaluation filtering.

### Prevent privilege escalation through profile edits

- Check `llm/access/update` on **both the current and proposed profile** for a metadata update, including owner/orgUnit and exemptions; prevent a scoped editor from giving their scope away. Re-read the current `revision` before committing, and return `409` if concurrently modified.
- An admin or matching **unconstrained global** `llm/access/update` permission is needed for **widening model aliases** (including enabling `["*"]`), increasing/removing token ceilings, enabling or re-enabling a profile, changing `constraintExemption`, assigning/removing `edit` roles, or changing the SQL-managed role/permission mapping. A profile-scoped editor/owner can safely rename, narrow aliases/reduce caps and assign/revoke **use/read** roles within their own profile. Disabling a profile is a reduction in access.
- The profile's `ownerId` can be changed by an admin or a manager whose **before and after** constrained OPA checks both allow it. This means a user with only an owner-scoped grant cannot hand ownership to another user, while a manager scoped to two orgUnits may move a profile within their managed scope. Validate the target user/orgUnit via trusted Auth API queries.
- Client-submitted `permission_id`, `role_id`, `state` or other internal authority metadata are forbidden. LLM Services performs managed-role assignments only after authorization; no profile editor gets generic `authObject/role/update` or `authObject/user/update` from this feature.

### Managed-role ownership and direct user grants

Following the Access Group pattern, profile creation **automatically creates three role/permission pairs** on shared `llm/access`:
- The managed `use` role holds the profile's pre-authorised `llm/access/invoke` permission.
- The managed `read` role holds its pre-authorised `llm/access/read` permission.
- The managed `edit` role holds **both the profile's pre-authorised `llm/access/update` AND `llm/access/read` permissions** (reusing the exact same read UUID from the managed read role). Edit implies View; Use is independent.

Exactly those **three managed permission UUIDs** must be present in `profile_pre_authorised_permissions`, even when advanced permissions are also associated with the profile. The managed role/permission IDs are stored under `profile_managed_roles`; the linking table does **not** duplicate their role membership or hold user IDs. Any ready profile missing one of its three mandatory links or managed Auth objects must be reconciled before access. The managed objects are created/verified by LLM Services, with immutable ID/resource/operation ownership checks; don't rely solely on names/descriptions.

The **Access** tab uses these managed roles to list **direct user grants**. A caller with effective profile `update` may add/revoke `use` and `read` membership, including by supplying a validated user ID. Assigning/revoking the stronger `edit` role requires administrator or **unconstrained global** `llm/access/update`. Mutate only this profile's three managed roles through trusted Auth API calls, never the user's unrelated roles. Listing members requires profile update permission (read alone isn't enough), since the member list discloses other users.


### Advanced pre-authorised permissions: profile-owned custom grants

`profile_pre_authorised_permissions` remains the explicit OPA allowlist: **three mandatory managed permission UUIDs** plus zero or more **custom permissions created and owned by this profile's Pre-authorised permissions tab**. Do not offer attachment of independently created Auth permissions in this v8 UI. The SQL `UNIQUE(permission_id)` invariant prevents cross-profile ownership/sharing, while allowing a custom permission to be assigned to **multiple Auth API roles**. Custom permission ownership must be verified through its SQL mapping and the actual Auth API permission ID/resource/operations/constraints before any action; descriptions are not ownership evidence.

A custom permission can hold a nonempty subset of `llm/access/read`, `update`, `delete`, `invoke` for the **one owning profile**. For example, a custom pre-authorised permission allowing read, edit, delete and invoke can be assigned to an existing role for users who need all those rights. **Do not offer pre-authorised `create`**; a not-yet-created profile has no existing pre-authorised mapping to match against. Use a separately authorized global/owner/orgUnit-scoped `llm/access/create` grant instead.

**Tab visibility:** the only feature-specific tab-visibility check is that the caller has an **unconstrained `authObject/permission/create`** permission (or MAGDA global administrator role). Do not require `llm/access/update` just to display the tab. A user must also be permitted to reach the selected profile page; visibility **does not authorize** actions. All backend actions independently check their actual profile-level, permission-object and target-role rights. A tab-visible user without some action-specific rights sees explanatory disabled actions, not privileged data.

**Data grid:** exactly **UUID | Permission name | Operations | Actions**. List the profile's custom owned permissions, excluding the **exact three managed permission IDs** in `profile_managed_roles`. Each row's Actions menu has **only**:
- **Edit**: edit name/description and selected read/update/delete/invoke operations. **No role-assignment controls in this view**. Require effective permission-object `authObject/permission/update` plus unrestricted profile-update/admin authority because operation changes may widen access to users already holding the permission; show a confirmation for widened operations. Revalidate ownership and optimistic concurrency.
- **Assign to Role**: a dialog with a searchable dropdown of **existing roles the caller may view and update**. Show role name/UUID and custom operations; enforce the external caller's effective `authObject/role/update` on the chosen role, exclude all protected system-managed roles, and confirm that assignment grants the role's existing members the operations immediately.
- **View Assigned Roles**: modal listing **all roles currently assigned this permission**, each row with role name/UUID and a **Remove** button. The service uses a trusted **permission → role reverse lookup** returning a complete set for cleanup, but must filter/redact role details shown to the caller based on their real Auth API read rights. A role the caller cannot update has disabled Remove. Removing from a role requires actual caller's effective `authObject/role/update` and changes **only that Auth role-permission relationship**.
- **Delete**: **one single UI action**, not a detach option. Confirm the owning profile, permission UUID and all affected roles. As a fail-closed multi-step operation, first immediately revoke this permission's **profile mapping** in SQL (so its rights on the profile disappear), then remove the permission from **every role** through the Auth API, ensure no assignments remain, and delete the underlying Auth API permission. The mapping must already be revoked for access safety, and no successful deletion may be reported until the Auth permission is gone. Do not silently delete a role or user. This action requires actual caller `authObject/permission/delete` and effective `authObject/role/update` on **every assigned role**, besides the unrestricted profile-update/admin prerequisite; if any is missing, **reject deletion before modifying anything** (list blocked roles if allowed). Unlike a normal Remove-from-Role action in the roles modal, Delete is a full coordinated cleanup. The UI must not show a separate Detach action.

**Cross-service deletion and races:** The current Auth API refuses permission deletion while it is assigned to any role. Thus, the backend must discover **all** role references, not just those visible through caller-filtered role search. Existing Auth API endpoints expose role→permission views and role-specific mutation, but a full reliable **permission→roles reverse lookup** (and ideally a trusted, idempotent delete/revoke operation) may need a focused Authorization API enhancement; specify and test it rather than assuming an incomplete UI result is exhaustive. For the delete operation, validate the caller's Auth rights for **all** referenced roles and permission deletion before the first side effect, and serialize permission mutations or use revalidation to handle races. If a failure occurs after SQL revocation, keep the custom permission record in a **cleanup-needed state** or durable cleanup work record, retry idempotently with appropriate authorization, and show a truthful error. A bare SQL mapping deletion must not lose the permission UUID needed to complete cleanup. For v8, use an explicit **`state` field on the custom mapping** (`active/deleting`); projected OPA pre-authorised IDs include **only active mappings**. The permanent mapping row is removed only **after** all role links and the Auth permission have been removed. If the role set changes during cleanup, requery/revalidate before declaring success and fail closed.

**Creating custom permissions:** create permission through the Auth API with service-controlled `resourceUri="llm/access"`, `preAuthorisedConstraint=true`, both owner/orgUnit constraints false, `allowExemption=false`, name/description and allowed operations, then insert the new custom mapping as `active`. Creation requires the actual caller's **unconstrained `authObject/permission/create`**, plus unrestricted `llm/access/update` or admin scope for this profile (and on creation of any operation that can widen grants); never rely on the service-admin token to waive caller privilege checks. Initial user-role assignment is a subsequent **Assign to Role** action.

All operations are mediated by LLM Services and existing Auth API permission/role management semantics, not exposed as an unrestricted proxy in the browser. A client may not pass a role or permission it doesn't own, or manipulate the managed three. **Custom permissions are owned by one profile** and must be destroyed during profile deletion as well: clean custom links from all assigned roles and delete their Auth permissions before purging profile SQL. If a custom cleanup cannot complete, leave profile `state='deleting'` and keep cleanup work durable and non-authorizing.

### Settings → LLM Services UI contract

The detailed **[LLM Access Profiles UI design](./llm-access-profiles-ui.md)** defines the Settings screens, action menus, role selection/search, profile lifecycle and usage presentation.

At the **Settings → LLM Services** level:
- **Access Profiles:** searchable profiles, each with **General**, **Access** (simple managed Use/View/Edit grants and *search users*), and **Pre-authorised permissions** (advanced custom operations). The Access tab shows the note "Users may also have access through profile ownership, its orgUnit scope, or custom roles and permissions, depending on grants configured in MAGDA Authorization. This list shows direct user grants only." It does **not** enumerate arbitrary Authenticated Users/orgUnit roles.
- **My Usage:** shown to any authenticated caller who **holds at least one real `llm/access/invoke` permission of any supported constraint type**, whether or not it currently matches a profile. Also shown to global administrators. Displays **only the authenticated user's** tracked lifetime total and Today / This week / This month token use, eligible per-model limits and **approximate remaining quota**, plus a paginated **daily usage history**. When permissions exist but no currently eligible profile/model, show "No eligible model profile" rather than zero remaining quota.
- **User Usage:** separate restricted administrative tab for exploring **other users'** usage by user ID/search and public model alias, with aggregates and daily history. Use the existing unrestricted global profile-management/admin gate for **cross-profile** usage viewing; scoped profile editors never see other users' full model-usage ledger. Do not retain a per-profile Usage tab implying the data belongs to one profile.

On Access, user search resolves user ID/name/email through a **server-mediated, permission-aware, paginated and rate-limited** lookup with minimal user fields, followed by explicit confirmation before granting roles. Do not turn ability to manage one profile into unrestricted Auth user-directory read; enforce the caller's actual user-read policy or a separately approved limited-directory-search policy. A validated ID-entry fallback remains available when caller cannot search the directory.

**Quota display contract:** the ledger is per user and public model alias, not profile. `Total` means **all tracked usage since accounting started** (or show an explicit `since date` if rows are retained only for a shorter period). Daily, ISO Monday weekly and calendar-month rows sum by the configured IANA timezone (default Sydney). Show measured/estimated separately. For each currently eligible profile `p` and model alias, remaining for a bounded period is `max(0, limit(p,period) - consumed(user,model,period))` and null limits are unlimited; its overall remaining budget before soft cutoff is the **minimum across its configured daily/weekly/monthly remaining allowances**. Where multiple eligible profiles grant that model, show the **maximum** of these per-profile minima (OR semantics, never stacking or combining different profiles' ceilings), distinguishing unlimited from a numeric estimate. The display is an **admission threshold indication**, not an exact token-spend reservation or promise of further billable tokens; in-flight streams/soft overshoot and window resets apply.

UI/backend actions remain authenticated, session-bound and non-cacheable. User usage discovery is a separate authorization surface; never reveal other users' cross-profile usage just because their name appears in a profile's Access tab.

## Public LLM Services endpoints

Authorization operation URIs are **not** HTTP paths. All paths are relative to `/api/v0/llm` and remain proposed. The [UI contract](./llm-access-profiles-ui.md) specifies the presentation and action semantics.

| HTTP | Authorization | Result |
| --- | --- | --- |
| `POST /access-profiles`, `GET /access-profiles` | Typed `llm/access/create` on proposed row; per-profile `read` for list | Create + bootstrap three managed grants; list visible profiles only |
| `GET/PUT/DELETE /access-profiles/:id` | Typed `read/update/delete`, including current + proposed state on update | Read, update or safely delete profile |
| `GET /access-profiles/:id/users` | Profile `update` | Paginated managed Use/View/Edit direct grants only |
| `GET /access-profiles/:id/user-search?q=...` | Profile `update` **and caller-appropriate user search/read policy** | Minimal user IDs/names for assigning direct grants; bounded/filtered/rate limited, ID fallback |
| `POST/PUT/DELETE /access-profiles/:id/users/:userId` | Profile `update`; unrestricted/admin for managed Edit | Assign/remove only profile-managed roles |
| `GET /access-profiles/:id/pre-authorised-permissions` | Authenticated operator with **unconstrained `authObject/permission/create`** + profile visibility | List only **tab-created custom owned** permissions; never show the three managed IDs |
| `POST /access-profiles/:id/pre-authorised-permissions` | Unconstrained Auth permission `create` **and** unrestricted profile `update`/admin | Create and link a new exclusively profile-owned custom permission, selected `read/update/delete/invoke` subset |
| `PUT /access-profiles/:id/pre-authorised-permissions/:permissionId` | Tab visibility + unrestricted profile `update` + effective `authObject/permission/update` on permission | **Edit permission only**, never role assignments |
| `POST /access-profiles/:id/pre-authorised-permissions/:permissionId/roles` | Tab visibility + unrestricted profile `update` + effective `authObject/role/update` on chosen role | **Assign to Role** dialog, role ID from filtered selector; verify protected-role exclusion |
| `GET /access-profiles/:id/pre-authorised-permissions/:permissionId/roles` | Tab visibility + appropriately scoped Auth role-read | **View Assigned Roles** dialog; authoritative full relation set for cleanup, UI details filtered to caller's rights |
| `DELETE /access-profiles/:id/pre-authorised-permissions/:permissionId/roles/:roleId` | Tab visibility + unrestricted profile `update` + Auth `role/update` on chosen role | Remove **that role assignment only** via modal row's Remove button |
| `DELETE /access-profiles/:id/pre-authorised-permissions/:permissionId` | Tab visibility + unrestricted profile `update` + effective Auth permission `delete` **and** Auth role `update` on **every** assigned role | **Delete**: fail-closed one logical action; revoke mapping, remove *all* role references, delete permission; no separate Detach |
| `GET /usage/me` and `GET /usage/me/daily` | Authenticated global admin **or caller holds any** `llm/access/invoke` permission (any constraint, even when no eligible profile) | User's **own** lifetime/tracked, daily/weekly/monthly totals, per-model effective remaining and paginated daily history; use trusted authenticated UUID |
| `GET /usage/users` and `GET /usage/users/:userId/daily` | Global admin **or unconstrained global** profile management `llm/access/update` | **User Usage** administrative user/model search, per-user totals and daily history; must not leak users or profiles beyond authorized access |
| `GET /v1/models` | Eligible profile `llm/access/invoke` for non-admins | List currently served deployment-allowed aliases with a valid owner/orgUnit/unconstrained/pre-authorised invoke path; admins see all allowed served aliases |
| `POST /v1/chat/completions` and `POST /v1/responses` | Eligible profile `llm/access/invoke` | Forward only after matched profile and per-user/model quota evaluation; observe token usage |

For non-admins, a forwarded request requires one **same** `state='ready'`, enabled profile that covers a served, deployment-allowed alias; one actual full OPA `invoke` decision for that profile via any supported constraint mode; and the user's same-alias usage below every configured daily/weekly/monthly ceiling of **that same profile**. Eligible profiles combine as an OR, not a sum or mixing a permission from one with limits from another. Profile `orgUnitId=null` does not match orgUnit-constrained invoke. A user merely assigned a broad invoke permission still needs an eligible profile. MAGDA administrators may access deployment-allowed models without profiles or quotas.

**My Usage** visibility is intentionally a *capability navigation* test, not a claim the caller may currently invoke a model: any actual `llm/access/invoke` permission suffices. The totals and daily history remain restricted to **their own authenticated user ID**; never accept an arbitrary user ID on this endpoint. Show a clear "No eligible model profile" where an invoke permission exists but no eligible profile remains, rather than reporting "0 tokens left". Report daily/weekly/monthly token totals by public alias plus overall tracked total, and compute effective per-model remaining based on each **whole eligible profile**, taking its minimum bounded remaining across time windows, then maximum across profiles (non-stacking OR). Unlimited should be explicit. Estimates, race/in-flight overshoot and reset boundaries make remaining an indicative *soft admission budget*, never a guaranteed token quantity. History retention policy must define the exact meaning of "Total" (all-time since accounting start if no cleanup, or "tracked since DATE" if rows were pruned).

**User Usage** is a separate top-level Settings tab and endpoint, not a profile tab. Viewing other users' per-model ledger requires the existing unrestricted management/admin gate rather than merely editing any one profile: the daily counters may include **usage through multiple profiles**. Search/user-picker must respect existing user-read policy, and aggregate responses need `Cache-Control: private, no-store`.

**Pre-authorised permission deletion** must not be implemented as only an Auth permission deletion call: MAGDA's current Auth API refuses a permission deletion while any role holds it. Use authoritative reverse-role lookup (a focused Auth API addition if necessary), verify the caller has update authority over **all** affected roles and permission deletion, and process as one user-visible operation with protected `deleting` state and retry. If unable to clean all roles/permission, keep the permission UUID for repair and do not show success. A custom permission must belong to **exactly one profile**, and deleting it cannot affect other profiles.

All model discovery, profile, user-search, advanced, and usage responses are user-specific and must use `Cache-Control: private, no-store`, safe errors and no leaked protected identities, provider Secrets or model prompts. Requests must not rely on client-provided OPA context, user IDs or permission ownership metadata.

## Profile lifecycle: SQL transactions + cross-API recovery

The Authorization API and LLM-owned SQL schema do **not** share an atomic transaction. Use idempotent verification, fail-closed state and durable cleanup where necessary:

1. **Bootstrap:** seed shared `llm/access` resource, five typed operations and OPA delegate; no per-profile operation resource creation.
2. **Profile create:** generate immutable UUID, authorize proposed owner/orgUnit and model config, insert `pending` profile. Create exactly three managed role/permission pairs via Auth API; Edit role receives Update and existing Read permissions. Insert mandatory three IDs into `profile_pre_authorised_permissions`, verify live Auth objects and set `ready` only after checks pass.
3. **Direct user grant:** list/manage only the three managed roles. Search user with a bounded authorized user-search API or accept verified user ID. Confirm assigned levels and external auth results; a scoped manager cannot grant/revoke the powerful Edit role.
4. **Custom permission create/edit:** verify unconditional Auth `permission/create` for tab visibility and actual action rights; new custom Auth permission can select `read/update/delete/invoke` (not `create`). Make its sole mapping to this profile `state='active'`. Edits modify the Auth permission, never role assignments; operation widening needs extra confirmation and unrestricted management authority.
5. **Custom role assignments:** show allowed target roles and use targeted Auth `role/update` for Assign to Role / per-role Remove. For View Assigned Roles, require a **complete trusted reverse lookup** of all assigned roles, with caller-filtered presentation and per-role permission checks. Never add to protected system-managed roles. No separate Detach feature exists.
6. **Custom Delete (single user action):** preflight exact custom ownership, uniqueness, all assigned roles, external caller's real `authObject/permission/delete` and `authObject/role/update` over **each** role; reject without side effects if any right missing. Mark custom mapping `state='deleting'` and exclude from OPA before removing **all** its role-permission assignments (use safe non-auto-deleting detach where API supports it), then delete its Auth permission, verify absent, and finally remove its SQL mapping. Retry idempotently after partial failure; don't lose UUID/role-reference cleanup data. If a role is added mid-cleanup, requery and fail closed; use scoped mutation locking or an Auth API batch operation to prevent races.
7. **Profile update:** validate old and new OPA contexts, orgUnit scope change implications, and `revision` CAS. No long SQL lock over Auth API calls. Restrictive changes apply to subsequent requests; existing streams may settle.
8. **Profile delete:** set `state='deleting', enabled=false` first. Clean the **three** owned managed roles/permissions, and perform the **same full custom Delete cleanup** for every profile-owned custom permission before deleting the SQL profile. Do not delete externally owned roles or user identities; if Auth cleanup is blocked, keep profile and custom mapping rows for repair, not a falsely successful deletion.
9. **Repair and audit:** identify pending/deleting profiles/custom permissions; verify all mandatory ID pairs and mapping rows, role-permission link invariants, custom ownership, role cleanup progress and absence of unintended grants. Do not adopt foreign objects by matching descriptions. Keep action/actor/target IDs for diagnostics, not prompts, tokens or model secrets. The tab's create grant is only a visibility precondition; actual profile/permission/role authorization remains mandatory for writes.

## Soft usage ledger and model-based quota evaluation

Use **total input + output tokens** for the operational budget guardrail. Treat provider reasoning tokens as part of output and cache-read input tokens as part of input; **never double count**. This is an approximate volume metric, not a currency bill (different models/input/output/cache have different pricing).

The quota key is **authenticated MAGDA user UUID plus requested public model alias**. Same-model profiles look at the same ledger; different model aliases have independent ledgers even when routed to the same underlying provider. Never use the client-supplied `user` field, profile ID, DSH session, API key or provider ID as the counter identity.

- Extract Chat Completions `usage.prompt_tokens` and `usage.completion_tokens`, or Responses `usage.input_tokens` and `usage.output_tokens` (normally nested under the terminal `response.usage` for streamed Responses). Count **one validated final snapshot per forwarded facade request**, not one debit per usage event, completion marker, conversation or tool invocation. Check `total_tokens = input + output` when present; reasoning/cached token details are subsets and must never be added again. Streaming SSE observation must preserve raw bytes, chunk order, headers and backpressure; never reconstruct provider output, buffer whole streams or log prompts/responses.
- Accept **valid final usage from `response.completed` or `response.incomplete`**, and from `response.failed` only when a valid usage snapshot is actually supplied. Chat streaming usage normally arrives in a final usage-bearing chunk before `[DONE]`. Treat provider `[DONE]` after a Responses terminal as **another marker, not another billable request**. Before terminal, later validated snapshots can supersede earlier provisional ones; freeze on the first authoritative terminal. A Chat `finish_reason` alone is **not** a streaming terminal. Never sum duplicate, conflicting or provisional usage events. Invalid, absent or oversize terminal metadata is **unknown**, not an exact zero.
- On missing authoritative final usage (cancellation, incomplete background request, provider error, timeout, malformed/oversize event or process interruption), apply one documented **approximate fallback** when upstream processing may have occurred. Record it as `estimated_tokens`/`estimated_requests`, never also as measured input/output. A request refused before forwarding to LiteLLM costs no tokens in our ledger. Avoid a fallback based solely on visible output characters: hidden reasoning, cached/repeated input and background generation are not reflected in visible text. A conservative estimate may use coarse request-input size plus a configured model output allowance; it is not a tokenizer or billing guarantee. No reservation/atomic pre-debit is required in v8: modest concurrent and termination-related under-accounting is an accepted *soft* limit.
- Perform one atomic daily `INSERT ... ON CONFLICT ... DO UPDATE` increment after a request is settled. Use the **operator-configurable IANA timezone `Australia/Sydney` by default**, e.g. Helm `global.llmServices.usage.timeZone: Australia/Sydney` (confirm the actual chart value path when wiring the deployment). Compute `local_date` from the **request's admission/start timestamp** in that timezone, rather than the finish timestamp: the same user/model quota period governs both admission and settlement even when a long stream crosses midnight/month end. This is a practical, documented soft-limit convention. Log operational timestamps in UTC; handle Sydney DST transitions without fixed UTC offsets. Changing a live deployment's timezone requires an explicit rebucket/reset plan, not silently reinterpreting existing dates.
- **Daily, weekly and monthly all come from the single daily table.** For the authenticated `user_id` and requested `model_alias`, sum `measured_input_tokens + measured_output_tokens + estimated_tokens` for (a) today's local date, (b) dates from local **ISO Monday** through the next Monday, and (c) dates from the local **first of calendar month** through the next month's first day. Use half-open `local_date >= period_start AND local_date < period_end`; no weekly/monthly rollup tables or background job. One model has distinct counters for each user, and the same-model usage row is shared across all profiles that allow the model.
- **Soft cutoff:** check persisted counters **before** each forwarded model request, allow eligible profiles when usage is *below every configured limit*, and deny when exhausted. No mandatory reservations or midstream cutoff. Concurrent admitted requests may overshoot; this is accepted and not billing-grade. A single DSH turn may involve several model requests: count initial generation, tool-call request, post-tool continuation and auxiliary/background (e.g. title) requests **independently**, all against the authenticated MAGDA user and each request's alias. A background request cancelled during shutdown must follow the same missing-terminal estimate policy; do not count only the visible final response.
- If a **required** ledger read/write facility is unavailable **before admission**, fail bounded non-admin requests with a safe `503` rather than silently allow unchecked spending; admins and explicitly unbounded access still follow their normal policy. An incomplete *provider* usage value is different: use the documented estimate. If a **post-stream write fails after HTTP headers are sent**, the response cannot be turned into a retroactive `503`: log a non-sensitive critical accounting failure, trip a bounded-access admission circuit-breaker/health gate for subsequent requests, and reconcile if an idempotent retry is safe. Do not misreport an unpersisted count as committed. No claim of crash-proof billing is made.
- Expose aggregate totals/estimation counts to authorized operators, with a retention/cleanup policy. Do not store raw prompt text, output content or LiteLLM master/provider secrets. Consider provider-side budget alerts independently for financial safety.

**Helm and accounting window example (proposed config):**

```yaml
global:
  llmServices:
    usage:
      timeZone: Australia/Sydney
```

For 21 November 2026 in Sydney, the daily period is `2026-11-21`, the ISO weekly period is `2026-11-16 <= local_date < 2026-11-23`, and the calendar monthly period is `2026-11-01 <= local_date < 2026-12-01`. A request started at 23:59 on 30 November is attributed to **30 November**, even if the response completes in December. Timezone changes or delayed settlements across windows are accepted limitations of a soft quota, not separate billing accounting.

**PoC conclusion:** [#3934](https://github.com/magda-io/magda/issues/3934) / [draft PR #3936](https://github.com/magda-io/magda/pull/3936) establish that the currently pinned LiteLLM version exposes usable usage metadata and allows byte-preserving observation for the **tested OpenAI Responses + installed DSH route**. No LiteLLM version upgrade is justified solely by this PoC. These findings do not validate other providers, model-specific provider accounting, production timeout races, browser UI rendering or billing accuracy. LiteLLM remains network-private and stateless, without its own database, Redis, virtual-key management or budget enforcement subsystem.

### Endpoint-specific usage observation, based on PoC #3936

Implement the **same high-level accounting contract** for both supported proxy endpoints but **do not use the same request options or event envelope**:

| API / request mode | Proven format on tested route | Required handling |
| --- | --- | --- |
| Chat Completions, non-streaming | `usage.prompt_tokens`, `completion_tokens`, `total_tokens` | Validate the JSON usage snapshot and debit once |
| Chat Completions, streaming | Final usage-bearing `chat.completion.chunk`, followed by `[DONE]` | In pinned LiteLLM 1.81.12, omitted/`true` `stream_options.include_usage` produced usage but explicit `false` suppressed it. For supported Chat backends, LLM Services should **ensure usage is requested** for quota-controlled calls, with endpoint/provider compatibility tests; never accept `false` as an implicit free call. If metadata cannot be requested safely, debit a marked estimate |
| Responses, non-streaming | `usage.input_tokens`, `output_tokens`, `total_tokens` | Validate the JSON response |
| Responses, streaming | Terminal `response.completed` or `response.incomplete` contains nested `response.usage`; tested streams also end with `[DONE]` | **Never inject Chat-specific `stream_options`**; this route returned HTTP 400 for both `include_usage:true` and `false`. Accept terminal usage even when the response is incomplete; avoid duplicate debit for `[DONE]` |

The pinned LiteLLM installation did **not** expose evidence of an `always_include_stream_usage` configuration option; do not rely on it. The actual tested model rejected **tool-bearing Chat Completions requests**, regardless of usage settings; installed DSH advertises tools even for ordinary tasks. **Responses is the verified DSH route for that provider**, not proof that a Chat-based DSH tool loop works for other models.

Use a **bounded, metadata-only observer** for `text/event-stream` that handles arbitrarily fragmented chunks, UTF-8 and CRLF boundaries and event types without changing the forwarded bytes. The PoC uses a **64 KiB SSE-event buffer** and **1 MiB non-streaming JSON cap** as *tested defaults*, not universal provider guarantees. Set explicit production bounds, count dropped/oversized/malformed or unknown-format events, and use the estimated-usage path if the final usage cannot be read. Observing a complete upstream stream does not prove the downstream client received every byte; protect normal proxy cancellation/backpressure behaviour. A standalone loopback tap was used only to prove feasibility, not prescribed as a new production network hop. Keep the observer inside the eventual proxy path and ensure accounting failures don't corrupt model output.

For any request that reaches LiteLLM, use a single **settlement** outcome: (a) validated final usage, or (b) estimated usage when no validated final usage is available and upstream processing may have occurred. Preserve the distinction between `terminalSeen` and `usageFinal`: a terminal with invalid/missing usage is **not** final metering. Implement idempotent settlement within the request lifecycle to avoid duplicate database upserts from repeated events, close/error callbacks or `[DONE]`; process crashes before settlement remain an explicit soft-quota limitation. Retain only safe aggregate counters and metric-quality flags, not raw response frames or tool arguments.

### PoC evidence and limits (20 November 2026)

The [live findings](https://github.com/magda-io/magda/blob/poc/3934-litellm-usage-observer/magda-llm-services/poc/live-findings.md) in [draft PR #3936](https://github.com/magda-io/magda/pull/3936) report:

- Bundled `ghcr.io/berriai/litellm:main-v1.81.12-stable`, installed LiteLLM **1.81.12**, running architecture-specific imageID digest `sha256:bbe33922e37bb76a065f85b847cb34744e98b408df66c6c4b4425e48b9e8c573` (not necessarily a multi-architecture manifest digest).
- **One real configured OpenAI route** (`openai/gpt-6.1-sol` behind `magda-agent-default`) and actual installed DSH **0.2.1-alpha.1**, tested in isolated minikube headless sessions using the existing MAGDA facade. Responses ordinary streamed requests and real bash tool-call/continuation requests succeeded with an observational tap. Reported observer data matched the tested input/output totals without mutating source buffers. This is **not browser UI testing**.
- A real DSH tool continuation returned input **4,312** + output **18** = total **4,330**, including cached-input **4,223** (within input) and reasoning **11** (within output). A real concurrent title request ended `response.incomplete` with valid usage. **Five wire requests** were seen during the observed DSH run, but only **four** completed the observer's final reporting before shutdown — in-flight auxiliary traffic is not always final-meterable.
- The PoC PR reports **50 passing automated tests**, including fragmented SSE parsing, byte preservation, backpressure and cancellation. Offline fixtures are synthetic, while the live-provider/DSH results are separately identified. The observer was exercised on the unchanged production facade via a temporary loopback hop; the PoC **does not implement** a production metering interceptor, authenticated-user quota DB, reservation/deduplication or budget cutoff.
- **Not verified:** Anthropic, Bedrock, Azure, alternative OpenAI-compatible backends, browser sessions, all failure races, provider billability/cost or accuracy of inferred provider usage. Require new provider-specific compatibility tests as those backends are supported; don't mark their metering as proven by the OpenAI observations.

This evidence supports proceeding with **MAGDA-owned, approximate token-volume accounting** and keeping the current pinned LiteLLM version for the tested Responses route. It does **not** change SQL ownership/profile schema, typed OPA permissions, or administrator behaviour.


## Verification and delivery

- [ ] Clean v8 deployment (no released-user migration); Workspace access and independent LLM invocation rights separated; unchanged global admin override and deployment model allowlist.
- [ ] SQL schema migrations/bootstrap/least-privilege LLM connection co-located with existing Auth PostgreSQL deployment; backup and failure handling; no new Postgres server or Redis.
- [ ] Shared `llm/access` typed OPA policy evaluates trusted SQL profile `access-control` with **three mandatory managed plus optional custom pre-authorised permission UUIDs**. Test exact same-permission ID/operation matching, managed use/read/edit separation, a custom multi-operation `read/update/delete/invoke` grant, wrong IDs/resource/flags, null orgUnit, owner/orgUnit/combined/unconstrained scope, matching `allowExemption` only on management, forged caller context and disallowed pre-authorised `create`.
- [ ] Profile creation provisions exactly three managed pre-authorised permissions and three roles, plus the **same three mandatory mapping rows**. Verify Edit role includes Read permission, direct use/read/edit membership UI, list/add/revoke users through LLM Services, and persistent `profile_pre_authorised_permissions` custom links. Verify external Auth API objects by UUID/flags/membership, not descriptions; recovery of pending/deleting/partial custom creation; stale-role or permission-ID resurrection is impossible. Old/new profile OPA decisions and `revision` CAS protect concurrent updates; no cross-service SQL writes.
- [ ] `allowed_models=["*"]` expands only to currently available, deployment-allowed aliases; reject mixed/unknown aliases and ensure adding aliases, wildcard or higher quotas requires unconstrained update/admin. Same-model OR without stacking/independent-limit mixing, separate A/B counters, per-user quotas and unchanged global administrator override. No special non-admin wildcard authorization operation or SQL model catalogue.
- [ ] Helm-configured `Australia/Sydney` default and explicit UTC override, DST boundaries, ISO Monday/weekly and calendar-month daily-row summations, period transition while a stream is running and concurrent SQL upserts; count measured or estimated usage **once per upstream request** including tool continuations/background title requests and never separately add reasoning/cached subsets.
- [ ] Integrate with pinned LiteLLM and actual DSH Responses streaming, preserving bytes/tool-call argument chunks; test final `response.completed`, `response.incomplete` with usage, `[DONE]` duplicate markers, Chat usage toggles, cancelled/missing-terminal/oversized events, timeouts, and exact no-charge cases before upstream dispatch.
- [ ] For Chat streaming `include_usage:false`, ensure bounded ordinary callers cannot suppress metering to evade quota (controlled endpoint-specific request normalization when compatible, otherwise estimated debit). Confirm the Responses path **never** gets Chat-specific `stream_options`. Provider compatibility tests are needed for other model routes before claiming broad support.
- [ ] Implement [separate UI design](./llm-access-profiles-ui.md): **Settings → LLM Services** top-level **Access Profiles / My Usage / User Usage** tabs; per-profile General, Access (direct Use/View/Edit **plus authorized user search**) and Pre-authorised permissions. Test owner ID, orgUnit dropdown/null, wildcard warning, edit-implies-view, direct-grant-only explanation (no inferred effective roles), and scoped/unrestricted action gating.
- [ ] Advanced tab **visibility only** requires unconstrained `authObject/permission/create` (or administrator), but each action additionally checks actual profile/permission/role rights. Its grid shows **UUID / Permission name / Operations / Actions**, excludes the managed three and lists only profile-owned custom permissions. Actions menu contains **Edit** (no role assignments), **Assign to Role** (searchable existing authorized roles), **View Assigned Roles** (modal with per-role Remove) and **Delete** (single full cleanup). Do **not** implement Detach. Test custom permission edit widening, external role read-vs-update, multi-role deletion, preflight refusal with no side effects, SQL `deleting` non-authorizing state, idempotent interrupted deletion, custom permission single-profile uniqueness and profile deletion cleanup. A permission must be detached from every Auth role before Auth API deletion.
- [ ] OrgUnit-constrained `invoke` on Authenticated Users grants only **eligible profiles whose `orgUnitId` is in each caller's `managingOrgUnitIds`**. Include same orgUnit, child subtree, inaccessible ancestor/sibling, `orgUnitId=null` non-match, owner-scoped and unconstrained alternatives, explicit pre-authorised cross-orgUnit access, and independent profile availability/quota checks.
- [ ] **My Usage** visible to every authenticated caller holding any `llm/access/invoke` permission, including unmatched scoped grants (and administrators). Show tracked total, today/week/month, per-model effective remaining budget using **minimum across bounded windows per eligible profile then maximum across eligible profiles**, and daily user/model history with measured/estimated totals; distinguish Unlimited, 0, and No eligible model profile. Never accept a different user ID on personal endpoints. **User Usage** separate tab requires administrator or unconstrained global profile-update and enforces user-directory access filtering.
- [ ] Filter profile/model/user/permission metadata for non-admins; `Cache-Control: private, no-store`; safe 401/403/409/422/429/503 responses and no accidental disclosure of unrelated global role memberships.
- [ ] After feature implementation, update maintained LLM architecture, operator guide, security/OPA and end-to-end tests; until then **do not describe profiles/limits as shipped**.

**Delivery:** #3838 implements SQL profile management, managed per-profile role grants, model entitlements and approximate **per-model usage limits together**, building on the positive provider-specific evidence in #3934/#3936. No billing-grade reservations, user-facing dollar accounting, or LiteLLM Postgres/Redis integration is part of this scope.
