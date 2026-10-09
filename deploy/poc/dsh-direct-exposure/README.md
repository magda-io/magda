# Magda v8 agent PoC — direct DSH exposure through the full Magda path (#3841)

PoC material for [#3841](https://github.com/magda-io/magda/issues/3841). It is not production configuration.

Write-up, results and recommendations: [`docs/investigations/v8-dsh-direct-exposure.md`](../../../docs/investigations/v8-dsh-direct-exposure.md).

```text
Chrome (host) --https://magda.test:18443--> minikube ingress-nginx (TLS)
  -> magda-gateway (Magda session auth, route websocket: true)
  -> Agent Manager PoC proxy (user -> SandboxClaim -> Service, Host pinning, DSH auth mode)
  -> Sandbox Service :3080 (NetworkPolicy: Agent Manager only)
  -> DSH web bound to 0.0.0.0:3080 (no bridge sidecar), runc or gVisor
```

| Path | Purpose |
| --- | --- |
| `scripts/01-cluster-up.sh` | Minikube profile `magda-agent-poc`: containerd, gVisor (pinned runsc), ingress addon, node 443/80 published as `127.0.0.1:18443/18080`, Agent Sandbox v1.0.4 |
| `scripts/02-build-gateway.sh` | Compile `magda-gateway` from the checkout and overlay it on the 7.0.0 image (`gateway/Dockerfile`). Needs the gateway WebSocket support from [#3843](https://github.com/magda-io/magda/pull/3843) (on `main` and `next`) |
| `scripts/03-build-images.sh` | Agent images `magda-agent-dsh:stock` / `:nba` (DSH 0.2.1-alpha.1 [+ #8528 port]) and the tools image (Agent Manager, mock LLM) |
| `scripts/04-install-magda.sh` | Minimal Magda 7.0.0 + `magda-auth-internal` (`manifests/magda/chart`), self-signed `magda.test` TLS |
| `scripts/05-create-test-users.sh` | Users `alice@magda.test` / `bob@magda.test` (password `poc-password-3841`) |
| `scripts/06-deploy-agent-poc.sh` | Namespace `magda-agent-poc`: mock LLM, Agent Manager (`AUTH_MODE`), SandboxTemplates |
| `scripts/07-ingress-websocket-timeouts.sh` | Apply / remove the ingress-nginx WebSocket timeout annotations |
| `scripts/claim.sh <user-uuid> <template> [name]` | (Re)create a user's SandboxClaim |
| `scripts/render-sandbox-templates.sh` | Generate `manifests/30-sandbox-templates.yaml` (`dsh-{gvisor,runc}-{stock,nba}`, `dsh-runc-stock-hb120`) |
| `image/` | Agent image, Magda DSH profile patch (`magda.cordis.patch.yml`), entrypoint, `dsh-patches/` (#8528 port) |
| `agent-manager/server.mjs` | Agent Manager DSH proxy PoC (HTTP + WebSocket, `AUTH_MODE=managed-cookie|none|passthrough`) |
| `mock-llm/server.mjs` | Deterministic OpenAI Chat Completions mock (`STREAM <s> [tag]`, `BASH <cmd>`) |
| `tests/` | Browser E2E, lifecycle, security, token/authority, long-lived WebSocket and NetworkPolicy tests |
| `results/` | Raw results quoted in the write-up |

## Quick start

From this directory, on macOS/Linux with Docker, minikube, kubectl, helm and Node ≥ 22 (Google Chrome for the browser tests):

```sh
./scripts/01-cluster-up.sh
BIN=/path/to/magda/node_modules/.bin ./scripts/02-build-gateway.sh   # BIN only needed in a worktree
./scripts/03-build-images.sh
./scripts/04-install-magda.sh
./scripts/06-deploy-agent-poc.sh                                     # AUTH_MODE=managed-cookie (stock DSH)
./scripts/claim.sh 00000000-0000-4000-8000-00000000a11c dsh-gvisor-stock alice-1
./scripts/claim.sh 00000000-0000-4000-8000-000000000b0b dsh-runc-stock bob-1
(cd tests && npm install)
```

Then open `https://magda.test:18443/api/v0/agent/runtime/` in a browser that resolves `magda.test` to `127.0.0.1`. For example, run Chrome with `--host-resolver-rules="MAP magda.test 127.0.0.1"`. Log in first via `POST /auth/login/plugin/internal`; the tests show how.

Tests (from `tests/`):

```sh
node e2e-browser.mjs alice --disrupt     # streaming, cancel, tool, terminal, AM/gateway restart, refresh
node lifecycle-browser.mjs alice         # DSH restart, Sandbox suspend/resume
node security.mjs stock --user alice     # or: nba (AUTH_MODE=none + dsh-*-nba claim)
node stock-auth-token.mjs                # #8528 authority matrix (stock sandbox)
node ws-longlived.mjs alice 300          # idle socket through the ingress
./netpol.sh                              # who can reach DSH :3080
```

Switch to the #8528 variant:

```sh
kubectl -n magda-agent-poc set env deploy/agent-manager AUTH_MODE=none
./scripts/claim.sh 00000000-0000-4000-8000-00000000a11c dsh-gvisor-nba alice-nba-1
```

No LLM credential is needed: the sandboxes use the in-cluster mock model.
