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

The array is projected from **all** rows of `profile_pre_authorised_permissions`, **not just three**. Exactly three links must point to the three pre-authorised permissions in `profile_managed_roles` for a ready profile; advanced custom links are optional. Every UUID must refer to a real Authorization API permission or be ignored/fail closed for its own match. Client input cannot override SQL fields, this array or the caller identity.

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

### Advanced pre-authorised permissions: additional custom grants

Keep `profile_pre_authorised_permissions` as the **explicit allowlist of pre-authorised permission UUIDs** associated with a profile. Normally it contains the three managed IDs only. Advanced administrators/operators may create additional pre-authorised permissions on the shared `llm/access` resource and attach their IDs to the same profile. This supports custom roles, combinations of operations and sharing profiles across unrelated orgUnit branches. For example, a custom Auth permission with `preAuthorisedConstraint=true` and `operationUris=["llm/access/read", "llm/access/update", "llm/access/delete", "llm/access/invoke"]` can authorize *all those operations for a linked profile* for users whose role contains that permission. The permission ID may be linked to multiple profiles deliberately; each link is independently revocable.

The **Pre-authorised permissions** tab (advanced, separate from the simple **Access** tab) provides:

1. **List only advanced linked permissions**, excluding the exact three managed permission IDs, with their label, UUID, operation selection, and roles that the caller is allowed to inspect. In v8, custom permissions created from this tab are automatically linked to its current profile; the list therefore represents the tab-created custom permissions **currently attached to this profile**. If later accepting externally created permission IDs, label their origin explicitly instead of implying the UI created them.
2. **Create a custom pre-authorised permission** with a chosen nonempty subset of `read`, `update`, `delete` and `invoke`. LLM Services validates `resourceUri="llm/access"`, `preAuthorisedConstraint=true`, `userOwnershipConstraint=false`, `orgUnitOwnershipConstraint=false`, `allowExemption=false`, exact supported operation URIs, a human-readable name and full Auth API lifecycle permissions. `create` is deliberately **not selectable**; it requires a separate global permission, since a not-yet-created profile has no pre-authorised mapping to evaluate.
3. **Add/remove the custom permission to/from an existing authorized role** by role ID or filtered role picker. LLM Services verifies the caller may update **that specific role** and the permission remains the exact custom permission bound to this profile; avoid assigning to protected system-managed roles, including any of the three auto-managed roles. Assigning a permission to a role can immediately grant its existing users rights; show the selected operations and role ID in a confirmation. Removing it from one role does not detach it from the profile or change other roles.
4. **Detach** the custom permission from the current profile, revoking that one mapping immediately, **without deleting its underlying Auth API permission or altering any role**. If it is linked elsewhere, those other profiles remain authorized. Deleting the permission globally is a separate privileged Auth API action, never an implicit side effect of unlinking or deleting a profile.

**Authorization and safeguards:** Creating or linking advanced custom permissions requires **administrator or unconstrained global `llm/access/update` on the profile** (a profile-scoped edit or owner/orgUnit-constrained update is insufficient). In addition, require the **actual external caller's Authorization API rights**, e.g. `authObject/permission/create` to create the new permission and effective `authObject/role/update` on the **specified target role** for adding/removing its permission. Any global permission deletion must check `authObject/permission/delete` and that the permission is no longer attached to roles/profiles as appropriate. Use the existing Auth API's full constraint decisions rather than treating "role visible" as "role editable". If the backend uses a trusted service-admin identity for cross-API changes, **independently check these caller privileges** first; never let the service-admin token become a generic privilege-escalation path.

Custom creation, attaching the profile mapping, and role-permission updates span SQL and Auth API without a global transaction. Prefer **create permission → validate → insert profile mapping → optional role attachment**, with idempotent reconciliation and clear partial-success/error states. An Auth API permission may exist before linkage but provides no access to the profile until the mapping exists. Deleting or modifying a custom permission/role elsewhere may invalidate a mapping; deny that permission's access and alert administrators without necessarily disabling unrelated managed grants.

