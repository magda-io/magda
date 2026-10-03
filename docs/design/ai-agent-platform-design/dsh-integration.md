# DSH integration, bridge and browser routing

**Status:** Draft  
**Owner ticket:** #3824  
**Depends on:** #3822; coordinates with #3823  
**Blocks:** runtime image, bridge/bootstrap implementation, browser proxy implementation  
**Evidence:** #3812 / PR #3817 DSH/gVisor observations

> This document contains the current design baseline inherited from the original #3819 monolith. Unless a statement is already an explicit architecture-level decision in the overview, treat it as a hypothesis to review under the owner ticket rather than an implementation contract.

#### Agent Sandbox

One Agent Sandbox corresponds to one agent session generation.

Each Sandbox Pod contains at least:

1. **agent container**
   - DSH;
   - `mgd`;
   - Python and approved analysis tools;
   - trusted global skills;
   - DSH/Magda integration plugin;
   - session workspace/PVC mount.

2. **bridge sidecar**
   - exposes the DSH loopback listener to Agent Manager on a Pod port;
   - provides health/bootstrap coordination;
   - does not execute user/model commands;
   - holds any bridge bootstrap secret separately from the agent container.

Containers share the Pod network namespace, so the bridge can reach DSH at `127.0.0.1:3080` while Agent Manager reaches the bridge through the sandbox's headless Service.

The bridge is not a replacement security boundary for DSH. NetworkPolicy and DSH authentication remain required.

## Browser-to-DSH routing and authentication

### Addressing

Production path:

```text
browser
  -> Magda Gateway
  -> Agent Manager
  -> Sandbox headless Service :8080
  -> bridge sidecar
  -> DSH 127.0.0.1:3080
```

The bridge exists because DSH's shipped CLI intentionally binds loopback, and the PoC confirmed external Pod/port-forward traffic cannot directly reach the gVisor loopback netstack.

### DSH browser credential handling

DSH currently uses:

- a per-process launch token;
- a persistent DSH_HOME signing secret;
- an authority-bound browser cookie.

The launch token is sensitive and must not become a durable URL in Agent Manager logs or browser history.

Production behaviour:

1. a small DSH launcher wrapper captures the startup token without logging it;
2. it writes readiness/token state to an in-Pod bootstrap channel consumed by the bridge;
3. Agent Manager requests the token from the bridge over its trusted control connection;
4. Agent Manager performs the DSH token-to-cookie exchange server-side;
5. Agent Manager stores the resulting upstream DSH cookie in memory/cache;
6. browser requests remain authenticated by the normal Magda session;
7. Agent Manager injects the DSH cookie on upstream HTTP/WebSocket requests.

The browser never receives the DSH launch token or DSH cookie.

If Agent Manager restarts, it can reacquire the current process token from the bridge and repeat the exchange.

If DSH restarts, the launch token changes but its signing secret remains on the PVC, so existing DSH cookies may remain valid. Agent Manager nevertheless treats a 401 as a signal to reacquire upstream auth.

The PoC's "read token from Pod logs and put it in the browser URL" flow is explicitly **PoC-only**.

### Host/Origin

Agent Manager presents one stable internal authority to DSH and rewrites upstream Host/Origin consistently.

DSH's Host/Origin/browser-auth fences remain active; the proxy does not disable them.

## DSH version and integration policy

Pin DSH in the agent runtime image.

Upgrading DSH is treated like upgrading an execution runtime and requires the local runc + gVisor integration suite plus production qualification on the supported GKE/gVisor and AKS/Kata profiles before release.

Magda-specific integration should live in a small DSH plugin/profile plus the bridge/launcher rather than a large permanent fork.

Known PoC constraints to keep visible:

- gVisor + bubblewrap: confined bash has no PTY;
- the human DSH web terminal is outside bubblewrap command confinement;
- `read-only` bash is approval-heavy in DSH 0.2.0-rc.2;
- DSH CLI binds loopback by design;
- DSH browser launch token must be moved out of logs for production.

Where possible, upstream generic hooks should be proposed to DSH rather than carrying Magda-only patches.

## Design questions owned by #3824

The current bridge-sidecar and proxy design is promising but must be treated as a proposal until #3824 settles:

- how DSH launch/auth material is captured without logs;
- bridge responsibilities and trust boundary;
- HTTP/WebSocket routing;
- Host/Origin/CSRF handling;
- DSH restart/re-authentication;
- readiness/degraded semantics;
- inner confinement expectations across runc/gVisor/Kata;
- which DSH UI features are disabled in production.
