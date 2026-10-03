# Mutation approval design

**Status:** Draft  
**Owner ticket:** TBD — later design slice  
**Depends on:** #3823 Agent Manager and #3825 delegated auth  
**Blocks:** authorised create/edit/publish implementation and audit semantics  
**Evidence:** Current Magda authorisation/mgd behaviour; focused experiments as required

> This document contains the current design baseline inherited from the original #3819 monolith. Unless a statement is already an explicit architecture-level decision in the overview, treat it as a hypothesis to review under the owner ticket rather than an implementation contract.

## Mutation approval model

The final v8 system must not rely only on prompt text saying "ask before publishing".

Agent Manager's Magda proxy is the enforcement point because direct authenticated Magda access from the sandbox is blocked.

Proposed protocol:

1. the agent/`mgd` prepares a proposed mutation invocation;
2. the UI shows a human-readable summary;
3. the user approves;
4. Agent Manager issues a short-lived, single-session mutation grant;
5. `mgd` includes the grant on the mutating requests for that invocation;
6. Agent Manager validates method/path/session/invocation and forwards;
7. the grant expires or is consumed.

`mgd` already emits an invocation identifier for mutating requests, which should be reused to bind a grant to one command/workflow.

A later implementation ticket must define the exact grant scope for multi-request operations such as dataset creation/publish.

Until that ticket lands, production agent Magda access remains read-only.

This area intentionally remains separate from authentication. Authentication answers **who/what authority the sandbox has**; mutation approval answers **how a high-consequence operation receives explicit, server-enforced user approval**.
