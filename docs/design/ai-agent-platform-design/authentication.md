# Authentication and credential boundaries

**Status:** Accepted credential delegation model (#3825); expiring managed key and cloud identity clarification aligned with MVP #3850 / GKE #3852  
**Owner ticket:** #3825  
**Depends on:** #3822/#3823; coordinates with #3824 and #3838  
**Blocks:** sandbox credential/bootstrap implementation

The earlier "Manager-held short-lived key + opaque sandbox capability" design is no longer the selected baseline.

## Security / authority model

The managed agent acts **on behalf of the authenticated Magda user**.

The agent intentionally receives normal user-scoped Magda authority rather than a narrower server-enforced delegation capability. Magda authentication/OPA remains authoritative for **what the user is allowed to do**.

The agent/DSH/skill layer is responsible for the normal coding-agent interaction policy around **when the agent should ask the user before taking consequential actions**.

This distinction is deliberate:

- Magda auth/authz controls user permission;
- DSH + Magda agent guidance controls interactive confirmation;
- gVisor/Kata/NetworkPolicy protects infrastructure and other tenants.

The initial v8 design does **not** promise a cryptographic/server-side boundary preventing a prompt-injected agent from exercising authority already granted to the user.

## Browser identity

Browser requests enter through Magda Gateway and use normal Magda authentication.

Agent Manager and Magda LLM Services receive trusted Magda user context from the Gateway (normally `X-Magda-Session`) and do not accept a browser-supplied user UUID as authority.

## System-managed sandbox Magda API key

Each current user Sandbox receives one real, user-scoped Magda API key.

The key:

- is created automatically by Agent Manager with a reserved system-managed name;
- has an initial, renewable expiry aligned to the eight-hour inactivity deletion deadline in the current MVP (#3850);
- is written into the PVC-backed `mgd` profile by post-claim bootstrap;
- is also configured as DSH's credential for the external Magda LLM API;
- survives suspend/resume with the same PVC;
- has its expiry **extended on recorded meaningful activity/resume** alongside the claim's KAS shutdown deadline;
- is revoked/deleted when the sandbox is permanently deleted/logged out;
- is rotated by deletion/recreation when a new sandbox is started.

The key's reserved name is scoped to the **Magda installation ID** as well as the user. Before creation, Agent Manager removes stale keys with *this installation's* reserved name so partial failures self-heal toward exactly one managed key for this installation's current sandbox; it must not revoke a different installation's keys.

The MVP creates a recoverable SandboxClaim before issuing the raw key, and attempts revocation **before** deleting the claim/PVC on logout/reset or interrupted bootstrap. Activity renewal requires two durable writes (KAS claim deadline and Authorization DB expiry). Those writes are not atomic in #3850; retry/reconciliation and monotonicity on partial failures remain follow-up requirements described in [session-lifecycle.md](./session-lifecycle.md).

The reserved name is an operational marker, not a separate security principal.

## Magda API usage

`mgd` uses the normal external Magda endpoint and normal API-key authentication; no Agent Manager Magda proxy is required.

Magda supports bearer API-key form:

```http
Authorization: Bearer <apiKeyId>:<apiKey>
```

DSH uses the **same underlying credential** when calling Magda LLM Services. Its managed OpenAI-compatible adapter is given the raw `<apiKeyId>:<apiKey>` value and adds the `Bearer` authorization scheme itself; do not persist a second `Bearer ` prefix in the DSH config.

The key is stored on the sandbox PVC, not baked into the image and not placed in claim metadata/environment.

## Mutation confirmation model

The initial v8 safety contract is **agent-level confirmation**, not a separate server-side mutation-grant protocol.

The shipped `mgd` skill already requires explicit user confirmation before mutating/publishing operations, including curated create/update/publish/file/aspect commands and raw POST/PUT/PATCH/DELETE API requests.

DSH's `workspace-write` preset must not be misrepresented as enforcing Magda API mutation approval:

- `workspace-write` confines **filesystem effects**;
- DSH's `ask` approval policy is used when a tool requests an approval/escalation;
- outbound network access is outside the DSH file-sandbox mode;
- therefore a normal `mgd` mutation can technically execute without a workspace-sandbox escalation prompt.

For product UX, Magda may later integrate mutating `mgd` operations more directly with DSH's general approval seam so the user receives a structured "Allow once" approval card. That would strengthen the interaction UX but is not treated as a non-bypassable server security boundary because the sandbox also has shell/network access and the user's API key.

The key architectural contract is:

```text
Magda auth/OPA
    -> what this user may do

DSH + mgd skill / optional DSH approval integration
    -> when the agent asks the user before consequential actions
```

## Agent Workspace access permission and skill authorization (expanded MVP)

**Dedicated Workspace operation:** `agentWorkspace/access`, implemented by `magda-opa/policies/agentWorkspace/allow.rego` and delegated from the OPA entrypoint. This is a **single** grantable permission controlling the current user's Workspace start/status/resume/terminate/reset, runtime HTTP proxy and WebSocket upgrade. Manager always resolves and operates on **the authenticated user's own** SandboxClaim using the user UUID + Magda installation; users (including admins through the public endpoints) cannot choose an arbitrary target. Replace the hard-coded admin-only authorization gate with this operation; retain the initial **admin-only default grant** and admin override, without making all ordinary users eligible automatically. UI visibility is only a whoami hint.

**Agent Skill operations:** `object/agentSkill/create|read|update|delete`, with dedicated `magda-opa/policies/object/agentSkill/allow.rego` and typed record delegation from `object/record/allow.rego` for Registry records bearing `agent-skill`. Ensure the generic record-policy fallback does **not** bypass typed permission checks; the policy distinguishes admin-published system skills (authorized read for all authenticated eligible users, admin-only writes) from owner-scoped user skills (owner CRUD). Future sharing can build on Registry `access-control.preAuthorisedPermissionIds`. An unconstrained system-skill read grant must **not** expose private user skills.

Each published system/user skill has a Registry `agent-skill` + `access-control` record. Agent Services coordinates authorized Registry API mutations and validates linked ZIPs served through **Storage API** from the existing default bucket. It propagates the trusted Gateway-originated `X-Magda-Session` current-user identity to internal Registry/Storage calls; this is not a user-supplied user-ID or an elevated Agent Services storage identity. The skill object uses `magda-record-id` linking to the Registry record. Record-linked Storage API's permission delegation is reused, while protecting the reserved skill archive prefix against direct unvalidated uploads/deletes. See [skills.md](./skills.md), #3854 (skills API/OPA) and #3858 (Workspace access OPA).

## Role/user changes

Because calls go through normal Magda authentication/authorisation:

- role/permission changes take effect according to normal Magda authorisation behavior;
- a disabled/invalid user/key is rejected by normal Magda auth;
- Agent Manager does not cache an independent delegated permission set.

Sandbox lifecycle cleanup is responsible for revoking the system-managed key when the sandbox is permanently removed.

## LLM provider credentials

OpenAI/Anthropic/AWS/Azure/local-provider credentials never enter the sandbox.

```text
DSH
  -> Magda external /api/v0/llm/...
  -> Magda Gateway authentication
  -> Magda LLM Services model authorisation
  -> internal LiteLLM credential
  -> LiteLLM
  -> provider credential
```

See [llm-services.md](./llm-services.md) / #3838.

Any valid authenticated Magda API client may use the LLM API if the user is authorised for the requested model. The API is not restricted to the special Agent API key.

## Explicit credential trade-off

The sandbox is arbitrary-code execution and has public egress. Therefore the Magda API key readable by DSH/model-controlled tools must be treated as potentially exfiltratable during the sandbox lifetime.

The lifecycle reduces abandoned-key exposure:

- suspend retains the key because the same logical Sandbox continues;
- inactivity-based expiry limits a stale key even if cleanup cannot immediately run;
- meaningful activity/resume renews expiry with the claim deadline (subject to robust failure/reconciliation handling);
- logout/hard deletion revokes it;
- starting a new Sandbox rotates it.

It does not prevent an active malicious/prompt-injected workload from reading/exporting the key or using the user's existing authority. This is an accepted initial-v8 trade-off of the "agent acts on behalf of the user" model.

Deployments that require a stronger non-bypassable delegated-authority boundary would need a future constrained-credential/proxy design; that is not an initial-v8 requirement.

## Network assumptions

The credential design assumes:

- sandbox egress may reach public Internet;
- cluster-internal/private/link-local/cloud-metadata addresses are denied except explicit infrastructure such as DNS;
- Magda APIs and LLM APIs are called through the external Magda endpoint;
- sandbox ingress is limited to the Agent Manager/approved DSH proxy path.

Network restrictions protect infrastructure/lateral boundaries; they are not intended to make the sandbox-held user credential secret from the sandbox itself.

## Kubernetes ServiceAccount and GKE cloud identity (separate trust boundary)

The **Magda user API key** above must not be confused with a Kubernetes ServiceAccount identity or a GKE Workload Identity Federation Google access token. The Magda key is intentionally available to DSH/agent tools; Google Cloud authority unrelated to that user's Magda permissions is **not** required.

The real-GKE PoC #3852 obtained HTTP 200 from the GKE metadata-server token endpoint despite `automountServiceAccountToken: false`; it obtained HTTP 404 for the node `kube-env` endpoint. The PoC did **not** determine the token's effective IAM permissions. Do not infer that no service-account volume implies that the metadata server is unreachable, or that a returned token is necessarily privileged.

**Required GKE design/qualification:** explicitly choose a minimally privileged Sandbox Kubernetes ServiceAccount (not an implicit `default` grant), ensure no unintended IAM bindings (including broad namespace/pool `principalSet` grants), verify effective token authorizations using permitted/denied IAM probes, and test the metadata/network boundary under an **enforcing** GKE datapath. Metadata blocking must respect documented GKE platform needs; if it remains reachable, the Sandbox principal must have no unrelated useful IAM authority. See [network-security.md](./network-security.md).

This is a **pending security acceptance item**, not a retroactive claim that #3852 proved cloud identity isolation.
