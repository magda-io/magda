# DSH integration, bootstrap and browser routing

**Status:** Proposed  
**Owner ticket:** #3824  
**Depends on:** #3822; coordinates with #3823 and #3825  
**Blocks:** final runtime image/browser proxy implementation

Most of the integration contract is settled. The remaining design verification is the exact browser-auth/bridge behavior of the pinned DSH release.

## Runtime image and profile

Each Sandbox contains DSH, `mgd`, approved analysis tools and a Magda-specific DSH profile/plugin composition.

DSH is pinned by version in the runtime image.

Prefer profile/plugin composition over a permanent Magda fork. A fork is justified only if a required product/security behavior cannot be expressed through DSH's supported profile/plugin surfaces.

The Magda profile should disable user-facing generic provider controls that conflict with centrally managed configuration, including the model selector/model settings and plugin-management surfaces where supported. The deployment supplies the default provider/model/reasoning effort.

## Warm-start behavior

DSH can and should start in every generic warm sandbox before a user is assigned.

Warm state contains:

- DSH running;
- `mgd` installed;
- common trusted tools/skills;
- clean PVC/workspace;
- no user-specific Magda credential.

DSH does not require the Magda API key to start.

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

## DSH persistence and restart

PVC state contains DSH home/session state and workspace.

DSH process restart or Sandbox resume starts a new process against the same durable state. The platform does not promise preservation of arbitrary child-process memory.

A user can ask the restarted DSH agent to inspect existing session/workspace state and continue/restart interrupted work.

## Browser routing

The external path remains:

```text
Browser
  -> Magda Gateway
  -> Agent Manager authenticated DSH proxy
  -> Sandbox Service / bridge
  -> DSH
```

No Sandbox Service/Pod address is exposed to the browser.

### Bridge status

The current pinned/PoC DSH behavior binds its web listener to loopback. Under gVisor/Kata, host-side port-forward assumptions do not work reliably. The existing bridge-sidecar proposal remains the preferred portable boundary:

- bridge shares the Sandbox Pod network namespace;
- bridge reaches DSH on loopback;
- bridge exposes only the required DSH HTTP/WebSocket port to the Sandbox Service;
- NetworkPolicy allows only Agent Manager/approved proxy ingress.

The bridge does not execute model/user commands and is not a substitute for sandbox isolation.

## Remaining #3824 verification

Before marking this document Accepted, verify the pinned DSH release's exact browser-auth contract:

- how the DSH launch/bootstrap token can be captured without logs/browser exposure;
- whether Agent Manager should exchange it server-side for an upstream DSH cookie;
- Host/Origin/CSRF/WebSocket behavior through the same-origin proxy;
- behavior when DSH restarts while the Sandbox/PVC remains;
- whether any newer DSH-supported listen/proxy/auth hook can remove or simplify the bridge.

The earlier #3819 server-side token/cookie exchange remains a reasonable proposal, but it should be tested against the pinned DSH version rather than treated as settled only from the architecture discussion.

## Known runtime constraints

Keep the #3812 findings visible in qualification:

- gVisor + DSH inner confinement behavior differs from runc;
- human terminal/workspace-picker surfaces can bypass the intended agent command UX and should be hidden/disabled in normal production UI;
- runtime qualification is required separately for GKE/gVisor and AKS/Kata.
