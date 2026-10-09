# DSH integration, bootstrap and browser routing

**Status:** Accepted  
**Owner ticket:** #3824  
**Depends on:** #3822; coordinates with #3823, #3825 and #3838  
**Evidence:** #3841 / draft PoC PR #3844  
**Blocks:** DSH runtime image/browser proxy implementation

#3841 qualified the browser/runtime integration end to end in local Minikube under both runc and gVisor. The accepted contract below replaces the earlier loopback-listener/bridge-sidecar proposal.

## Runtime image and profile

Each Sandbox contains DSH, `mgd`, approved analysis tools and a Magda-specific DSH profile/plugin composition.

DSH is pinned by version in the runtime image. The exact implementation release must be re-qualified when upgraded; the design contract is the required capability set rather than a permanent dependency on the `0.2.1-alpha.1` build used by #3841.

Prefer profile/plugin composition over a permanent Magda fork. A fork is justified only if a required product/security behavior cannot be expressed through DSH's supported composition surfaces.

The Magda profile:

- binds the underlying `@deepseek-ai/dsh-host-webserver` row to `0.0.0.0:3080`;
- supplies the external Magda `publicUrl` and trusted Host configuration;
- supplies centrally managed provider/model/reasoning configuration;
- hides/disables generic provider/model/plugin-management surfaces where supported;
- defaults new sessions to `workspace-write`;
- hides the persistent `danger-full-access` selection in the managed Magda UI.

`workspace-write` is the managed default. DSH's normal per-action approval flow remains available; hiding the persistent Full Access selector does not change the outer gVisor/Kata security boundary.

## Warm-start behavior

DSH starts in every generic warm Sandbox before a user is assigned.

Warm state contains:

- DSH running;
- `mgd` installed;
- common trusted tools/skills;
- clean dedicated PVC/workspace;
- no user-specific Magda credential.

The WarmPool may create the Sandbox, Pod, PVC and DSH process before the eventual `SandboxClaim` exists. A claim adopts that existing Sandbox without restarting DSH. Agent Manager always resolves the runtime through `claim.status.sandbox.name`.

#3841 verified that stock DSH authentication still works when the launch token was created before the user/claim existed.

## Post-claim bootstrap

After claim/adoption, Agent Manager runs a purpose-built bootstrap helper via Kubernetes exec and passes secret material on stdin.

Bootstrap configures:

- PVC-backed `mgd` profile, e.g. via `XDG_CONFIG_HOME=/workspace/.config`;
- DSH provider/base URL pointing to the external Magda LLM Services endpoint;
- the same Magda API-key bearer value for DSH's managed LLM provider;
- default model;
- default reasoning effort;
- any non-secret user/sandbox config required by the Magda DSH profile.

The browser is not routed to DSH until bootstrap succeeds.

## LLM configuration

DSH sees Magda as the provider facade rather than direct OpenAI/Anthropic/AWS/Azure credentials.

Conceptually:

```text
provider: magda
base URL: https://<magda-external>/api/v0/llm/v1
credential: <magda-api-key-id>:<magda-api-key>
model: deployment-selected Magda model alias
reasoning effort: deployment-selected
```

Real provider credentials remain in Magda LLM Services/LiteLLM.

## Browser routing

Accepted path:

```text
Browser
  -> Ingress / external load balancer
  -> Magda Gateway
  -> Agent Manager authenticated DSH proxy
  -> Sandbox Service
  -> DSH :3080
```

No Sandbox Service/Pod address is exposed to the browser.

There is **no bridge sidecar**. #3841 verified direct Sandbox Service -> DSH reachability under both runc and gVisor when the Magda profile binds DSH to the Pod network.

Sandbox NetworkPolicy remains default-deny and permits DSH ingress only from Agent Manager/approved proxy components.

## Transport

Keep DSH's native transport:

- ordinary HTTP for unary RPC/fetch calls;
- one multiplexed WebSocket at `/api/remote.mux` for Remote streams.

Do not replace it with SSE.

The full Minikube chain was exercised through TLS ingress, Magda Gateway, Agent Manager and Sandbox Service, including streaming, cancellation, tool activity, terminal interaction, refresh/reconnect, Gateway/Agent Manager restart, DSH restart and Sandbox suspend/resume.

Magda Gateway WebSocket support is the reusable route-level capability implemented by #3843 and carried to `next` by #3845.

## Magda browser identity boundary

`X-Magda-Session` terminates at Agent Manager.

```text
Browser
  -> Magda Gateway
       authenticates browser
       attaches X-Magda-Session
  -> Agent Manager
       verifies Magda user
       resolves user -> SandboxClaim -> Sandbox
       strips Magda auth/session headers
  -> DSH
```

DSH and the Sandbox never receive:

- `X-Magda-Session`;
- browser Magda session cookies;
- external `Authorization`;
- `X-Magda-API-Key(-Id)`;
- `Proxy-Authorization`.