Advanced permission/role listing does **not** attempt global effective-user enumeration; operations must use an existing Auth API resource/role lookup filtered by the caller's rights. For cross-profile permission reuse and ownership, store authoritative UUID associations in SQL and verify the real Auth API permission and operation/flags before new assignments. Do not silently adopt a role or permission solely because its name/description looks system managed.

### Settings → LLM Services UI contract

The detailed **[LLM Access Profiles UI design](./llm-access-profiles-ui.md)** is the implementation contract for screens, form validations, permission-aware actions, lifecycle states and backend APIs. It follows **Settings → Access Groups** and has a searchable list plus per-profile **General**, **Access**, **Pre-authorised permissions** (advanced) and **Usage** tabs.

- **General:** name, enabled, allowed model aliases or `All currently available models (*)`, daily/weekly/monthly per-model token limits; owner editable by validated user ID, orgUnit chosen via authorized Auth API dropdown. Show null orgUnit as **No orgUnit** and explain orgUnit-constrained grants **do not match** it. Permission-aware controls: only admin/unconstrained update can widen aliases, raise limits, enable, change exemptions or grant advanced access.
- **Access:** lists **only direct managed-role user grants** with Use/View/Edit, adds/removes users by ID. Show a simple note rather than scanning/estimating effective roles: "**Users may also have access through profile ownership, its orgUnit scope, or custom roles and permissions, depending on grants configured in MAGDA Authorization. This list shows direct user grants only.**" Do **not** add a separate "Authenticated Users — OrgUnit constrained" role enumeration card.
- **Pre-authorised permissions:** lists linked **custom** pre-authorised permissions (excluding the three managed), creates a new custom permission with allowed operations and lets authorized operators add/remove it to an **existing authorized role**. No global role search or role membership disclosure beyond the caller's Auth API rights.
- **Usage:** shows measured/estimated daily, ISO weekly and monthly token aggregates by user and model; usage is keyed by **user/model**, so the UI must not claim a per-profile balance or uniquely attribute shared-model usage to one profile.
- Non-admins who only hold `invoke` may use an eligible model without permission to view any profile's management metadata. When the current user is missing `read` but has scoped `update`, provide a suitably redacted/manageable profile view only after a server-side decision; don't leak unrelated profile rows.

The UI and all role operations must be mediated by LLM Services, with service-side authorization for each action. Do not expose a generic Auth API superuser editor through the LLM UI, or rely solely on disabling buttons to enforce permissions.

## Public LLM Services endpoints

OPA operation URIs are **typed authorization identifiers**, distinct from HTTP paths. All HTTP paths below are relative to `/api/v0/llm` and remain **proposed**. The detailed frontend contract is in [LLM Access Profiles UI](./llm-access-profiles-ui.md).

| HTTP endpoint | Required authorization | Behaviour |
| --- | --- | --- |
| `POST /access-profiles` | `llm/access/create` on validated proposed row | Create pending SQL profile; provision managed role/permission pairs and all three mandatory pre-authorised links |
| `GET /access-profiles` | Per-row `llm/access/read` | Filter visible profile metadata; paginate |
| `GET /access-profiles/:id` | `llm/access/read` on current row | Read permitted profile, no member or unrelated-ACL leakage |
| `PUT /access-profiles/:id` | `llm/access/update` on old + proposed state | Validated metadata edit; widening/ACL changes require unrestricted update/admin; version/ETag conflict `409` |
| `DELETE /access-profiles/:id` | `llm/access/delete` on existing row | Disable first; remove only owned managed permissions/roles; detach custom SQL links without deleting custom Auth objects |
| `GET /access-profiles/:id/users` | Effective `llm/access/update` | Paginated direct **managed-role** user list, not inferred global/advanced users |
| `POST/PUT/DELETE /access-profiles/:id/users/:userId` | `llm/access/update`; additional elevation check for managed Edit | Add, replace or revoke only the three managed roles on that target user |
| `GET /access-profiles/:id/pre-authorised-permissions` | Admin/unconstrained global `llm/access/update` | Show **advanced custom** mapped permissions, excluding three managed ones |
| `POST /access-profiles/:id/pre-authorised-permissions` | Admin/unconstrained `llm/access/update` **and** caller `authObject/permission/create` | Create exact pre-authorised Auth permission for selected `read/update/delete/invoke` subset, then link its ID to profile |
| `POST/DELETE /access-profiles/:id/pre-authorised-permissions/:permissionId/roles/:roleId` | Above advanced scope **and** caller has effective `authObject/role/update` on target role | Attach/remove a mapped custom permission to/from one authorized **existing role**; never alter protected managed roles |
| `DELETE /access-profiles/:id/pre-authorised-permissions/:permissionId` | Admin/unconstrained `llm/access/update` | Remove the one **custom SQL mapping** and immediately revoke that profile association; do **not** delete Auth permission or touch other roles/profiles |
| `GET /access-profiles/:id/usage` | Admin/unconstrained global profile-management grant for other-user rows; scoped editor may see own rows | Report per-user/model daily/weekly/monthly measured+estimated totals; do not present shared-model ledger as profile-attributed |
| `GET /v1/models` | Effective eligible-profile `llm/access/invoke` for non-admins | Return only available, deployment-allowed aliases for which caller has **some valid scoped or pre-authorised invocation grant**; admins see all deployment-allowed, served aliases |
| `POST /v1/chat/completions` and `POST /v1/responses` | Effective `llm/access/invoke` on eligible profile | Proxy request with authenticated user/model soft quota check and metering |

