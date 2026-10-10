# GKE qualification: ingress-nginx + L4 NLB + Agent Sandbox/gVisor (#3848)

PoC material for [#3848](https://github.com/magda-io/magda/issues/3848). It is not production configuration. It adapts the [#3841 PoC](../README.md) (same DSH image, Agent Manager PoC proxy and mock LLM) to a real GKE Standard cluster.

Write-up, results and findings: [`docs/investigations/v8-gke-qualification.md`](../../../../docs/investigations/v8-gke-qualification.md).

```text
client / Chrome --https://<lb-ip>.sslip.io--> external passthrough NLB (backend service, cloud.google.com/l4-rbs)
  -> ingress-nginx 1.15.1 (TLS, own IngressClass nginx-3848, scoped to the PoC namespace)
  -> Agent Manager PoC proxy        (stand-in for magda-gateway: the client mints X-Magda-Session)
  -> KAS Sandbox Service :3080      (Agent Sandbox v1.0.4, headless, one per Sandbox)
  -> DSH 0.2.1-alpha.1 in a gVisor Pod on a GKE Sandbox node pool (PD-backed PVC)
```

No `kubectl port-forward` is used on the data path. `kubectl exec` is only used by tests to inspect the Pod.

## What it creates

| Resource | Where | Script |
| --- | --- | --- |
| Node pool `kas-gvisor-3848` (1 × `e2-standard-2`, Spot, `--sandbox type=gvisor`) | the cluster | `scripts/01-gvisor-node-pool.sh` |
| Agent Sandbox v1.0.4: 4 CRDs, ClusterRoles, controller in `agent-sandbox-system` | cluster-scoped | `scripts/02-install-agent-sandbox.sh` |
| ingress-nginx chart 4.15.1 in `ingress-nginx-3848`, IngressClass `nginx-3848`, `LoadBalancer` Service with `cloud.google.com/l4-rbs: "enabled"` and `loadBalancerSourceRanges` = your egress IP | its own namespace + GCP forwarding rule, backend service, health check and firewall rules | `scripts/03-ingress-nginx.sh` |
| Artifact Registry repo `magda-kas-poc` (+ repo-scoped reader for the node service account), amd64 images | the project | `scripts/04-build-push-images.sh` |
| Namespace `magda-gke-3848`: self-signed TLS for `<lb-ip>.sslip.io`, mock LLM, Agent Manager, Ingress, SandboxTemplates/WarmPools (size 0) | the PoC namespace | `scripts/05-deploy-poc.sh` |

It touches no other namespace. ingress-nginx is installed **without** its validating admission webhook, because the webhook matches every Ingress in the cluster.

## Run

You need `gcloud` (Kubernetes Engine and Artifact Registry admin on the project), `kubectl`, `helm`, `docker buildx`, `jq`, `openssl` and Node ≥ 22. Settings live in `env.sh` and can be overridden from the environment (`PROJECT`, `ZONE`, `CLUSTER`, `KUBE_CONTEXT`, `NS`, …).

```sh
cd deploy/poc/dsh-direct-exposure/gke
./scripts/01-gvisor-node-pool.sh
./scripts/02-install-agent-sandbox.sh
./scripts/03-ingress-nginx.sh            # prints the LB IP and runs tests/lb-l4-check.sh
./scripts/04-build-push-images.sh
./scripts/05-deploy-poc.sh               # WS_TIMEOUT=3600 adds the nginx proxy-read/send-timeout annotations
./scripts/claim.sh dsh-gvisor            # the test user's gVisor SandboxClaim
(cd ../tests && npm install)             # playwright-core, for the browser test only
```

Tests (from `gke/`):

```sh
./tests/lb-l4-check.sh                                    # GCP forwarding rule = regional EXTERNAL TCP, backend service, no URL map
node tests/external-chain.mjs                             # HTTPS + wss through the NLB to DSH, Origin/Host, DSH RPC, mock LLM
node tests/browser-e2e.mjs                                # Chrome: DSH UI, one wss mux, streaming
./tests/platform-checks.sh                                # gVisor evidence, DNS/egress, metadata, NetworkPolicy enforcement
./tests/pvc-lifecycle.sh                                  # PD provision/mount, suspend/resume, Pod replacement, reclaim
# idle WebSocket (heartbeat variants need their own user + claim):
TEST_USER_ID=00000000-0000-4000-8000-000000000b0b ./scripts/claim.sh dsh-gvisor-hb120
node tests/ws-longlived.mjs 00000000-0000-4000-8000-000000000b0b 180
node tests/ws-longlived.mjs 00000000-0000-4000-8000-00000000a11c 600 --reload-at 30   # nginx reload while open
```

Raw results from the 2026-10-10 run are in `results/`.

Tear down everything, including the node pool, KAS and the Artifact Registry repo. It then lists any leftovers:

```sh
./scripts/99-teardown.sh                 # KEEP_AGENT_SANDBOX=1 / KEEP_NODE_POOL=1 to keep those
```

## Differences from the Minikube PoC

- **No magda-gateway or Magda auth.** ingress-nginx routes `/api/v0/agent/runtime/*` straight to Agent Manager (`rewrite-target /runtime/$2`). The test client mints the `X-Magda-Session` JWT with the namespace's random `jwt-secret`, which the gateway would do after Magda session auth. So the gateway's handshake Origin check (#3843) isn't exercised here; DSH's own fence rejects cross-site Origins.
- Images come from Artifact Registry (`IfNotPresent`) instead of `imagePullPolicy: Never`.
- The templates set `fsGroupChangePolicy: OnRootMismatch` (see the write-up, finding G2). The #3841 templates now set it too.
- WarmPool size is 0. Only the stock-DSH (managed-cookie) variant is deployed.