The separate system-managed Magda API key inside the Sandbox is used only for Sandbox -> external Magda API/LLM calls.

WebSocket authentication occurs at the HTTP upgrade handshake. No periodic re-authentication of an already-open mux is required for the MVP. Explicit logout/session termination deletes the Sandbox; Agent Manager must promptly close active proxy sockets for that Sandbox rather than waiting only for Kubernetes teardown.

## DSH browser authentication

### MVP: stock launch-token / signed-cookie authentication

Keep stock upstream DSH browser authentication for the MVP as defence in depth.

The browser never receives the DSH launch token or DSH cookie.

A small wrapper in the Magda agent image:

1. starts `dsh web`;
2. captures the process launch token from DSH's startup URL;
3. writes it atomically to `/run/magda-agent/dsh-launch-token`;
4. uses mode `0600` on a memory-backed `emptyDir`;
5. redacts the token from stdout/stderr before logs leave the Pod;
6. rewrites/removes the file appropriately on DSH restart.

Agent Manager reads the token using its already-required `pods/exec` permission, exchanges it server-side using the pinned external Host, and retains the authority-bound DSH cookie in memory.

Agent Manager does not need `pods/log` for DSH authentication.

The DSH signing secret is PVC-backed, so the current cookie survives ordinary DSH restart and Sandbox suspend/resume. If the signing secret changes or a fresh Sandbox is used, Agent Manager handles a DSH 401 by re-reading the current launch-token file and performing one re-exchange.

The process launch token is not single-use; independent Agent Manager replicas may redeem it and maintain independent in-memory cookie caches. No Redis/shared cookie store or sticky sessions are required by this design.

### Future: upstream trusted-proxy/browser-auth opt-out

Discussion deepseek-ai/deepseek-harness#8528's `browserAuth=false` approach was tested successfully in #3841, including Host/Origin fencing and NetworkPolicy assumptions.

It is not currently an upstream supported feature. Do not carry the fork by default.

If upstream ships an equivalent trusted-proxy/browser-auth opt-out, Magda may switch Agent Manager to that simpler mode and remove the launch-token/cookie machinery after re-qualification.

## DSH persistence and restart

PVC state contains DSH home/session state and workspace.

DSH process restart or Sandbox resume starts a new process against the same durable state. The platform does not promise preservation of arbitrary child-process memory.

A user can ask the restarted DSH agent to inspect existing session/workspace state and continue/restart interrupted work.

## DSH workspace/session initialization

Agent Manager owns Sandbox lifecycle, not normal creation of DSH logical conversation sessions.

The normal path is:

```text
Agent Manager
  -> provision/adopt Sandbox
  -> bootstrap
  -> expose DSH

DSH Web
  -> workspace/initializeDefault
  -> session/create({ workspaceId })
```

Do **not** create a DSH session without `workspaceId` on a fresh runtime. #3841 found that a bare `session/create` places the session in the process cwd/"Ungrouped", makes `workspace/initializeDefault` ineligible, and can leave the browser unable to start its normal Default-workspace draft.

If a future backend feature intentionally creates DSH sessions, it must first initialize/resolve the intended Workspace and pass its `workspaceId`.

## Session permission policy

For the managed Magda Agent:

- new sessions default to `permission/preset = workspace-write`;
- sandbox mode defaults to `workspace-write`;
- approval policy defaults to `ask`;
- the managed UI hides the persistent `danger-full-access` selection.

#3841 verified the three default values through the DSH API and persisted session journal.

The default assertion should remain part of DSH image/version qualification so an upstream change cannot silently change the managed security posture.

## Host / Origin / CSP

Agent Manager pins/restores the configured browser-facing external Host rather than trusting an incoming internal Host.

Browser Origin / relevant `Sec-Fetch-*` headers pass through so DSH can enforce its Host/Origin fence.

Magda Gateway separately validates WebSocket Origin for opted-in WebSocket routes.

The tested DSH Web UI currently requires a path-scoped CSP relaxation:

```text
script-src 'self' 'unsafe-inline' 'unsafe-eval'
```

for the agent runtime mount only. This is tracked by #3846. Unrelated Magda routes must retain the normal strict CSP.

## Ingress / provider qualification

Local ingress-nginx qualification is complete in #3841. Production Helm must configure suitable long-lived WebSocket timeouts; tracked by #3847.

GKE production qualification, including provider backend timeout policy and gVisor, is tracked by #3848.

These are deployment/implementation follow-ups and do not reopen the accepted #3824 integration contract.

## Known runtime constraints

Keep the #3812/#3841 findings visible in qualification:

- gVisor + DSH inner confinement behavior differs from runc;
- human terminal/workspace-picker surfaces can bypass the intended agent command UX and should remain hidden/disabled in normal production UI;
- DSH settings forms may have different persistence behavior away from loopback; Magda-owned provider/model configuration remains authoritative;
- runtime qualification is required separately for GKE/gVisor and AKS/Kata.