A non-admin model invocation is eligible **only if** (1) the requested public alias is deployment-allowed and actually served; (2) **some** enabled `state='ready'` profile includes it explicitly or via `["*"]`; (3) a **full trusted OPA decision** for `llm/access/invoke` allows that **same profile** via owner, orgUnit, combined, unconstrained or managed/custom pre-authorised permission; and (4) the authenticated user's current same-alias daily/weekly/monthly usage is below **every ceiling of that same eligible profile**. Any one profile may satisfy all four; never combine a permission match from one profile with a quota ceiling from another. Several granted profiles are OR/non-stacking, not additive budgets. Admins bypass profile/quota checks, not the deployment allowlist.

`orgUnitId=null` on the profile **never** matches an orgUnit-constrained decision; other valid paths may still apply. A role-wide unconstrained `invoke` permission alone grants no access to an absent, disabled or ineligible profile. No automatic model access flows from owning a profile or being its orgUnit member *without* the corresponding operation permission.

All profile, direct-grant, permission and model-discovery responses are caller-specific and require `Cache-Control: private, no-store`; do not leak forbidden rows in counts/pagination. LLM Services must never reveal unrelated Auth API role memberships/permission objects or model/provider Secrets via errors. A user's own measured/estimated usage may be displayed after verifying identity, but other users' **cross-profile** per-alias usage totals require appropriately unrestricted management authorization because the daily ledger is **not per-profile**.

## Profile lifecycle: SQL transactions + cross-API recovery

The Authorization API and LLM-owned SQL do not share an atomic transaction. Keep provisioning/revocation **idempotent, explicit and fail-closed**:

