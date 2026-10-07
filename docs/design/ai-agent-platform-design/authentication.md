# Authentication and credential boundaries

**Status:** Investigating  
**Owner ticket:** #3825  
**Depends on:** #3822/#3823; coordinates with #3824, #3838 and mutation approval  
**Blocks:** final sandbox credential/security and consequential-mutation contract

The earlier "Manager-held short-lived key + opaque sandbox capability" design is no longer the selected baseline.

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

## Magda API usage

`mgd` uses the normal external Magda endpoint and normal API-key authentication; no Agent Manager Magda proxy is required.

Magda supports bearer API-key form:

```http
Authorization: Bearer <apiKeyId>:<apiKey>
```

DSH uses that same bearer credential when calling Magda LLM Services.

The key is stored on the sandbox PVC, not baked into the image and not placed in claim metadata/environment.

## Role/user changes

Because calls go through normal Magda authentication/authorisation:

- role/permission changes take effect according to normal Magda authorisation behavior;
- a disabled/invalid user/key is rejected by normal Magda auth;
- Agent Manager does not cache an independent delegated permission set.

Sandbox lifecycle cleanup is still responsible for revoking the system-managed key when the sandbox is permanently removed.

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

## Explicit security trade-off

The sandbox is arbitrary-code execution and has public egress. Therefore a Magda API key readable by DSH/model-controlled tools must be treated as potentially exfiltratable during the sandbox lifetime.

The chosen lifecycle reduces persistence of an abandoned credential (delete/revoke on logout/new session/hard idle deletion), but does not prevent an active malicious/prompt-injected workload from reading and exporting it.

This is an intentional trade-off of the simpler direct-`mgd` model and must be represented in threat modelling.

## Unresolved: mutation approval boundary

The remaining blocking question is consequential mutation approval.

#3811 requires server-enforced approval for destructive/publishing/consequential operations. A normal user-scoped Magda API key in the sandbox can currently authenticate direct mutation requests to the external Magda Gateway.

A reserved human-readable API-key name is not sufficient enforcement. The design needs a mechanism such as:

- an agent-managed credential type/context that Magda auth/OPA can distinguish and constrain;
- propagation of authenticated API-key identity/attributes into authorisation context;
- an approval-grant mechanism that temporarily authorises a specific consequential operation;
- or another constrained-delegation design.

Until that mechanism is settled, #3825 must remain open and mutation-capable implementation must not assume DSH prompt/UI confirmation is a security boundary.

## Network assumptions

The credential design assumes:

- sandbox egress may reach public Internet;
- cluster-internal/private/link-local/cloud-metadata addresses are denied except explicit infrastructure such as DNS;
- Magda APIs and LLM APIs are called through the external Magda endpoint;
- sandbox ingress is limited to the Agent Manager/approved DSH proxy path.

Network restrictions reduce lateral/cluster risk but do not make the sandbox-held Magda API key non-exfiltratable.
