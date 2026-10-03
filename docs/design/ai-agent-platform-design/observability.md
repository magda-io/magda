# Observability and audit design

**Status:** Draft  
**Owner ticket:** TBD — later cross-cutting design slice  
**Depends on:** Lifecycle/auth/mutation contracts  
**Blocks:** metrics, operational dashboards, audit/event implementation  
**Evidence:** Existing Magda observability patterns plus PoC measurements

> This document contains the current design baseline inherited from the original #3819 monolith. Unless a statement is already an explicit architecture-level decision in the overview, treat it as a hypothesis to review under the owner ticket rather than an implementation contract.

## Observability and audit

Agent Manager exposes metrics such as:

- active sessions by state/runtime;
- provisioning/ready latency;
- Sandbox restarts/OOMs;
- DSH readiness;
- Magda proxy request counts/latency/status;
- LLM requests/tokens/cost where available;
- skill CRUD;
- reset/cleanup failures.

The PoC found the existing Magda authorisation path becomes a bottleneck under concurrent agent API loops. Production sizing must include `authorization-api` and registry scaling/rate limits.

Audit events for consequential operations should record:

- user/session id;
- timestamp;
- `mgd` invocation id where present;
- method/route/record identifiers;
- approval grant id;
- result.

Do not centralise prompt bodies, downloaded data, API keys or provider secrets in normal operational logs.

Observability must not become a credential, prompt, downloaded-data or private-dataset exfiltration path. Audit semantics for consequential mutations depend on the later mutation-approval contract.
