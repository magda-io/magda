# Authentication and credential boundaries

**Status:** Accepted  
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
- has no intrinsic expiry in the initial design;
- is written into the PVC-backed `mgd` profile by post-claim bootstrap;
- is also configured as DSH's credential for the external Magda LLM API;
- survives suspend/resume with the same PVC;
- is revoked/deleted when the sandbox is permanently deleted/logged out;
- is rotated by deletion/recreation when a new sandbox is started.

Before creation, Agent Manager removes stale keys with the reserved name so partial failures self-heal toward exactly one managed key for the current sandbox.

The reserved name is an operational marker, not a separate security principal.

## Magda API usage

`mgd` uses the normal external Magda endpoint and normal API-key authentication; no Agent Manager Magda proxy is required.

Magda supports bearer API-key form:

```http
Authorization: Bearer <apiKeyId>:<apiKey>
```

DSH uses that same bearer credential when calling Magda LLM Services.

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
