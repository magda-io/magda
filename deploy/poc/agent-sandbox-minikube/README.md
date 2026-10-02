# Magda v8 agent PoC — DSH + mgd in Agent Sandbox + gVisor (Minikube)

PoC material for [#3812](https://github.com/magda-io/magda/issues/3812). It is not production configuration.

Write-up, results and findings: [`docs/investigations/v8-agent-sandbox-minikube.md`](../../../docs/investigations/v8-agent-sandbox-minikube.md).

| Path | Purpose |
|---|---|
| `scripts/01-cluster-up.sh` | Minikube profile `magda-agent-poc` (docker driver, containerd), `gvisor` addon plus a pinned gVisor release (works around the broken addon download) |
| `scripts/02-install-agent-sandbox.sh` | Agent Sandbox v1.0.4, core + extensions |
| `scripts/03-build-image.sh` | Build `magda-agent-poc:dev` (DSH + mgd from `packages/mgd`) and load it into Minikube |
| `scripts/04-open-ui.sh <claim> [port]` | Create a runc access-relay Pod for a claim, print the DSH token URL and port-forward it to localhost |
| `scripts/05-load-test.py` | Phase 9 load test: N concurrent sandboxes (gVisor or runc pool) running `scripts/bench/workload.py` (no LLM) or a real agent task, measured from node cgroup v2 counters |
| `scripts/06-proxy-bench.py` | Phase 9 proxy data-path benchmark (Agent Manager stand-in) via `scripts/bench/proxy-load.mjs` |
| `image/` | Agent image: Dockerfile, DSH config overlay, entrypoint, loopback relay |
| `manifests/00-gvisor-smoke-pod.yaml` | Phase 1 runtime proof (`dmesg` shows gVisor) |
| `manifests/10-sandbox-template.yaml` | `SandboxTemplate` + `SandboxWarmPool` |
| `manifests/11-sandbox-template-runc.yaml` | Same template/pool without gVisor; benchmark baseline only |
| `manifests/20-sandbox-claims.yaml` | Claims for two users (isolation and new-session tests) |
| `manifests/dga-connector-values.yaml` | Small data.gov.au harvest for test data |
| `results/` | Raw JSON reports from the load and proxy benchmarks quoted in the write-up |

Quick start (from this directory, with Magda installed in namespace `magda`):

```sh
./scripts/01-cluster-up.sh
./scripts/02-install-agent-sandbox.sh
./scripts/03-build-image.sh
kubectl create namespace magda-agent-poc
kubectl -n magda-agent-poc create secret generic magda-agent-llm \
  --from-literal=OPENAI_API_KEY="$OPENAI_API_KEY"   # runtime only, never in the image
kubectl apply -f manifests/10-sandbox-template.yaml
kubectl apply -f manifests/20-sandbox-claims.yaml
./scripts/04-open-ui.sh user-a 13080   # open the printed URL in a browser on this machine
```