1. **Bootstrap:** seed the shared `llm/access` resource, five stable operation URIs and typed OPA policy; no per-profile Auth API resource/operation registration.
2. **Create:** LLM Services generates an immutable profile UUID, validates owner/orgUnit/model limits, checks proposed `create` and inserts `state='pending'`. Create three managed Auth API pre-authorised permissions/roles; link Edit role to both Edit and Read permission IDs. Persist `profile_managed_roles` and the **same three** rows in `profile_pre_authorised_permissions`, then verify both tables against actual Auth objects before `state='ready'`. Failed creation remains pending/non-invokable for recovery, never automatically granting the creator model use.
3. **Direct user grants:** authorize profile `update`, stronger privilege for Edit assignment, and exact managed-role ownership; modify only the selected profile's role membership in Auth API. Retry idempotently and report partial failures without pretending the user was granted/revoked when the remote operation failed.
4. **Advanced custom permission:** authorize **unconstrained** profile update/admin and caller Auth permission creation. Create custom pre-authorised permission on `llm/access` with allowed non-`create` operation subset, validate its returned UUID/flags, then insert one profile mapping. Optionally attach it to an **existing, caller-editable role** only after a separate caller `authObject/role/update` decision on that role. A permission present in a role but not mapped to a profile cannot authorize that profile. Failed steps must not silently broaden access; return explicit state/repair instructions.
5. **Unlink custom permission or role:** detaching a custom **profile mapping** is a SQL deletion that removes its effect for **that profile** even if the permission remains in external roles; it must not delete a custom Auth API permission, modify its roles or remove links to other profiles. Removing the permission from a role calls Auth API and doesn't alter profile mappings. Every advanced workflow checks both the profile's advanced-management right and the caller's effective rights to the target Auth role/permission.
6. **Metadata update:** check typed `update` against current and proposed owner/orgUnit/exemption context, and compare `revision` at commit (return `409` for stale writes). An orgUnit move also changes **which scoped invoke grants match**, so show the implications/confirmation; maintain MAGDA's before-and-after constrained update semantics. Don't keep a DB row lock while awaiting remote Auth/OPA. Restrictive changes affect subsequent admission, not already running requests.
7. **Delete profile:** check typed `delete`, set `state='deleting', enabled=false` in SQL **first**. Verify and revoke **only** the profile-owned three managed roles/permissions and their assignments through Auth API. Do **not** delete externally owned custom permissions or unrelated roles. Once safe, delete SQL profile and both mapping-table rows via cascading FKs, which immediately removes any remaining custom-profile associations. If part fails, remain deleting, never invokable.
8. **Repair:** recover pending/deleting and partial advanced provision operations. Verify mandatory managed permission IDs, flag/resource/operation correctness, role-permission membership and three profile links. For custom mappings, a deleted/malformed Auth API permission is **non-authorizing**, recorded as a broken link for advanced UI/operator repair; it does not by itself disable otherwise healthy managed grants. Never adopt foreign objects by matching descriptions or resurrect deleted profile UUIDs.
9. **Identity and audit:** role/permission descriptions are human-readable diagnostics, **not ownership proof**. Only LLM Services creates profile UUIDs; record non-sensitive actor/action/target IDs in administrative logs without storing provider prompts or leaking Auth API tokens. A generic platform-wide `managed_by` feature can be considered separately, not as part of #3838.

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
- [ ] Implement [separate UI design](./llm-access-profiles-ui.md): Settings → LLM Services list, General, **Access**, **Pre-authorised permissions**, Usage tabs; validated owner ID, orgUnit dropdown/null handling, wildcard warning, direct use/view/edit user grants, edit implies view, a **static note** about possible implicit owner/orgUnit/custom-role grants (**no effective-role enumeration**), and scoped/unrestricted action gating.
- [ ] Advanced tab creates a custom pre-authorised `read/update/delete/invoke` permission, excludes `create`, validates caller's Auth permission-creation and target-role update rights, attaches/removes it to/from an existing authorized role, excludes the three managed permissions from its list, and detaches **only the current profile mapping** without deleting a shared permission or role. Test malicious role IDs, role read-only visibility, unexpected existing assignments, partial cross-service failures and denial of new privileged rights to scoped editors.
- [ ] OrgUnit-constrained `invoke` on Authenticated Users grants only **eligible profiles whose `orgUnitId` is in each caller's `managingOrgUnitIds`**. Include same orgUnit, child subtree, inaccessible ancestor/sibling, `orgUnitId=null` non-match, owner-scoped and unconstrained alternatives, explicit pre-authorised cross-orgUnit access, and independent profile availability/quota checks.
- [ ] Filter profile/model/user/permission metadata for non-admins; `Cache-Control: private, no-store`; safe 401/403/409/422/429/503 responses and no accidental disclosure of unrelated global role memberships.
- [ ] After feature implementation, update maintained LLM architecture, operator guide, security/OPA and end-to-end tests; until then **do not describe profiles/limits as shipped**.

**Delivery:** #3838 implements SQL profile management, managed per-profile role grants, model entitlements and approximate **per-model usage limits together**, building on the positive provider-specific evidence in #3934/#3936. No billing-grade reservations, user-facing dollar accounting, or LiteLLM Postgres/Redis integration is part of this scope.
