# Mutation confirmation design

**Status:** Proposed  
**Owner ticket:** TBD — later product/DSH integration slice  
**Depends on:** #3824 DSH integration and the accepted #3825 credential model  
**Blocks:** polished consequential-action UX, not basic authorised mutation capability

## Initial v8 contract

The Magda agent acts on behalf of the authenticated user and carries a normal user-scoped Magda API key.

Consequential-action confirmation is therefore an **agent interaction / product-safety contract**, not a separate server-side delegated-authority protocol.

Magda auth/OPA remains the hard permission boundary: if the user is not authorised to perform an operation, the agent is not authorised either.

## Current `mgd` behavior

The bundled `mgd` coding-agent skill already requires explicit user confirmation before mutations/publishing.

The core rule covers, among other operations:

- dataset create/publish;
- dataset/distribution update;
- file add/replace/upload;
- aspect create/set/patch/delete;
- raw POST/PUT/PATCH/DELETE via `mgd api request`.

The agent should present a concise description of the proposed change, obtain explicit confirmation in the conversation, then execute it.

This is the initial required behavior.

## DSH permission model

Do not rely on the name `workspace-write` to imply API-side-effect approval.

DSH's workspace sandbox governs filesystem effects. Network access is outside that mode, so:

```text
mgd dataset update ...
```

can execute successfully while remaining inside the filesystem workspace boundary.

DSH's `ask` policy is a generic approval mechanism used by tools that explicitly request approval (for example, sandbox permission escalation). It does not infer that an arbitrary outbound HTTP request is a consequential Magda mutation.

## Recommended product enhancement

A later Magda DSH integration may route mutating `mgd` operations through DSH's general approval seam so the Web UI can render a structured one-shot approval card, e.g.:

```text
Update dataset magda-ds-...
- title: ...
- keywords: ...

[Cancel] [Allow once]
```

This improves consistency, auditability and resistance to accidental execution.

However, it is **not** treated as a non-bypassable security boundary in the initial threat model: the sandbox has shell/network access plus the user's API key, so raw API calls are technically possible.

## Security position

The initial v8 guarantees are:

- the agent has no more Magda authority than the authenticated user;
- normal Magda auth/OPA enforces user permissions;
- the supplied Magda agent guidance requires confirmation before consequential operations;
- DSH/product integration should make such confirmations clear and hard to miss;
- infrastructure/tenant boundaries are enforced independently by gVisor/Kata/NetworkPolicy.

The initial v8 does **not** guarantee that a compromised or prompt-injected agent cannot bypass its own confirmation instructions while possessing the user's credential.

A future deployment requiring that stronger guarantee would need constrained delegated credentials and/or a server mediation/grant boundary.
