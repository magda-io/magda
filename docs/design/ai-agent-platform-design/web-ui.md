# Web and product integration design

**Status:** Draft  
**Owner ticket:** TBD — later design slice  
**Depends on:** #3823 Agent Manager, #3824 DSH routing, mutation approval/skills as relevant  
**Blocks:** Magda web-client agent implementation  
**Evidence:** Current Magda web client and DSH frontend behaviour

> This document contains the current design baseline inherited from the original #3819 monolith. Unless a statement is already an explicit architecture-level decision in the overview, treat it as a hypothesis to review under the owner ticket rather than an implementation contract.

#### Magda web client

The web client owns:

- the Agent entry point;
- provisioning/recovery/reset UX;
- user-visible lifecycle state;
- explicit mutation approval UI;
- personal skill management;
- the transition between the current WebGPU assistant and the v8 server agent.

The first v8 release should reuse the DSH web application as much as practical rather than reimplementing its conversation/tool UI. Magda-specific chrome and controls can wrap the proxied DSH surface.

The production UI should hide/disable DSH's generic human terminal and unrestricted workspace picker by default:

- the PoC showed the human web terminal is outside DSH's bubblewrap command confinement;
- the workspace picker can browse DSH internal state such as `$DSH_HOME`.

The agent itself still uses DSH's tool interface. Trusted developer deployments may opt into the terminal for debugging.

#### Magda Gateway

Gateway remains the external same-origin entry point.

Agent Manager's browser/control routes are configured as authenticated gateway routes so the service receives the normal signed `X-Magda-Session` identity used by other Magda services.

No Sandbox Service, Pod IP, DSH token or Agent Manager internal-agent endpoint is exposed externally.

## Migration from the current WebGPU agent

Do not remove the current browser/WebGPU agent at the beginning of v8.

Recommended transition:

1. keep current WebGPU agent available as a lightweight/local feature;
2. add the v8 Agent Platform behind its own feature flag/entry point;
3. gather production evidence on reliability/cost/security;
4. decide later whether the WebGPU mode remains as a privacy/local option or is deprecated.

This avoids making v8 adoption depend on immediate feature parity.

The web design should consume stable lifecycle/routing/auth contracts rather than inventing them. Provisioning, reconnect, reset and approval UX must reflect the server-side state machine.
