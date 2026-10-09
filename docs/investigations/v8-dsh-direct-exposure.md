# PoC: direct DSH Web exposure and proxy integration without a bridge sidecar

Issue: [#3841](https://github.com/magda-io/magda/issues/3841) · Parent: [#3824](https://github.com/magda-io/magda/issues/3824) · Epic: [#3810](https://github.com/magda-io/magda/issues/3810) · Design: [#3811](https://github.com/magda-io/magda/issues/3811) / [#3819](https://github.com/magda-io/magda/pull/3819) · Builds on: [#3812](./v8-agent-sandbox-minikube.md) · Branch: `next` (v8)

> **Status: complete** (2026-10-08). Every experiment ran in a local Minikube cluster through the real chain
> `Chrome → ingress-nginx (TLS) → magda-gateway → Agent Manager proxy PoC → Sandbox Service → DSH`,
> under both runc and gVisor, and with both DSH browser-auth variants.

Reproduction material: [`deploy/poc/dsh-direct-exposure/`](../../deploy/poc/dsh-direct-exposure/). Raw results: [`deploy/poc/dsh-direct-exposure/results/`](../../deploy/poc/dsh-direct-exposure/results/).

## Recommendation

- **Bridge: A — direct DSH, no bridge.** A Magda DSH profile patch binds the DSH webserver row to `0.0.0.0:3080` without touching DSH source. The controller-managed Sandbox Service reaches it directly under runc and gVisor. The template NetworkPolicy limits ingress to the Agent Manager.
- **DSH auth for MVP: keep the stock launch-token/cookie flow, held server-side by Agent Manager.** The browser never sees a DSH token or cookie. Agent Manager reads the launch token, redeems it with the external authority, keeps the authority-bound cookie and injects it upstream. The cookie survives DSH restarts and Sandbox suspend/resume, because DSH keeps the signing secret on the PVC.
  - The #8528 `--no-browser-auth` port works fully through the same chain (all checks pass) and is the simpler end state.
  - It is fork-only. The upstream release has nothing equivalent.
  - **Contribute/wait for an upstream equivalent rather than carry the patch.** Switch Agent Manager to `AUTH_MODE=none` when upstream ships it. Carrying the 148-line port is a reasonable fallback if upstream never does (see [Comparison](#experiment-5--stock-auth-vs-discussion-8528)).
- **magda-gateway needed a small reusable change**: opt-in `websocket: true` per proxy route. It is merged to `main` as [#3843](https://github.com/magda-io/magda/pull/3843) and on `next` via [#3845](https://github.com/magda-io/magda/pull/3845). It validates the handshake's `Origin` by default (only the origin of `global.externalUrl`), so cross-site WebSocket handshakes are rejected before they reach Agent Manager or DSH.
- **Two non-transport gateway/chart changes are also required:**
  - a per-path CSP for the agent mount: DSH's UI needs `script-src 'unsafe-inline' 'unsafe-eval'`;
  - Ingress annotation/BackendConfig support for long-lived WebSockets.
- **No SSE fork of DSH is needed.**

## TL;DR — findings

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Impact                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| D1  | **Direct bind works through supported composition.** The stock CLI rejects `--host 0.0.0.0`. A `--patch` overlay that replaces the `webserver` row's config (`host: 0.0.0.0, port: 3080`) binds all interfaces with no source change. DSH then also adds the Pod IP literal to its Host fence ("LAN" trust sampling).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Bridge/relay sidecar can be removed.                                                        |
| D2  | **Sandbox Service → Pod:3080 → DSH works under runc and gVisor.** Agent Sandbox v1.0.4 `spec.service: true` creates a headless Service per Sandbox (`status.serviceFQDN`). The kubelet's TCP readiness probe to Pod IP:3080 passes under gVisor. #3812's loopback problem disappears once DSH listens on the Pod network.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | No bridge needed on either runtime.                                                         |
| D3  | **The template NetworkPolicy works as the access boundary.** It admits only `magda-agent-manager` Pods on 3080. Blocked: other Pods in the namespace, the gateway Pod, and other sandboxes. A sandbox can reach its _own_ Service (hairpin; NetworkPolicy never applies to a Pod's own traffic).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Required, and sufficient, for both auth variants.                                           |
| D4  | **Current magda-gateway (7.0.0 / `next`) does not support WebSockets.** Executable test: the Upgrade request is handled as a plain GET by `proxy.web`. It reaches Agent Manager and DSH answers 101. The gateway's upstream `ClientRequest` has no `upgrade` listener, so the 101 is dropped, and the browser gets **no response** (hangs).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Gateway change required.                                                                    |
| D5  | **Minimal reusable gateway change** ([#3843](https://github.com/magda-io/magda/pull/3843), merged): <ul><li>A `server.on("upgrade")` dispatcher runs WebSocket handshakes through the normal Express app, with a placeholder response bound to the socket. Session/API-key auth, access control, tenant handling and route matching therefore apply unchanged.</li><li>A route opts in with `websocket: true`; `proxy.ws()` then forwards with the same path/credential-header handling and `X-Magda-Session`.</li><li>The handshake `Origin` must match `websocketAllowedOrigins` (default: the origin of `global.externalUrl`; `[]` disables the check), otherwise 403.</li><li>Rejections before upgrade are plain HTTP responses. The upstream has `websocketHandshakeTimeout` (default 60 s) to answer, or the client gets a 504. Upgraded sockets are closed on SIGTERM.</li><li>45 WebSocket tests; the full gateway suite (396) passes.</li></ul> | Opt-in, no DSH specifics.                                                                   |
| D6  | **Full chain works with DSH's existing transport:** HTTP unary RPC + one `/api/remote.mux` WebSocket. Verified for: <ul><li>index and assets;</li><li>one physical socket carrying 3–7 logical streams;</li><li>server→browser streaming;</li><li>cancellation;</li><li>tool activity;</li><li>terminal;</li><li>browser refresh on the public mount;</li><li>reconnect after Agent Manager restart, gateway rolling restart, DSH restart and Sandbox suspend/resume.</li></ul> All under runc and gVisor, both auth variants.                                                                                                                                                                                                                                                                                                                                                                                                                            | **No SSE fork.**                                                                            |
| D7  | **The browser→server direction of the mux only carries control frames** (`open`/`cancel`) in DSH 0.2.1-alpha.1's web UI. Prompts and terminal keystrokes are unary HTTP RPCs (`POST api/session/prompt`, `POST api/terminal/write`); their output streams back on the mux.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Proxies need HTTP + WS downlink; no WS uplink data path to worry about.                     |
| D8  | **`publicUrl` + `trustedHosts` work behind the Magda mount** (`https://magda.test:18443/api/v0/agent/runtime/`). <ul><li>DSH serves `<base href="./">` and only document-relative URLs, so no asset or WebSocket URL escapes the mount.</li><li>`--public-url` is only in **0.2.1-alpha.1** (not the #3812 pin, 0.2.0-rc.2).</li></ul>                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Pin ≥ 0.2.1-alpha.1.                                                                        |
| D9  | **DSH's UI does not run under magda-gateway's default CSP.** The index has 9 inline boot scripts, and the client module loader uses string evaluation. The gateway's global `script-src 'self'` gives a blank page. Fixed with a gateway `helmetPerPath` entry for the agent mount (`'unsafe-inline' 'unsafe-eval'`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Chart/config change; security note for the design.                                          |
| D10 | **Stock DSH auth, #8528 authority issue reproduced on 0.2.1-alpha.1.** <ul><li>The launch token redeems at _any_ Host.</li><li>The cookie it mints is bound to that Host authority.</li><li>Exchange and use at different authorities → 401.</li><li>A proxy that does not strip the prefix → 401.</li></ul> Not reproduced when the proxy pins one external authority and strips the prefix.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Agent Manager must pin Host.                                                                |
| D11 | **A browser-held DSH cookie cannot work behind magda-gateway.** The gateway strips `Cookie` (and `Authorization`) from every proxied request. The token exchange succeeds (and the cookie can be rewritten to `Path=<mount>; Secure`), but the next request is 401. It would also hand the launch token to the browser.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Stock auth must be server-side (Agent Manager) — or off (#8528).                            |
| D12 | **Server-side exchange is robust.** Agent Manager reads the token from the Pod log (RBAC `pods/log`), redeems it and caches the cookie per Sandbox. 0 re-exchanges after DSH restart (new launch token, same PVC secret) or Sandbox suspend/resume. A new Sandbox (new PVC) gets a 401 once and is re-exchanged automatically.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Needs `pods/log` read, or a future DSH token hand-off hook.                                 |
| D13 | **#8528 `--no-browser-auth` ported to 0.2.1-alpha.1 works.** <ul><li>The functional commit cherry-picks onto 0.2.1-alpha.1 with conflicts only in comments, help text and READMEs (the new `--public-url`).</li><li>Runtime port = 148-line patch to two compiled packages.</li><li>Security checks pass through the full chain: token-free URL, no `.credentials.yaml`, undeclared Host → 403 on index/API/WS, foreign Origin → 403.</li></ul>                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Viable; fork-only.                                                                          |
| D14 | **The DSH Host/Origin fence is not access control.** In browser-auth-off mode any peer that can reach :3080 and sends `Host: 127.0.0.1` is fully admitted (loopback is always trusted).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | NetworkPolicy (D3) is the real boundary for #8528 mode.                                     |
| D15 | **Ingress-nginx: DSH's 2 s WebSocket ping already defeats the 60 s `proxy-read-timeout`.** <ul><li>Default heartbeat: idle socket open for 300 s (150 pings).</li><li>Counterfactual with a 120 s heartbeat: cut at exactly 60 s (TCP close, no close frame).</li><li>The same counterfactual survives 150 s with `proxy-read-timeout`/`proxy-send-timeout: 3600`.</li></ul>                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Recommend the annotations as defence in depth. The Magda ingress chart cannot set them yet. |
| D16 | **GKE Ingress (classic ALB) closes WebSockets at the backend-service timeout, idle or active (default 30 s).** It needs a `BackendConfig` `timeoutSec` (not testable locally).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Helm support for BackendConfig; GKE qualification follow-up.                                |
| D17 | **No supported DSH seam replaces browser auth.** `BrowserAuth.create(...)` is hard-wired in the `client-connection` plugin; there is no auth-provider/admission hook. Upstream `master` == `dsh-v0.2.1-alpha.1` (2026-10-08); #8528 has no maintainer response.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Patch, replacement package or upstream change only.                                         |
| D18 | Incidental: on Linux DSH resolves the default Workspace via `xdg-user-dir DOCUMENTS` (absent in containers) → "Unable to create default workspace". Fixed in the Magda profile (`workspace-controller.documentsDirectory: /data/workspace`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Profile setting for the production image.                                                   |

## Environment

| Item          | Value                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host          | macOS, Apple Silicon (arm64); Docker Desktop 5 CPUs / 14.6 GiB                                                                                                            |
| Minikube      | v1.38.1, profile `magda-agent-poc`, driver `docker`, runtime containerd 2.2.1, Kubernetes v1.35.1, CNI kindnet (enforces NetworkPolicy), 5 CPUs / 12 GiB                  |
| Host access   | node ports 443/80 published as `127.0.0.1:18443/18080` (`minikube start --ports`), so the browser reaches the real ingress without `kubectl port-forward`                 |
| Ingress       | minikube `ingress` addon, ingress-nginx controller v1.14.3; self-signed `magda.test` certificate as the default certificate; chart-rendered Ingress                       |
| gVisor        | `release-20260928.0` (pinned over the broken addon binary, as #3812 F1)                                                                                                   |
| Agent Sandbox | v1.0.4 core + extensions                                                                                                                                                  |
| Magda         | chart `magda` 7.0.0 + `magda-auth-internal` 4.0.0 (umbrella chart, minimal modules); gateway = 7.0.0 image + the compiled WebSocket change (`local/magda-gateway:ws-poc`) |
| DSH           | `@deepseek-ai/dsh@0.2.1-alpha.1` (npm, latest upstream release, == upstream `master` 5badb15009 on 2026-10-08); variant B adds the #8528 port                             |
| Model         | in-cluster deterministic OpenAI Chat Completions mock (`mock-llm/`), so streaming/cancellation tests need no provider credential                                          |
| Browser       | Google Chrome (Playwright `channel: chrome`, headless) on the host, `--host-resolver-rules=MAP magda.test 127.0.0.1`                                                      |

The default `minikube` profile (docker runtime, used for other Magda work) cannot run gVisor, so it was stopped, not deleted, while this profile ran.

## Experiment 1 — direct DSH bind from a Magda profile ✅

Magda profile overlay ([`image/magda.cordis.patch.yml`](../../deploy/poc/dsh-direct-exposure/image/magda.cordis.patch.yml)), applied with `dsh web --patch`:

```yaml
- id: webserver
  config:
    host: 0.0.0.0
    port: 3080
    compression: gzip
    compressionLevel: 1
    compressionThresholdBytes: 1024
```

- The stock `dsh-web-app` CLI provider rejects exactly `--host 0.0.0.0` ("intentionally not supported yet for safety"). The webserver row's shipped config is `host: !!js ctx.webStartup.host ?? '127.0.0.1'`.
  - A patch replaces a row's whole `config`, so the literal overlay binds all interfaces through the supported composition layer.
  - No CLI flag is involved, and no DSH source changes.
  - Consequence: `--host`/`--port` no longer affect that row.
- Evidence, in both runtimes:
  - `/proc/net/tcp` shows `00000000:0C08` (0.0.0.0:3080).
  - The process list is `tini` + `node dsh web …` only; no relay.
  - The startup line is `dsh web: https://magda.test:18443/api/v0/agent/runtime/?token=… (LAN: http://<podIP>:3080/?token=…)`.
- With an all-interfaces bind, DSH's LAN trust sampling adds the Pod IPv4 literal to the Host fence. `--trusted-host magda.test:18443` adds the external authority on top.
- DSH stays functional from inside the Pod. Agent bash, terminal, sessions and mgd all work, as exercised by the E2E tests.

## Experiment 2 — Sandbox Service reachability without the bridge ✅

[`manifests/30-sandbox-templates.yaml`](../../deploy/poc/dsh-direct-exposure/manifests/30-sandbox-templates.yaml) (generated by `scripts/render-sandbox-templates.sh`):

```yaml
spec:
  service: true # controller creates headless Service <sandbox>:3080
  networkPolicyManagement: Managed
  networkPolicy:
    ingress:
      - from:
          - podSelector:
              matchLabels: { app.kubernetes.io/name: magda-agent-manager }
        ports: [{ port: 3080, protocol: TCP }]
  podTemplate:
    spec:
      runtimeClassName: gvisor # omitted for the runc templates
      containers:
        - name: agent
          ports: [{ name: dsh, containerPort: 3080 }]
          readinessProbe: { tcpSocket: { port: 3080 } } # kubelet → Pod IP, also under gVisor
```

| Check                                                | runc (`bob-*`)                                                                                   | gVisor (`alice-*`, `4.19.0-gvisor`, `Starting gVisor...`) |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Claim → Ready                                        | ~5 s                                                                                             | ~6 s                                                      |
| Kubelet TCP probe → Pod IP:3080                      | ✅                                                                                               | ✅                                                        |
| Agent Manager → `<sandbox>.magda-agent-poc.svc:3080` | ✅ DSH answers                                                                                   | ✅ DSH answers                                            |
| mock-llm Pod (same namespace) → :3080                | blocked                                                                                          | blocked                                                   |
| magda gateway Pod (other namespace) → :3080          | blocked                                                                                          | blocked                                                   |
| other sandbox → :3080                                | blocked                                                                                          | blocked                                                   |
| own Service (hairpin)                                | reachable (NetworkPolicy never applies to self; the agent already shares DSH's loopback and UID) | same                                                      |

Full matrix: [`results/netpol-nba.txt`](../../deploy/poc/dsh-direct-exposure/results/netpol-nba.txt) (`tests/netpol.sh`). The Service is headless, so after suspend/resume the same FQDN resolves to the new Pod IP with no Agent Manager change.

**Pass:** both runtimes reach DSH directly through the Sandbox Service, and no bridge sidecar is required.

## Experiment 3 — reverse-proxy / public URL ✅

Route: `https://magda.test:18443/api/v0/agent/runtime/`. DSH is started with `--public-url https://magda.test:18443/api/v0/agent/runtime/ --trusted-host magda.test:18443`.

Proxy behaviour needed, and where it lives in this PoC:

| Requirement                                                | Implemented by                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TLS termination, WSS → WS                                  | ingress-nginx                                                                                                                                                                                                                                                      |
| Redirect bare mount `/api/v0/agent/runtime` → `…/runtime/` | gateway route `redirectTrailingSlash: true`                                                                                                                                                                                                                        |
| Magda authentication, `X-Magda-Session`                    | gateway route `auth: true` (+ optional `accessControl`)                                                                                                                                                                                                            |
| Forward WebSocket upgrades                                 | gateway route `websocket: true` (new); Agent Manager                                                                                                                                                                                                               |
| Strip the mount prefix                                     | gateway (route base) + Agent Manager (`/runtime`)                                                                                                                                                                                                                  |
| Preserve the browser-facing `Host`                         | Agent Manager pins `Host` to the configured external authority (the gateway proxies with `changeOrigin`, so the original Host is gone; pinning from config is also safer than trusting a forwarded header)                                                         |
| Preserve `Origin`, `Sec-Fetch-*`                           | passed through by gateway and Agent Manager. The gateway also rejects WebSocket handshakes whose `Origin` isn't the origin of `global.externalUrl` (route default `websocketAllowedOrigins`); here that is `https://magda.test:18443`, with no route config needed |
| Cookie `Path=<mount>`, `Secure`                            | only needed if the browser held a DSH cookie — it cannot behind magda-gateway (D11). Agent Manager drops DSH `Set-Cookie` in managed/none modes; `passthrough` mode demonstrates the rewrite                                                                       |
| Drop Magda headers before DSH                              | Agent Manager removes `X-Magda-Session`, `X-Magda-Tenant-Id`, API-key headers                                                                                                                                                                                      |

Results (`tests/e2e-browser.mjs`, all variants):

- index and static assets load;
- one `<base href="./">`, and every asset and the WebSocket (`wss://magda.test:18443/api/v0/agent/runtime/api/remote.mux`) stay under the mount;
- unary RPCs work;
- streaming, reconnect and refresh on the nested public URL all work.

`publicUrl` is display-only, so no frontend transport change was needed.

## Experiment 4 — end-to-end WebSocket qualification ✅

### 4A — magda-gateway

**Baseline (stock `magda-gateway:7.0.0`, same route).** The handshake gets no response for 15 s (client timeout).

- The gateway access log shows the request with no status.
- Agent Manager logs a successful upgrade to DSH that the gateway side then closed after 0 s (129 bytes = DSH's 101 response).

The mechanism:

1. There is no `server.on("upgrade")`, so Node hands the request to Express.
2. `proxy.web` forwards it with its `Upgrade` headers.
3. The upstream 101 arrives on a `ClientRequest` with no `upgrade` listener, and Node destroys the socket.

**Gateway change** ([#3843](https://github.com/magda-io/magda/pull/3843), merged to `main`, and to `next` via [#3845](https://github.com/magda-io/magda/pull/3845)):

- `WebSocketUpgradeHandler.ts` — `server.on("upgrade")` runs the handshake through the same Express app.
  - The app gets a placeholder `ServerResponse` bound to the raw socket. So the normal middleware chain runs, and anything that answers before a route claims the socket (401/403/404/redirect/error) reaches the client as an HTTP response.
  - It tracks upgraded sockets and `closeAll()`s them on SIGTERM; http-terminator does not track them.
  - Rejections are flushed before the socket closes.
- `createGenericProxyRouter.ts` — new route fields `websocket` (default `false`) and `websocketAllowedOrigins`.
  - For an upgrade on an opted-in route, the chain is: authentication → **Origin check** → OPA access control → `proxy.ws()`. Other routes answer 400.
  - `proxyReqWs` attaches `X-Magda-Session` for the authenticated user.
  - Origin policy (WebSocket upgrades only):
    - omitted: the origin of the gateway's `externalUrl` (resolved at runtime);
    - a non-empty list: exactly those origins;
    - `[]`: no check.
  - A missing, `null`, malformed or non-matching `Origin` gets 403, before OPA or the target are involved.
- `createBaseProxy.ts` — `proxyReqWs` gets the same path appending, credential-header stripping and tenant header as `proxyReq`.
  - A client that leaves before the upgrade aborts the pending upstream handshake.
  - Once upgraded, an upstream error only closes the client socket (no HTTP is written into the WebSocket stream). Before that it answers 502, or 504 after `websocketHandshakeTimeout` (default 60 s).
- `index.ts` installs the handler and closes upgraded sockets on SIGTERM.
- Tests: `src/test/webSocketUpgrade.spec.ts`, 45 tests. Full gateway suite: 396 passing.
  - forwarding and relay; `X-Magda-Session`;
  - credential headers dropped;
  - 400/404/403/401/502/503/504 paths;
  - early client disconnect; no HTTP after the upgrade; graceful close;
  - Origin defaults, normalisation, allowlists, `[]`, malformed values and invalid configuration;
  - plain HTTP unaffected.
- Docs: `websocket`, `websocketAllowedOrigins` and `websocketHandshakeTimeout` are documented in the gateway chart README.

Answers to the 4A questions:

| Question                                     | Answer                                                                                                                                                                                                                                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How is an Upgrade routed to the right route? | Same Express routing as HTTP; only `websocket: true` routes forward it.                                                                                                                                                                                                     |
| How does Magda auth apply?                   | The session cookie / API key middleware runs on the handshake exactly as on HTTP (`auth: true`, optional `accessControl: true` for OPA).                                                                                                                                    |
| Does `X-Magda-Session` need to go upstream?  | Yes. Agent Manager uses it to identify the user and choose the sandbox. Verified at the AM hop (`hasMagdaSession: true`, `hasCookie: false`).                                                                                                                               |
| How is the per-user target chosen?           | Not by the gateway: the gateway routes statically to Agent Manager. Agent Manager maps the JWT `userId` → SandboxClaim (label `magda.io/agent-user`) → `status.sandbox.name` → Service FQDN.                                                                                |
| Errors before upgrade?                       | Plain HTTP responses on the handshake. Measured: anonymous 401 and forged session 401 (Agent Manager), cross-site Origin 403 (gateway), sandbox down 502. Unit-tested: non-WS route 400, OPA denial 403, unanswered handshake 504.                                          |
| Who checks `Origin`?                         | magda-gateway, by default (allowlist derived from `global.externalUrl`). Measured: a cross-site WebSocket gets 403 from the gateway and never reaches Agent Manager. DSH's own fence still rejects a foreign Origin when probed directly at the Service (defence in depth). |
| Shutdown cleanup?                            | SIGTERM → `closeAll()`; paired upstream sockets closed. Measured in a gateway rolling restart: the browser socket dropped when the old Pod terminated (~12 s after `rollout restart`, after the new Pod became Ready) and reconnected within 0.3–1.4 s.                     |
| Existing HTTP proxy behaviour unaffected?    | Yes (full gateway suite + E2E). The Origin check only applies to WebSocket upgrades.                                                                                                                                                                                        |

Agent Manager PoC proxy: [`agent-manager/server.mjs`](../../deploy/poc/dsh-direct-exposure/agent-manager/server.mjs) (dependency-free Node; HTTP + upgrade; RBAC `get/list sandboxclaims`, `get pods/log`).

### 4B — ingress / load balancer

ingress-nginx (`tests/ws-longlived.mjs`, an idle socket that only answers pings):

| Sandbox heartbeat                             | Ingress timeouts                                       | Result                                              |
| --------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------- |
| DSH default (2 s ping)                        | defaults (60 s)                                        | **open after 300 s**, 150 pings                     |
| 120 s (counterfactual, `DSH_WS_HEARTBEAT_MS`) | defaults (60 s)                                        | **closed at 60 s**, TCP close without a close frame |
| 120 s                                         | `proxy-read-timeout: 3600`, `proxy-send-timeout: 3600` | open after 150 s                                    |

- `Upgrade: websocket` / `Connection: upgrade` reach magda-gateway and Agent Manager (AM handshake log).
- WSS terminates at the ingress; the internal legs are WS. No "enable websocket" annotation was needed.

**Recommendation (ingress-nginx):**

```yaml
metadata:
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
```

- DSH's own ping is sufficient for nginx's idle timeout today. The annotations protect against heartbeat config changes and against other long-lived Magda routes.
- The Magda `ingress` chart has no annotation passthrough, so this PoC applied them with `kubectl annotate` (`scripts/07-ingress-websocket-timeouts.sh`).
- Follow-up: add `ingress.annotations` (or dedicated timeout values) to the chart.

**GKE / GCE (documentation only):**

- GKE Ingress deploys a _classic_ Application Load Balancer. For it, Google documents that "Websocket connections, whether idle or active, automatically close after the backend service times out". The default backend service timeout is 30 s ([request distribution](https://docs.cloud.google.com/load-balancing/docs/https/request-distribution), [GKE Ingress configuration](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/ingress-configuration)).
  - The DSH heartbeat does **not** help here; the timeout is a hard lifetime.
- The global external ALB (e.g. GKE Gateway `gke-l7-global-external-managed`) behaves differently: active WebSockets ignore the timeout and close after a fixed 24 h.

Required Magda Helm support, applied to the `gateway` Service:

```yaml
apiVersion: cloud.google.com/v1
kind: BackendConfig
metadata:
  name: gateway-websocket
spec:
  timeoutSec: 86400 # max WebSocket lifetime on the classic ALB
  connectionDraining:
    drainingTimeoutSec: 60 # let in-flight HTTP finish during gateway rollouts
---
# gateway Service
metadata:
  annotations:
    cloud.google.com/backend-config: '{"default": "gateway-websocket"}'
```

For the Gateway API, use the equivalent `GCPBackendPolicy` (`networking.gke.io/v1`, `spec.default.timeoutSec`, `spec.default.connectionDraining.drainingTimeoutSec`, `targetRef` → the gateway Service) ([GKE Gateway policies](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/configure-gateway-resources)).

- Even 86 400 s is a lifetime cap. The DSH client reconnects automatically (measured below), so a periodic reconnect is tolerable.
- **Follow-up:** qualify on GKE (classic ALB and Gateway API); add BackendConfig/GCPBackendPolicy values to the gateway chart.
- Connection draining applies to in-flight requests, not to upgraded sockets. A rollout of the gateway or Agent Manager drops the sockets of the old Pod, and the client reconnects.

### 4C — full chain

`tests/e2e-browser.mjs --disrupt` with real Chrome. Every row passed on all four combinations (runc and gVisor × stock and #8528); details in `results/e2e-*.json`.

| Check                                                          | Result                                                                                                                                                                                                |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial upgrade through ingress → gateway → AM → Service → DSH | ✅ one physical socket, 3–4 logical streams at boot (`$events`, `session/control`, `session/follow`, `workspace/follow`), 7 endpoints over a run (+ `job/list`, `terminal/retain`, `terminal/follow`) |
| Browser/session auth on the handshake                          | ✅ Magda cookie at gateway → `X-Magda-Session` at AM; browser `Cookie` never reaches AM/DSH                                                                                                           |
| Server → browser streaming                                     | ✅ 15 s streamed turn, ~90 mux frames                                                                                                                                                                 |
| Cancellation                                                   | ✅ "Stop generating" cancels the model stream ~12 tokens in (mock LLM logs the aborted request)                                                                                                       |
| Browser → server                                               | ✅ terminal: 21 `POST api/terminal/write` RPCs, output on `terminal/follow` (D7)                                                                                                                      |
| Tool activity                                                  | ✅ agent `bash` in the sandbox (`tool-ran-on-4.19.0-gvisor` / `-linuxkit`)                                                                                                                            |
| Heartbeat / idle                                               | ✅ 2 s pings end to end (4B)                                                                                                                                                                          |
| Agent Manager restart mid-stream                               | ✅ drop ~1–2 s after restart, new socket ~2.2–2.8 s; the in-flight turn completes after reconnect                                                                                                     |
| Gateway rolling restart mid-stream                             | ✅ drop at old-Pod termination (~12–13 s), new socket ~0.3–1.4 s later; turn completes                                                                                                                |
| Refresh on the public URL                                      | ✅ same sessions                                                                                                                                                                                      |

`tests/lifecycle-browser.mjs` (`results/lifecycle-*.json`), all four combinations:

| Event                                                                                                  | Browser reconnects after                         | Sessions on PVC | DSH cookie re-exchanges (stock) |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | --------------- | ------------------------------- |
| DSH process restart (container restart, same PVC)                                                      | 5–11 s (3–4 short-lived retries while DSH boots) | preserved       | 0 (new launch token not needed) |
| Sandbox suspend → resume (`operatingMode: Suspended` → `Running`; Pod deleted, PVC kept, ~15 s outage) | 18–22 s                                          | preserved       | 0                               |

**Pass:** DSH's existing HTTP + WebSocket transport works reliably through the complete Magda path; no SSE transport fork is required.

## Experiment 5 — stock auth vs Discussion #8528

### Variant A — stock DSH browser auth (DSH 0.2.1-alpha.1)

Token/authority matrix at the Sandbox Service (`tests/stock-auth-token.mjs`, `results/stock-token-authority.json`):

| Exchange (`GET /?token=`) at                           | Then used at       | Exchange     | Index   | `/api`  |
| ------------------------------------------------------ | ------------------ | ------------ | ------- | ------- |
| external authority, prefix stripped                    | external authority | 303 + cookie | 200     | 200     |
| external authority, prefix **not** stripped            | —                  | **401**      | —       | —       |
| Pod/LAN authority                                      | external authority | 303          | **401** | **401** |
| undeclared authority                                   | same               | 303          | 200     | **403** |
| upstream Service authority (`changeOrigin` everywhere) | same               | 303          | 200     | **403** |

Answers to the Variant A questions:

1. **The launch token can be redeemed through the Magda authority and prefix**, as long as the proxy strips the prefix and every request carries the same external Host. The #8528 symptom (303 at one authority, 401 at another) **reproduces** whenever the exchange and use authorities differ, or the prefix is not stripped.
   - Side observation: stock DSH Host-fences only `/api`, not the index.
2. **`publicUrl` + `trustedHosts` are sufficient** (with Agent Manager pinning Host).
3. **Agent Manager can safely do the exchange internally.**
   - The PoC reads the startup line from the Pod log (`pods/log` RBAC), redeems with `Host: <external authority>`, keeps the `dsh-auth-…` cookie per Sandbox, and injects it on HTTP and WebSocket requests.
   - It retries once on 401 (new PVC/secret).
   - Weak spots: the token is only on stdout, so it also lands in log aggregation, and log scraping is a crude hand-off. A DSH option to write the token to a file or deliver it on stdin would be cleaner.
4. **Cookie retention** is server-side in Agent Manager; the browser keeps only Magda's session cookie.
5. **DSH process restart:** the old cookie stays valid, because the signing secret is in `$DSH_HOME/.credentials.yaml` on the PVC. The new launch token is unused.
6. **Sandbox suspend/resume:** same — 0 re-exchanges.
7. **No DSH token or cookie ever needs to reach the browser.** Browser-held is in fact impossible behind magda-gateway, which strips `Cookie` (D11, `results/stock-browser-cookie-passthrough.txt`).

Security checks: 14/14 per runtime (`results/security-stock-*.json`).

- Anonymous and forged-session HTTP/WS → 401 at Agent Manager, before DSH.
- No `dsh-auth-*` cookie or token in any browser response.
- Cross-site WebSocket → 403 from the gateway's Origin check; it never reaches Agent Manager or DSH.
- Cross-site `Origin` / `Sec-Fetch-Site` RPC → 403 from DSH. The gateway doesn't check Origin on plain HTTP.
- A foreign-Origin WebSocket sent straight to the Service is also rejected by DSH (403).
- Undeclared external Host → 404 at the ingress.

### Variant B — Discussion #8528 `--no-browser-auth`

Tested code:

- `YungKC/deepseek-harness` `kai/no-browser-auth`, functional commit `54d0151d77bf8ddcc1e95eb353189e198a68d57b` (bookkeeping commit `020c59ef9f…` not needed at runtime), based on `dsh-v0.2.0-rc.2`.
- Ported to `dsh-v0.2.1-alpha.1`, because Experiment 3 needs `--public-url`.
  - `git cherry-pick` conflicts only in comments, help text and READMEs.
  - The runtime change was applied to the published compiled packages as [`image/dsh-patches/8528-no-browser-auth-0.2.1-alpha.1.patch`](../../deploy/poc/dsh-direct-exposure/image/dsh-patches/8528-no-browser-auth-0.2.1-alpha.1.patch): `dsh-client-connection/lib/index.js`, `dsh-web-app/lib/startup.js`, `dsh-web-app/cordis.patch.yml`; 148 lines.
- The `nba` image target applies it. Without `DSH_BROWSER_AUTH=false` the image behaves like stock.

Path: `Chrome → ingress → gateway (Magda auth) → Agent Manager (AUTH_MODE=none) → NetworkPolicy-constrained Service → DSH --no-browser-auth`.

| Required property                                    | Result                                                                                                                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No launch token in any URL                           | ✅ printed URL is token-free; startup warns "browser authentication is off"                                                                                    |
| No DSH browser-auth cookie                           | ✅                                                                                                                                                             |
| No browser-session credential file                   | ✅ `$DSH_HOME` has no `.credentials.yaml`                                                                                                                      |
| Magda auth before DSH                                | ✅ anonymous / forged → 401                                                                                                                                    |
| Declared authority → index/API/WS after Magda auth   | ✅ 200 / 200 / 101                                                                                                                                             |
| Undeclared Host → 403                                | ✅ index, `/api` and WebSocket (the port hardens the index too)                                                                                                |
| Cross-site / foreign Origin → rejected               | ✅ WebSocket: 403 from the gateway (never reaches AM/DSH); RPC and `Sec-Fetch-Site: cross-site`: 403 from DSH; WebSocket straight to the Service: 403 from DSH |
| Pod not permitted by NetworkPolicy cannot connect    | ✅ (Experiment 2 matrix on the nba sandboxes)                                                                                                                  |
| Only Agent Manager can reach DSH                     | ✅ (except the sandbox's own hairpin)                                                                                                                          |
| `/api/remote.mux` behind the same Host/Origin checks | ✅                                                                                                                                                             |
| Caveat                                               | ⚠️ a peer that _can_ reach :3080 and sends `Host: 127.0.0.1` is admitted (D14). NetworkPolicy is the access control.                                           |

Security checks: 19/19 per runtime (`results/security-nba-*.json`). Full browser E2E: 10/10. Lifecycle: 3/3 on both runtimes.

### Comparison

|                                | A: stock, Agent-Manager-held cookie                                                                                                                                     | B: #8528 browser auth off                                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent Manager complexity       | token capture (`pods/log` RBAC or a future hook), exchange, per-sandbox cookie cache, 401 → re-exchange, inject on HTTP + WS, strip `Set-Cookie` (~60 lines in the PoC) | none beyond the proxy itself                                                                                                                   |
| Secrets                        | launch token on stdout/log aggregation; signing secret on the PVC; cookie in Agent Manager memory                                                                       | none                                                                                                                                           |
| Cookie rewriting               | none (cookie never leaves Agent Manager)                                                                                                                                | none                                                                                                                                           |
| DSH restart / suspend / resume | transparent (secret on PVC)                                                                                                                                             | transparent                                                                                                                                    |
| New sandbox                    | one 401 + automatic re-exchange                                                                                                                                         | nothing                                                                                                                                        |
| Security boundary              | Magda auth + NetworkPolicy + DSH cookie (defence in depth: a reachable port alone is not enough)                                                                        | Magda auth + NetworkPolicy only; the Host/Origin fence still blocks browser confused-deputy attacks                                            |
| Patch maintenance              | none                                                                                                                                                                    | 148-line port per DSH release until upstream                                                                                                   |
| Upstream compatibility         | stock releases                                                                                                                                                          | needs an upstream equivalent                                                                                                                   |
| Upstream likelihood            | —                                                                                                                                                                       | uncertain: PRs/issues are disabled upstream; #8528 (2026-10-01) has no maintainer reply; one user asked for more (an `--allow-all-hosts` flag) |

### Recommendation on DSH auth

1. **MVP: retain stock launch-token/cookie auth, exchanged and held by Agent Manager** (variant A). It works on unmodified upstream DSH. It keeps a second, independent credential between a reachable port and the operator API. It is transparent across restart/suspend/resume.
2. **Ask upstream (comment on #8528/#5828) for:**
   - a browser-auth opt-out, or a pluggable auth owner for authenticating proxies;
   - a non-stdout launch-token hand-off (file/stdin/stdout-suppressed).
3. **Switch to `AUTH_MODE=none` when a supported opt-out lands.** Only Agent Manager config changes.
4. **Do not carry the fork by default.** If upstream declines and the token hand-off stays log-based, carrying the small port in the Magda DSH image is justified. It is opt-in, small and applies cleanly. Pair it with the NetworkPolicy as a hard requirement.

## Experiment 6 — upstream status and supported auth seam

- Upstream checked 2026-10-08:
  - `master` = `5badb15009` = `dsh-v0.2.1-alpha.1` (npm `alpha` tag; `latest` is still `0.2.0-rc.2`).
  - No `browserAuth`, `--no-browser-auth` or trusted-proxy mode exists.
- No supported extension point. `client-connection`'s `apply()` constructs `BrowserAuth.create(ctx.root, ctx.credentials, …)` directly, and `frontend-static` calls `connection.authorizeIndex`. There is no auth-provider, admission hook, or configurable `BrowserAuth`.
- Composition-only alternatives, none recommended:
  1. Replace the `connection` row with a Magda copy of `@deepseek-ai/dsh-client-connection`. This is a fork of one package.
  2. Pre-seed the `client-connection/browser-session` credential so Agent Manager can mint cookies itself. This couples Magda to DSH's internal cookie format.
- Result: a DSH source change (the #8528 patch or a replacement package) is the only way to disable browser auth today.

## Questions answered

| #   | Answer                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Yes — profile patch of the `webserver` row, no fork (Experiment 1).                                                                                                                                                                                                                         |
| 2   | Yes, under runc and gVisor (Experiment 2).                                                                                                                                                                                                                                                  |
| 3   | **Yes, remove the bridge sidecar.**                                                                                                                                                                                                                                                         |
| 4   | No (executable baseline). Smallest reusable change: upgrade dispatcher + per-route `websocket: true`, now with default Origin validation; merged as [#3843](https://github.com/magda-io/magda/pull/3843) (4A).                                                                              |
| 5   | Yes, through ingress → gateway → Agent Manager → Service → DSH, with no SSE (4C).                                                                                                                                                                                                           |
| 6   | nginx: `proxy-read-timeout`/`proxy-send-timeout` (e.g. 3600; DSH's 2 s ping already avoids the 60 s default). GKE classic ALB: BackendConfig `timeoutSec` (e.g. 86400), which is a hard lifetime; Gateway API: GCPBackendPolicy (4B).                                                       |
| 7   | Yes, with DSH ≥ 0.2.1-alpha.1 and a proxy that strips the prefix and keeps one Host (Experiment 3).                                                                                                                                                                                         |
| 8   | Strip the prefix; pin/preserve one external Host; pass `Origin`/`Sec-Fetch-*`; forward the Upgrade; redirect the bare mount; drop Magda headers. Cookie Path/Secure rewriting is only needed for a browser-held DSH cookie, which is not viable behind magda-gateway (Experiments 3 and 5). |
| 9   | Yes, when the exchange and use authorities differ or the prefix isn't stripped. Not with Host pinning (5A).                                                                                                                                                                                 |
| 10  | Yes, ported to 0.2.1-alpha.1; all security checks pass; NetworkPolicy becomes the access boundary (5B).                                                                                                                                                                                     |
| 11  | Agent Manager reads the token (Pod log today), redeems it server-side with the external Host, and keeps the cookie. The browser never receives the token or cookie (5A).                                                                                                                    |
| 12  | Not upstream. The patch is small and clean, but carrying it is only justified if upstream declines (Experiment 6).                                                                                                                                                                          |
| 13  | No bridge. DSH-specific pieces that remain: <ul><li>the Magda profile patch (bind, model, workspace dir);</li><li>Agent Manager's token/cookie handling (variant A) or the #8528 patch (variant B);</li><li>a per-path CSP relaxation for DSH's UI.</li></ul>                               |

## Follow-ups

- **magda-gateway:** ✅ `websocket` route option with default Origin validation merged ([#3843](https://github.com/magda-io/magda/pull/3843)); on `next` via [#3845](https://github.com/magda-io/magda/pull/3845).
- **gateway chart:**
  - per-path CSP for the agent mount (`helmetPerPath`; DSH needs `'unsafe-inline' 'unsafe-eval'`);
  - consider asking DSH upstream for nonce/hash support.
- **ingress chart:**
  - annotations or WebSocket timeout values;
  - `BackendConfig`/`GCPBackendPolicy` support for GKE.
- **GKE qualification:** classic ALB and Gateway API with long-lived DSH sessions; gateway/Agent Manager rollouts.
- **Agent Manager:**
  - pin `Host` from config;
  - strip Magda headers;
  - token capture without log scraping when DSH offers a hook;
  - `X-Magda-Session` verification;
  - per-sandbox cookie cache keyed by Sandbox, not claim.
- **Upstream DSH:**
  - browser-auth opt-out or pluggable auth;
  - launch-token hand-off;
  - `--host 0.0.0.0` remains CLI-blocked, but the row patch is supported composition.
- **Magda DSH profile:** `workspace-controller.documentsDirectory` (D18).
- **Settings persistence (from source, not tested):** DSH's settings forms persist only when the page authority is loopback (`ui-settings`: `isLoopback ? 'host' : 'memory'`). Behind Magda the forms are in-memory, which is acceptable because Magda owns model/provider config (#3824).

## Incidental observations

- DSH starts in ~2–3 s (as in #3812). A container restart takes ~5–11 s until the browser has a stable socket (the client's backoff retries connect briefly while the Host boots).
- DSH asks the model to title new sessions, in parallel with the first turn. A deployment pays one extra small model call per session.
- `helm install --wait` deadlocks on a fresh minimal Magda install: authorization-api waits for the DB migrators, which are `post-install` hooks. Install without `--wait`.
- `magda-auth-internal` 4.0.0 cannot render as a standalone release (it relies on a helper from the main chart's `magda-common`). Install it as a sibling dependency in an umbrella chart, as `local-deployment` does.
