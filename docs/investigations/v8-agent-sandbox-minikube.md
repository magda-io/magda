# PoC: DSH + mgd in Kubernetes Agent Sandbox with gVisor on Minikube

Issue: [#3812](https://github.com/magda-io/magda/issues/3812) · Parent: [#3810](https://github.com/magda-io/magda/issues/3810) · Feeds: [#3811](https://github.com/magda-io/magda/issues/3811) · Branch: `next` (v8)

> **Status: complete** (2026-10-02). All nine phases were run on one Apple Silicon workstation. Every acceptance criterion is either met, or met with a precisely documented limitation (see [Acceptance criteria](#acceptance-criteria)).

Reproduction material: [`deploy/poc/agent-sandbox-minikube/`](../../deploy/poc/agent-sandbox-minikube/).

## TL;DR — findings

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Impact on #3810 / #3811                                                                                                                                                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | **The minikube `gvisor` addon is broken on current gVisor releases** (every arch). It downloads `releases/release/latest/<arch>/runsc`, which gVisor stopped publishing in 2026-07, and writes a GCS `NoSuchKey` XML document as `/usr/bin/runsc`. Every gVisor Pod then fails with `exec format error`. Workaround: keep the addon (it configures containerd and creates the `gvisor` RuntimeClass), then install a pinned release tarball (`scripts/01-cluster-up.sh`).                                                                                                         | Pin gVisor by release + checksum in any deployment tooling. Never rely on a "latest" URL.                                                                                                                                                                                 |
| F2  | **gVisor is active**, proven from inside every workload, including SandboxClaim-backed Pods: `dmesg` shows `Starting gVisor...` and the kernel is `4.19.0-gvisor` (the node runs `7.0.14-linuxkit`). There are 17 `/dev` entries and the mounts are 9p/gofer.                                                                                                                                                                                                                                                                                                                     | —                                                                                                                                                                                                                                                                         |
| F3  | **`kubectl port-forward` cannot reach a gVisor Pod's loopback.** containerd dials `127.0.0.1:<port>` in the Pod's host-side netns, but gVisor has its own netstack, so the dial gets `connection refused`. DSH binds loopback only and refuses `--host 0.0.0.0` by design. **Working solution:** a byte-transparent TCP relay inside the sandbox (`podIP:8080` → `127.0.0.1:3080`), fenced by NetworkPolicy so that only the proxy role (`app.kubernetes.io/name: magda-agent-access`) can reach it. Browser, streaming, reconnect and terminal all work through it.              | The Agent Manager (or a sandbox router) reaches DSH through the in-sandbox relay. NetworkPolicy is the fence; the DSH token cookie is the per-session authenticator.                                                                                                      |
| F4  | **bubblewrap works inside gVisor and DSH selects `bwrap`**, even with `allowPrivilegeEscalation: false`, all capabilities dropped and `NoNewPrivs=1`. Under `workspace-write`, writes inside the workspace succeed. Writes elsewhere fail with `Read-only file system`, and DSH adds `[sandbox: file access denied under workspace-write mode]`.                                                                                                                                                                                                                                  | DSH's inner confinement stays usable as defence in depth. The Landlock gap (gVisor #13439) does not matter because bwrap wins the probe.                                                                                                                                  |
| F5  | **In a normal runc Pod bwrap fails** (`Can't mount proc on /newroot/proc: Operation not permitted`), and DSH falls back to **Landlock**. Confirmed by a runc sandbox run: workspace-write still enforced, but the denial dialect is `Permission denied` and PID 1 stays visible (no private PID namespace). gVisor is the configuration in which DSH gets its strongest backend.                                                                                                                                                                                                  | Document a supported-runtime matrix. Surface the selected DSH backend and enforcement level in sandbox health.                                                                                                                                                            |
| F6  | **PTYs work under gVisor, but not inside bwrap-under-gVisor.** Inside bwrap's fresh `--dev /dev`, `/dev/pts` is unusable (`failed to create pseudo-terminal: Permission denied`). The **DSH web terminal works** (`/dev/pts/0`, `isatty True`) because it is not wrapped by bwrap, so **the web terminal is not confined by DSH's sandbox mode**: it could write `$DSH_HOME`.                                                                                                                                                                                                     | TTY-needing commands fail inside the agent's confined bash. The human web terminal is contained only by gVisor and the Pod boundary. Decide whether to expose it in the Magda UI.                                                                                         |
| F7  | **In DSH `0.2.0-rc.2`, `read-only` sessions cannot run any bash command without approval.** The bash tool's `sandbox_permissions` parameter only accepts `workspace-write` or `danger-full-access`. In the web UI even `cat /etc/hostname` raises "Allow this operation with workspace-write permissions". Rejecting fails closed. Headless has no approval channel, so it fails with `requires approval, but no approval channel is available`. The behaviour is identical under runc, so it is not caused by gVisor. bwrap's read-only profile itself is enforced under gVisor. | Use `workspace-write` + ask as the default. `read-only` is not a practical mode in this DSH version.                                                                                                                                                                      |
| F8  | **DSH drove real mgd workflows from natural language inside the gVisor sandbox:** headless (search → mgd download of a 6.7 MB CSV → pandas → answer, 192 s) and from the browser (marker file + `mgd search`, 23 s), with `gpt-5.6-sol`.                                                                                                                                                                                                                                                                                                                                          | The core v8 premise is validated.                                                                                                                                                                                                                                         |
| F9  | A `WORKDIR` on a mounted volume path is created **as root** by the runtime, so the non-root agent cannot write its own workspace. Fixed by using `WORKDIR /home/agent` and creating `/data/workspace` in the entrypoint.                                                                                                                                                                                                                                                                                                                                                          | Image convention for the production agent image.                                                                                                                                                                                                                          |
| F10 | **Agent Sandbox v1.0.4 constraints:** `SandboxClaim` requires `warmPoolRef` (no direct template reference). Per-claim `env` or `volumeClaimTemplates` force a cold start. A warm-adopted Sandbox keeps its **pool-generated name** (e.g. `magda-agent-9pm2r`), not the claim's name. Without a template `networkPolicy`, the managed default allows **public Internet egress only** (RFC1918 blocked), which blocks mgd → Magda gateway.                                                                                                                                          | The Agent Manager must own a SandboxWarmPool per template and resolve Pods via `claim.status.sandbox.name`. User identity and credentials must be injected after adoption, not via claim `env`, if warm pools are wanted. The template must allow the gateway explicitly. |
| F11 | DSH keeps a browser-session cookie-signing secret in `$DSH_HOME/.credentials.yaml`. With `DSH_HOME` on the PVC, **an existing browser cookie survives Pod recreation** with no new token needed. **A new claim gets a new secret, so old cookies are rejected** ("dsh web authentication required"). The LLM key never touches disk (`apiKeyEnv`).                                                                                                                                                                                                                                | Good session semantics for free. The startup token is only printed to stdout, so the Agent Manager must capture it (logs or a future DSH hook) and perform the exchange for the user.                                                                                     |
| F12 | **Exceeding the Pod memory limit kills the whole gVisor sandbox, not just the offending process.** The host memcg OOM killer picks `gvisor_sentry`. The Pod reports `OOMKilled` and restarts in about 1 s with its PVC intact, but DSH and all running work are lost.                                                                                                                                                                                                                                                                                                             | A runaway agent command takes the user's session runtime down. Add inner limits (per-command memory/ulimit in the DSH executor) and surface `OOMKilled` restarts in Agent Manager status.                                                                                 |
| F13 | **kindnet enforces NetworkPolicy.** From sandbox A: the Magda gateway and the public Internet are reachable. Blocked: registry-api and authorization-api directly, Postgres, the Kubernetes API, and sandbox B's relay port.                                                                                                                                                                                                                                                                                                                                                      | The template-level policy works on the default minikube CNI. Production still needs an explicit metadata-endpoint deny and an egress design (out of scope here).                                                                                                          |
| F14 | **gVisor resource overhead** (Phase 9.4/9.5): ≈ +55 MiB idle and +60–70 MiB peak memory per sandbox. ≈ 2–3.5× CPU-seconds on mixed workloads. Compute/data work runs at 1.0–1.5× but syscall-heavy work is 3–13× slower alone and **10–49× slower when 6 sandboxes share 6 cores**. End-to-end scripted workload: 1.2× slower.                                                                                                                                                                                                                                                    | Fine for mgd/pandas-style analysis. Expect slow `npm install`/build/large file-tree work. Give sandboxes real CPU headroom and avoid packing many busy sandboxes per core.                                                                                                |
| F15 | **Sizing** (Phase 9.8): idle ≈ 0.18–0.25 GiB, typical agent turn ≈ 0.36 GiB peak, 5M-row pandas analysis ≈ 1.1 GiB peak per sandbox. Controller ≈ 25 MiB. A Node.js relay on the proxy data path ≈ 10–75 MiB and < 1 core at 4.5 GB/s.                                                                                                                                                                                                                                                                                                                                            | Memory scales with **open** sessions (≈ 0.25 GiB each, no idle stop) plus **active** sessions' working sets. The proxy tier is negligible.                                                                                                                                |
| F16 | **Magda is the first bottleneck under concurrent agents.** 6 sandboxes × 200 gateway calls ran at ≈ 17 req/s in total on both runtimes, with `authorization-api` (OPA) at 445m CPU.                                                                                                                                                                                                                                                                                                                                                                                               | Scale `authorization-api`/registry (and consider per-session rate limits) for v8.                                                                                                                                                                                         |
| F17 | **Reusing a claim/PVC name immediately after deletion breaks the new sandbox** on minikube's hostPath provisioner. The old volume directory is deleted _after_ the new one is provisioned, the kubelet recreates it `root 0755`, and the non-root agent crash-loops (`mkdir: Permission denied`).                                                                                                                                                                                                                                                                                 | The Agent Manager should give every session a **unique** claim name (e.g. `<user>-<session-id>`), or wait for the old PV to be gone.                                                                                                                                      |
| F18 | **Socket buffers count against the sandbox memory limit.** Serving 50 concurrent 10 MB downloads pushed a gVisor sandbox from 180 to 650 MiB, and gVisor's network serving is ≈ 40–60% of runc's (CPU-bound in the sentry at the 2-core limit).                                                                                                                                                                                                                                                                                                                                   | Include network bursts in the memory limit (F12). Do not route heavy downloads _out of_ the sandbox through DSH.                                                                                                                                                          |

## Environment (tested host)

| Item          | Value                                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Host          | macOS 26.6.2, Apple Silicon (arm64)                                                                                                                    |
| Docker        | Docker Desktop, engine 29.8.1, 8 CPUs / 23.4 GiB                                                                                                       |
| Minikube      | v1.38.1, **driver `docker`**, runtime **containerd 2.2.1**, Kubernetes v1.34.0, kicbase v0.0.50, CNI kindnet (enforces NetworkPolicy)                  |
| Profile       | `magda-agent-poc`, `--cpus=6 --memory=16g --disk-size=60g`, addons `gvisor`, `metrics-server`                                                          |
| gVisor        | `release-20260928.0` (aarch64 tarball, SHA-512 verified), installed over the `gvisor` addon (`registry.k8s.io/minikube/gvisor:v0.0.4`)                 |
| Agent Sandbox | v1.0.4 `sandbox-with-extensions.yaml` (controller `registry.k8s.io/agent-sandbox/agent-sandbox-controller:v1.0.4`)                                     |
| DSH           | `@deepseek-ai/dsh@0.2.0-rc.2` (npm), Node 22.22.0                                                                                                      |
| mgd           | 6.2.1, built from `packages/mgd` on `next`                                                                                                             |
| LLM           | OpenAI `gpt-5.6-sol` via DSH `llm-pi-ai` (`openai-responses`)                                                                                          |
| Magda         | `oci://ghcr.io/magda-io/charts/magda` 7.0.0-alpha.5, plus `magda-ckan-connector` 2.1.0 (data.gov.au, 2 organisations: 138 datasets, 338 distributions) |
| Browser       | Chrome on the same host as the cluster (automated), plus headless Chrome over the DevTools protocol for one run                                        |

## Reproduce

From `deploy/poc/agent-sandbox-minikube/`, with Magda installed in namespace `magda`:

```sh
./scripts/01-cluster-up.sh                 # Phase 1
./scripts/02-install-agent-sandbox.sh      # Phase 2
./scripts/03-build-image.sh                # Phase 4
kubectl create namespace magda-agent-poc
kubectl -n magda-agent-poc create secret generic magda-agent-llm \
  --from-literal=OPENAI_API_KEY="$OPENAI_API_KEY"
kubectl apply -f manifests/10-sandbox-template.yaml
kubectl apply -f manifests/20-sandbox-claims.yaml
./scripts/04-open-ui.sh user-a 13080       # prints http://localhost:13080/?token=...
```

Magda itself:

```sh
helm install magda oci://ghcr.io/magda-io/charts/magda --version 7.0.0-alpha.5 -n magda --create-namespace
helm install connector-dga oci://ghcr.io/magda-io/charts/magda-ckan-connector --version 2.1.0 -n magda \
  -f manifests/dga-connector-values.yaml
```

## Phase 1 — Minikube + gVisor ✅

Exact start commands (wrapped by `scripts/01-cluster-up.sh`):

```sh
minikube start -p magda-agent-poc --driver=docker --container-runtime=containerd \
  --cpus=6 --memory=16g --disk-size=60g
minikube -p magda-agent-poc addons enable gvisor
```

Failure observed before the fix (F1):

```text
Failed to create pod sandbox: ... fork/exec /usr/bin/containerd-shim-runsc-v1: exec format error
$ cat /usr/bin/runsc
<?xml version='1.0' encoding='UTF-8'?><Error><Code>NoSuchKey</Code>...
No such object: gvisor/releases/release/latest/aarch64/runsc
```

The fix (in the script) does the following:

1. Downloads `gvisor-<arch>.tar.bz2` and `SHA512SUMS` from the GitHub release and verifies the checksum.
2. Decompresses on the host, because the kicbase node has neither `bzip2` nor `zstd`.
3. Copies the tar into the node and extracts it into `/usr/bin`. `runsc` must keep `gvisor-bin/` next to itself.

Runtime evidence from `manifests/00-gvisor-smoke-pod.yaml`:

```text
[    0.000000] Starting gVisor...
Linux gvisor-smoke 4.19.0-gvisor #1 SMP Sun Jan 10 15:06:54 PST 2016 aarch64 GNU/Linux
```

`kubectl get runtimeclass gvisor` → handler `runsc`.

## Phase 2 — Agent Sandbox ✅

`scripts/02-install-agent-sandbox.sh` applies the v1.0.4 all-in-one manifest server-side.

- Controller `agent-sandbox-controller` is Available in about 10 s.
- CRDs: `sandboxes.agents.x-k8s.io`, plus `sandboxtemplates`, `sandboxclaims` and `sandboxwarmpools` under `extensions.agents.x-k8s.io`, all `v1beta1`.

API facts relevant to the design (F10):

- **Claims.** `SandboxClaim.spec.warmPoolRef` is required. The other fields are `env`, `volumeClaimTemplates`, `lifecycle` (`shutdownTime`, `shutdownPolicy`: `Delete | DeleteForeground | Retain`) and `additionalPodMetadata`.
- **Templates.** `networkPolicyManagement` (`Managed` by default) creates one shared NetworkPolicy per template. `envVarsInjectionPolicy` and `volumeClaimTemplatesPolicy` default to `Disallowed`. The controller defaults `automountServiceAccountToken` to `false`.
- **Suspend.** `Sandbox.spec.operatingMode: Suspended` deletes the Pod but keeps the Sandbox and its volumes. This is a candidate primitive for a future "pause".

## Phase 3 — Agent Sandbox + gVisor ✅

Manifests:

- [`manifests/10-sandbox-template.yaml`](../../deploy/poc/agent-sandbox-minikube/manifests/10-sandbox-template.yaml)
  - `SandboxTemplate` `magda-agent`: gVisor, non-root 10001, no SA token, `enableServiceLinks: false`, seccomp `RuntimeDefault`, `allowPrivilegeEscalation: false`, drop ALL capabilities.
  - Requests 250m / 512Mi / 512Mi ephemeral; limits 2 CPU / 2Gi / 2Gi ephemeral.
  - A 2 Gi PVC `data` per sandbox and a loopback TCP readiness probe.
  - Custom NetworkPolicy:
    - ingress only from `magda-agent-access` on port 8080;
    - egress to DNS, the Magda gateway pod on port 80, and `0.0.0.0/0` minus RFC1918, link-local and CGNAT.
  - `SandboxWarmPool` `magda-agent` with `replicas: 0`.
- [`manifests/20-sandbox-claims.yaml`](../../deploy/poc/agent-sandbox-minikube/manifests/20-sandbox-claims.yaml): claims `user-a` and `user-b`.

Results:

| Check                                | Result                                                                                                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claim → Ready (cold, image cached)   | ✅ 2–7 s                                                                                                                                                          |
| Backing Sandbox, Pod and PVC created | ✅ `sandbox/user-a`, `pod/user-a`, `pvc/data-user-a` (owner: Sandbox). Shared `networkpolicy/magda-agent-network-policy` selected by `sandbox-template-ref-hash`. |
| Pod spec                             | ✅ `runtimeClassName: gvisor`, `automountServiceAccountToken: false`, template securityContext and resources applied verbatim                                     |
| In-container gVisor evidence         | ✅ `dmesg` → `Starting gVisor...`, `uname -r` → `4.19.0-gvisor` (both claims)                                                                                     |
| Delete and recreate                  | ✅ repeated 4×. Controller healthy, no stuck finalisers.                                                                                                          |

Differences from the upstream KIND gVisor quickstart:

- runsc comes from the patched minikube addon instead of `extraMounts`.
- Claims go through a 0-replica warm pool.
- A custom template NetworkPolicy replaces the router-only default.
- The upstream Python SDK and sandbox router are not used.

## Phase 4 — Agent image ✅

`scripts/03-build-image.sh` runs `docker build --build-context mgd=packages/mgd`, then `minikube image load`.

- [`image/Dockerfile`](../../deploy/poc/agent-sandbox-minikube/image/Dockerfile)
  - Two stages: the first runs `npm pack` on `packages/mgd`; the runtime stage is `node:22.22.0-bookworm-slim`.
  - Contents: DSH 0.2.0-rc.2 (pinned), mgd, `bubblewrap`, `python3` + `pandas`, `jq`, `git`, `curl`, `procps`, `util-linux`, `tini`.
  - Non-root user `agent` (10001). No credentials baked in.
  - The mgd skill is installed at build time (`mgd skills install --agent codex` → `~/.agents/skills/magda-mgd`, which DSH scans) as a deployment-level skill.
- [`image/magda.cordis.patch.yml`](../../deploy/poc/agent-sandbox-minikube/image/magda.cordis.patch.yml)
  - Provider `openai-poc` (`apiKeyEnv: OPENAI_API_KEY`, `openai-responses`); default model `gpt-5.6-sol`.
  - DeepSeek session-log contribution disabled. The image also sets `DSH_TELEMETRY_MODE=DISABLED` and `DSH_TELEMETRY_DISABLED=1`.
- [`image/entrypoint.sh`](../../deploy/poc/agent-sandbox-minikube/image/entrypoint.sh)
  - Creates the `/data` layout and writes a `/data/.created-at` marker.
  - Starts the loopback relay, then `dsh web --no-open --port 3080 [--trusted-host …]` under tini.
- [`image/loopback-relay.mjs`](../../deploy/poc/agent-sandbox-minikube/image/loopback-relay.mjs): a dependency-free raw TCP relay. The same script serves as the in-sandbox relay and as the access relay.
- Volume layout on `/data` (PVC):
  - `dsh-home/`: `DSH_HOME` (settings, sessions, cookie secret)
  - `workspace/`: cwd and DSH workspace root
  - `config/`: `XDG_CONFIG_HOME`, mgd profiles
- Size: **1.40 GB unpacked / 294 MB compressed**. A cold build takes about 3 min.

## Phase 5 — DSH runtime compatibility ✅ (with documented limitations)

All results are inside gVisor with the hardened securityContext.

| Check                                                                                  | Result                                                                                                                                                    |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DSH starts                                                                             | ✅ `dsh web: http://127.0.0.1:3080/?token=…` about 2–3 s after container start                                                                            |
| Create / read / edit / delete files (DSH `write` / `read` / `edit`, bash `rm`, `glob`) | ✅                                                                                                                                                        |
| Shell commands, Node.js `v22.22.0`, Python 3.11.2 + pandas 1.5.3                       | ✅                                                                                                                                                        |
| Background job: start `sleep 300`, `job_list`, `job_kill`, confirm `killed`            | ✅                                                                                                                                                        |
| Command failure reporting (`ls /nonexistent` → exit 2)                                 | ✅                                                                                                                                                        |
| PTY inside agent bash (bwrap)                                                          | ❌ `script: failed to create pseudo-terminal: Permission denied` (F6)                                                                                     |
| DSH web terminal (PTY)                                                                 | ✅ `/dev/pts/0`, `isatty True`. Not bwrap-confined (F6).                                                                                                  |
| DSH sandbox backend selected                                                           | **bwrap**: read-only root, private PID namespace, `/proc`, tmpfs `/tmp`, writable workspace bind                                                          |
| `workspace-write`: write in workspace / outside                                        | ✅ allowed / ✅ denied (`Read-only file system` + DSH diagnostic + escalation hint)                                                                       |
| `read-only` (web UI, with approval channel)                                            | ⚠️ every bash call, even `cat`, prompts for workspace-write. Rejecting fails closed (`the user rejected escalating this command…`). Same under runc (F7). |
| bwrap read-only profile (manual)                                                       | ✅ write denied with `Read-only file system`, including on agent-owned paths outside the workspace                                                        |

**Browser / streaming / reconnect**

The browser runs on the cluster host:

```text
Chrome → kubectl port-forward → access-user-a (runc) → 10.244.x.y:8080 (sandbox relay)
       → 127.0.0.1:3080 (DSH)
```

| Check                                        | Result                                                                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| UI loads                                     | ✅ without token `401`; with token `303` → signed cookie → `200`                                                        |
| Prompt, tool activity and answer stream live | ✅ 525 WebSocket frames received for one 23 s turn                                                                      |
| Browser refresh                              | ✅ returns to the same session with full history                                                                        |
| Browser **and** port-forward killed mid-task | ✅ the 90 s `sleep` task completed while nothing was connected (file written 04:16:03, about 86 s after the disconnect) |
| Reconnect from a different browser profile   | ✅ the session shows `Completed in 1m 40s` with the correct output                                                      |
| Leaving the browser disconnected             | ✅ sandbox unaffected (no idle shutdown configured)                                                                     |

## Phase 6 — mgd workflow ✅

`MGD_BASE_URL=http://gateway.magda.svc.cluster.local/api` is set in the template. The `/api` suffix is required: without it `mgd auth status` fails with `Unexpected token '<'`, because the gateway serves the web UI's HTML.

| Check                                                                 | Result                                                        |
| --------------------------------------------------------------------- | ------------------------------------------------------------- |
| `mgd --version`                                                       | `6.2.1`                                                       |
| `mgd auth status`                                                     | `Profile: env`, `Authenticated: false` (anonymous, read-only) |
| `mgd search datasets "ocean temperature" --limit 5`                   | ✅ 5 of 82 results. `--json` works.                           |
| Headless natural-language task (below)                                | ✅ 192 s                                                      |
| Browser natural-language task (`marker-a.txt` + `mgd search tsunami`) | ✅ 23 s, 2 results                                            |

Headless prompt: _find a sea-surface-temperature/ocean dataset with a CSV distribution, download it with mgd, analyse it with pandas, report dataset id, distribution id, path and findings_. The agent answered:

```text
- Dataset: ds-dga-d60fde7c-a938-4de7-897d-0c3e4d0e3a38 — Geoscience Australia Resources
- Distribution: dist-dga-4328a11d-775f-4530-8aae-e0c5b19d1a1b
- Local file: /data/workspace/ga_metadata_gateway_export.csv   (6,672,854 bytes)
- Rows: 6,920 total; 116 matched ocean/marine/coastal terms
- Columns: id, title, description, metadataURL, dataURL, licence
The more specifically ocean-temperature CSV records found in Magda had stale
source links (404), so this downloadable CSV was used.
```

Authenticated mutation was not tested. Only anonymous read access was used.

## Phase 7 — Workspace / lifecycle ✅

| Step                                                    | Result                                                                                                                                                                        |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Marker file + DSH session                            | `marker-a.txt` = `SANDBOX-A-MARKER-7f3c`, session "Create Marker and Search Tsunami Datasets"                                                                                 |
| 2–3. Browser disconnect / reconnect                     | ✅ state present (Phase 5)                                                                                                                                                    |
| 4. **Pod deleted** (`kubectl delete pod user-a`)        | ✅ the controller recreated it in about 3 s (Ready at +5 s) with **the same PVC**: `/data/.created-at` 04:10, new boot 04:19                                                  |
| 5. What survived                                        | ✅ workspace files, DSH sessions and chat history, the browser cookie (no new token needed, F11). ❌ running processes and open terminals ("This terminal no longer exists"). |
| 6. **Claim deleted** (the "Start new session" analogue) | ✅ Sandbox deleted at once; Pod and PVC gone in 1.6 s; **PV deleted** (StorageClass `standard`, `reclaimPolicy: Delete`)                                                      |
| 7. Replacement claim                                    | ✅ claim → Ready 6.7 s, DSH serving 6.9 s                                                                                                                                     |
| 8. Replacement sees old state?                          | ✅ no: fresh `.created-at`, empty workspace, 0 DSH sessions, full-filesystem grep for the marker finds nothing. The old browser cookie is rejected.                           |

**PVC lifecycle.** The PVC's controller ownerReference is the Sandbox, and the Sandbox is owned by the claim. Kubernetes garbage collection therefore deletes the volume when the claim is deleted, and nothing extra is needed from the Agent Manager. With a `Retain` StorageClass, the PV would outlive the claim and the Agent Manager would need to delete it explicitly. Scaling the warm pool down also deletes un-adopted warm Sandboxes and their PVCs.

## Phase 8 — Isolation / security ✅

| Check                                                   | Result                                                                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Backing Pod uses `gvisor` + runtime evidence            | ✅ (F2)                                                                                                                                    |
| Non-root                                                | ✅ `uid=10001(agent)`                                                                                                                      |
| Privilege escalation disabled                           | ✅ `NoNewPrivs: 1`                                                                                                                         |
| Capabilities                                            | ✅ `CapEff=0`, `CapBnd=0`                                                                                                                  |
| Privileged / hostPath / hostPID / hostIPC / hostNetwork | ✅ none. Mounts: rootfs, `/data` (PVC), and kubelet-managed `/etc/hosts`, `/etc/hostname`, `/etc/resolv.conf` and termination-log, all 9p. |
| Docker / containerd / CRI-O sockets                     | ✅ absent                                                                                                                                  |
| Process visibility                                      | ✅ only the sandbox's own processes (`tini`, `node` …)                                                                                     |
| SA token (`automountServiceAccountToken: false`)        | ✅ `/var/run/secrets/kubernetes.io/serviceaccount` absent                                                                                  |
| Kubernetes API                                          | ✅ blocked by NetworkPolicy from claimed sandboxes. From an unfenced Pod, anonymous `GET …/secrets` → `403`.                               |
| Cross-sandbox filesystem (A marker searched from B)     | ✅ full-filesystem grep in B finds nothing. Separate PVC and PV per claim.                                                                 |
| Cross-sandbox network (A → B relay `:8080`)             | ✅ blocked                                                                                                                                 |
| Egress                                                  | ✅ Magda gateway `200`; Internet `api.openai.com` `401`. ❌ blocked: registry-api and authorization-api direct, Postgres `:5432`, k8s API. |
| Cloud metadata `169.254.169.254`                        | excluded from egress (no metadata service exists on minikube to test against)                                                              |
| Limits                                                  | ✅ visible inside gVisor: `nproc` 2, memory cgroup 2 GiB, CFS 200000/100000. Ephemeral-storage limits are on the Pod spec.                 |
| Memory limit enforcement                                | ✅ enforced, but by killing the **whole sandbox** (`gvisor_sentry` OOM-killed, Pod `OOMKilled`, restart ≈ 1 s, PVC intact; F12)            |

## Phase 9 — Measurements ✅

### 9.1 Lifecycle and footprint

| Metric                                                    | Value                                                                              |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Image size                                                | 1.40 GB unpacked / 294 MB compressed (on every node that runs sandboxes)           |
| SandboxClaim → Ready, cold (0-replica pool, image cached) | 1.5–2.4 s for 1 claim; 4–9 s for 4–6 concurrent claims (all Ready and DSH serving) |
| SandboxClaim → Ready, warm (1-replica pool)               | **0.34 s** (Pod created 3 s before the claim)                                      |
| Container start → DSH serving                             | ≈ 2–3 s                                                                            |
| Destroy claim → Pod and PVC gone                          | 1.6 s                                                                              |
| Destroy + recreate ("new session") → DSH serving          | ≈ 8.5 s                                                                            |
| Pod recreation (same claim) → Ready                       | ≈ 5 s                                                                              |
| Workspace volume after the mgd + pandas task              | ≈ 6.6 MB (`dsh-home` 220 KB, `workspace` 6.4 MB)                                   |
| Headless NL mgd task (search → download → analysis)       | 192 s single run; 47–73 s in the concurrent agent runs below (shorter prompt)      |

### 9.2 Baseline: what Magda and the platform pieces use

`kubectl top` (working set) on the PoC cluster:

| Component                                                                             | CPU       | Memory                |
| ------------------------------------------------------------------------------------- | --------- | --------------------- |
| Magda 7.0.0-alpha.5, full default stack (22 pods, incl. OpenSearch and embedding API) | ~60m idle | **~4.9 GiB**          |
| `kube-system` (incl. metrics-server and the gVisor addon pod)                         | ~80m      | ~0.7 GiB              |
| Agent Sandbox controller                                                              | 2m        | **22 MiB**            |
| One sandbox, idle, long-running (DSH web, sessions on disk)                           | 11–24m    | 213–251 MiB           |
| Access relay Pod (Agent Manager data-path stand-in), idle                             | 1m        | 8–14 MiB              |
| Whole node: Magda + 2 sandboxes + controller + system                                 | ≈ 340m    | **9.2 GiB** of 16 GiB |

### 9.3 Method for the load tests

- [`scripts/05-load-test.py`](../../deploy/poc/agent-sandbox-minikube/scripts/05-load-test.py) creates N claims from either pool and waits for them to be Ready and serving. After 20 s of idle it starts the workload in all N concurrently, then deletes the claims.
  - `magda-agent` is gVisor.
  - `magda-agent-runc` ([`manifests/11-sandbox-template-runc.yaml`](../../deploy/poc/agent-sandbox-minikube/manifests/11-sandbox-template-runc.yaml)) is identical except it has no `runtimeClassName`.
  - The same limits apply to both: 2 CPU / 2 GiB.
- **Measurement source:**
  - Node-side, pod-level **cgroup v2** counters: `memory.current`, `memory.peak` and `cpu.stat usage_usec`, sampled every second.
  - Pod-level means the gVisor sentry and gofer are included, which is what the scheduler and OOM killer actually see.
  - `memory.peak` is the kernel's exact high-water mark; the 1 s samples miss short spikes.
- **Workloads:**
  - **scripted**: [`scripts/bench/workload.py`](../../deploy/poc/agent-sandbox-minikube/scripts/bench/workload.py), deterministic, no LLM. It runs mgd search, mgd download (6.7 MB CSV), and a pandas generate + analyse of 5,000,000 rows (≈ 135 MB CSV, groupby/quantile/pivot). Then micro-benchmarks: Python CPU loop, 20k small files create/stat/delete, 512 MB disk write+read, 500 process spawns, 1M `getppid` syscalls, 1k loopback TCP connections, and 200 HTTP requests to the Magda gateway.
  - **agent**: one headless DSH natural-language task per sandbox. mgd search, choose a CSV, mgd download, pandas analysis, answer. Real `gpt-5.6-sol` calls; all 8 runs succeeded with identical correct analyses.
- Raw reports: [`results/*.json`](../../deploy/poc/agent-sandbox-minikube/results/).

### 9.4 Per-sandbox memory and CPU under load

| Run                       | Idle (fresh, `memory.current`) | Peak (`memory.peak`) | Sum of all pods at the peak instant | Max CPU (1 s) | CPU-seconds / sandbox ¹ | Workload wall time |
| ------------------------- | ------------------------------ | -------------------- | ----------------------------------- | ------------- | ----------------------- | ------------------ |
| scripted, gVisor, n=1     | 182 MiB                        | 1,072 MiB            | 888 MiB ²                           | 2.0 cores     | ≈ 18                    | 23.9 s             |
| scripted, runc, n=1       | 125 MiB                        | 1,002 MiB            | 812 MiB ²                           | 1.0           | ≈ 8                     | 19.7 s             |
| scripted, gVisor, **n=6** | 174–180 MiB                    | 1,054–1,068 MiB      | **5,080 MiB**                       | 1.15–1.37     | ≈ 28                    | 93–99 s            |
| scripted, runc, n=6       | 118–129 MiB                    | 991–1,004 MiB        | 4,648 MiB                           | 1.0           | ≈ 8                     | 82–84 s            |
| agent, gVisor, **n=4**    | 171–180 MiB                    | **354–361 MiB**      | **1,250 MiB**                       | 1.40–1.44     | ≈ 5                     | 49–73 s            |
| agent, runc, n=4          | 122–128 MiB                    | 293–304 MiB          | 1,075 MiB                           | 0.45–0.60     | ≈ 3                     | 47–63 s            |

¹ Approximation: average sampled cores × sampled duration. ² From 1 s samples, so below the exact `memory.peak`.

Reading:

- **A typical agent turn** (mgd + small pandas) peaks at **≈ 360 MiB** under gVisor. Most of it is DSH (≈ 180 MiB idle) plus Python/pandas.
- **Medium data analysis** (5M rows) peaks at **≈ 1.07 GiB**. Memory need is driven by the data the user analyses, not by the platform.
- **gVisor memory overhead** is ≈ **+55 MiB idle** and **+60–70 MiB at peak** per sandbox (sentry + gofer), i.e. ≈ +45% idle and ≈ +7–20% at peak.
- **gVisor CPU overhead** is ≈ 2–3.5× CPU-seconds for these workloads. Most of it is syscall-heavy steps (below); LLM-bound agent turns are cheap either way (≈ 5 vs 3 CPU-seconds).
- Under gVisor almost all sandbox memory is accounted to the host cgroup as `file`/`shmem` (anon ≈ 46 MiB of 180 MiB idle) because the sentry backs application memory with a memfd. Under runc it is mostly `anon`. Use `memory.current` / working set, not RSS or anon, when sizing gVisor sandboxes.

### 9.5 gVisor vs runc: where the overhead is (step medians, seconds)

| Step                                 | gVisor n=1 | runc n=1 | ratio n=1 | gVisor n=6 | runc n=6 | ratio n=6 |
| ------------------------------------ | ---------- | -------- | --------- | ---------- | -------- | --------- |
| `mgd search` (20 results, JSON)      | 0.25       | 0.13     | 2.0×      | 0.41       | 0.26     | 1.6×      |
| `mgd dist download` (6.7 MB)         | 1.85       | 1.76     | 1.1×      | 2.63       | 2.31     | 1.1×      |
| pandas generate 5M rows → CSV        | 5.16       | 4.57     | 1.1×      | 6.89       | 4.73     | 1.5×      |
| pandas read + groupby/quantile/pivot | 1.40       | 1.19     | 1.2×      | 1.71       | 1.27     | 1.3×      |
| Python CPU loop (20M iterations)     | 0.56       | 0.56     | 1.0×      | 0.70       | 0.66     | 1.1×      |
| create 20k small files               | 0.66       | 0.23     | 2.9×      | 2.93       | 0.27     | 10.9×     |
| stat 100k files (walk ×5)            | 0.80       | 0.12     | 6.5×      | 3.13       | 0.15     | 20.9×     |
| delete 20k files                     | 0.19       | 0.10     | 1.8×      | 0.71       | 0.17     | 4.2×      |
| 512 MB write + fsync + read          | 0.22       | 0.25     | 0.9×      | 0.24       | 2.19     | 0.1× ³    |
| spawn 500 processes                  | 0.30       | 0.09     | 3.3×      | 2.45       | 0.11     | 22×       |
| 1M `getppid` syscalls                | 1.91       | 0.14     | 13×       | 7.33       | 0.15     | 49×       |
| 1k loopback TCP connections          | 0.10       | 0.05     | 1.9×      | 0.29       | 0.03     | 9.7×      |
| 200 HTTP requests to Magda gateway   | 10.3       | 10.3     | 1.0×      | 67.6       | 70.4     | 1.0× ⁴    |
| **Whole workload**                   | **23.7**   | **19.5** | **1.2×**  | **97.4**   | **82.7** | **1.2×**  |

³ gVisor's gofer does not pass `fsync` through to the host disk synchronously, so its "disk" numbers are not comparable. Durability semantics differ; this matters only for crash consistency of the workspace.
⁴ The gateway step is bound by Magda, not by the sandbox (see 9.7).

- **Compute- and data-heavy work** (pandas, Python, downloads) runs at **1.0–1.5×** under gVisor.
- **Syscall-heavy work** (many small files, process spawning, raw syscalls, loopback sockets) is **3–13× slower** on its own. It degrades much further when 6 sandboxes share 6 cores (**10–49×**), because the sentry's syscall handling competes for CPU. runc stays flat.
- Agent workflows that `npm install`, compile, or walk large file trees will feel this most. mgd/pandas analysis barely does.

### 9.6 Proxy data path (Agent Manager stand-in)

[`scripts/06-proxy-bench.py`](../../deploy/poc/agent-sandbox-minikube/scripts/06-proxy-bench.py) + [`scripts/bench/proxy-load.mjs`](../../deploy/poc/agent-sandbox-minikube/scripts/bench/proxy-load.mjs). The path under test:

```text
in-cluster load-generator Pod → access relay Pod (Node.js, runc; same code as the in-sandbox relay)
  → sandbox relay → DSH
```

The generator authenticates with the DSH token and cookie like a browser. It runs 15 s per step at concurrency 1/10/50 against `/` (34 KB index) and the largest static asset (a 10.4 MB plugin bundle). It then holds 500 keep-alive connections. Relay and sandbox cgroups are sampled per phase.

| Target | Path          | Conc | req/s | MB/s  | p50 / p95 / p99 ms | Relay mem / CPU | Sandbox mem / CPU  |
| ------ | ------------- | ---- | ----- | ----- | ------------------ | --------------- | ------------------ |
| gVisor | index         | 1    | 1,610 | 56    | 0.6 / 0.8 / 1.1    | 29 MiB / 0.10   | 273 MiB / 1.48     |
| gVisor | index         | 10   | 3,276 | 114   | 2.4 / 3.6 / 21.8   | 30 MiB / 0.17   | 269 MiB / 2.00     |
| gVisor | index         | 50   | 3,918 | 137   | 10.1 / 30.6 / 33.9 | 48 MiB / 0.17   | 313 MiB / 1.99     |
| gVisor | 10.4 MB asset | 1    | 42    | 434   | 8.7 / 50.4 / 51.7  | 50 MiB / 0.18   | 321 MiB / 0.73     |
| gVisor | 10.4 MB asset | 10   | 150   | 1,559 | 69 / 102 / 112     | 50 MiB / 0.47   | 392 MiB / 1.92     |
| gVisor | 10.4 MB asset | 50   | 178   | 1,855 | 278 / 324 / 374    | 57 MiB / 0.53   | **650 MiB** / 1.99 |
| runc   | index         | 1    | 2,240 | 78    | 0.4 / 0.5 / 0.7    | 28 MiB / 0.11   | 196 MiB / 0.80     |
| runc   | index         | 10   | 5,586 | 195   | 1.7 / 2.2 / 2.4    | 30 MiB / 0.24   | 215 MiB / 1.44     |
| runc   | index         | 50   | 6,173 | 215   | 8.0 / 9.0 / 11.2   | 48 MiB / 0.23   | 240 MiB / 1.43     |
| runc   | 10.4 MB asset | 1    | 138   | 1,439 | 3.2 / 44.7 / 46.1  | 54 MiB / 0.41   | 247 MiB / 0.56     |
| runc   | 10.4 MB asset | 10   | 426   | 4,436 | 22 / 34 / 64       | 72 MiB / 0.93   | 341 MiB / 1.33     |
| runc   | 10.4 MB asset | 50   | 431   | 4,495 | 109 / 144 / 532    | 70 MiB / 0.97   | 417 MiB / 1.37     |

Idle and connection-holding figures:

|                                    | Relay                                                 | Sandbox                           |
| ---------------------------------- | ----------------------------------------------------- | --------------------------------- |
| Idle                               | 8 MiB                                                 | 181 MiB (gVisor) / 128 MiB (runc) |
| Holding 500 keep-alive connections | 54–57 MiB, 0.03–0.04 cores (≈ 0.1 MiB per connection) | —                                 |

Zero errors in all runs.

- **The proxy hop is cheap.** One Node.js relay process moved up to 4.5 GB/s for under 1 core and under 75 MiB. Even a naive Agent Manager data path of this shape is not a sizing concern. Real interactive DSH traffic (one user, a WebSocket and occasional assets) is several orders of magnitude below these rates.
- **gVisor caps the sandbox's own network serving at ≈ 60% of runc** for small requests and ≈ 40% for bulk transfers. The gVisor sandbox is CPU-bound at its 2-core limit (netstack in the sentry), whereas runc used ≈ 1.4 cores.
- **Socket buffers count against the sandbox's memory.** Under 50 concurrent 10 MB downloads, the gVisor sandbox grew to 650 MiB, and that memory is charged to the same 2 GiB limit that kills the whole sandbox when exceeded (F12).

### 9.7 Magda itself under concurrent agents

- The 200-request gateway step took 10.3 s with one sandbox (≈ 51 ms per request, identical under gVisor and runc). With 6 sandboxes concurrently it took **67–70 s on both runtimes**, i.e. the cluster served only ≈ 17 authenticated-path requests/s in total.
- During the run, `authorization-api` (OPA policy decisions) used **445m CPU**, the highest of any component.
- So the single-replica Magda authorization path is the first bottleneck when several agents call Magda APIs in loops. It is not the sandboxes.

### 9.8 Sizing guidance (derived from the measurements above)

**Minimal test deploy, on top of an existing Magda:**

| Item                                          | Amount                                                                                       |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Agent Sandbox controller                      | ~25 MiB, ~0 CPU                                                                              |
| Per sandbox, idle                             | ~180 MiB (fresh) to ~250 MiB (long-running)                                                  |
| Per sandbox, active agent turn                | ~360 MiB peak                                                                                |
| Per sandbox, medium pandas analysis (5M rows) | ~1.1 GiB peak                                                                                |
| Node disk                                     | 1.4 GB per node for the image, plus one PVC per session (2 GiB requested; MBs used in tests) |
| **Recommended headroom for 1–2 test users**   | **≈ 1.5–2.5 GiB memory, 1–2 CPU** beyond Magda (allow one user to run a medium analysis)     |

The PoC template requests 512 MiB / 250m, so the scheduler reserves ≈ 0.55 GiB per sandbox even when idle.

**Production (per-user long-lived sessions):**

| Item                                                   | Recommendation                                                                                                                 | Basis                                                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Sandbox memory request                                 | 512 MiB                                                                                                                        | idle 180–250 MiB + typical turn ≤ 360 MiB                                                                                        |
| Sandbox memory limit                                   | 2–4 GiB (higher for data-heavy tenants)                                                                                        | medium analysis 1.1 GiB; bulk socket buffering up to 650 MiB; exceeding the limit kills the **whole** session (F12), so err high |
| Sandbox CPU request / limit                            | 250m / 2                                                                                                                       | idle ≈ 15m; turns spike to 1.4–2 cores under gVisor; syscall-heavy work is CPU-bound in the sentry                               |
| Memory per **open** session (sessions never idle-stop) | ≈ 0.25 GiB steady state                                                                                                        | e.g. 50 open sessions ≈ 12.5 GiB used, ≈ 25 GiB requested at 512 MiB                                                             |
| Memory per **concurrently active** session             | ≈ 0.4 GiB typical, ≈ 1.1+ GiB for data analysis                                                                                | 9.4                                                                                                                              |
| CPU per concurrently active session                    | ≈ 0.5–1 core average (bursts to 2)                                                                                             | 9.4 / 9.5                                                                                                                        |
| Warm pool                                              | ≈ 0.18 GiB per warm replica                                                                                                    | turns cold start (2–9 s) into 0.34 s                                                                                             |
| Agent Manager / proxy data path                        | ≈ 10 MiB idle + ≈ 0.1 MiB per held connection; < 1 core per ~4 GB/s                                                            | 9.6 (relay stand-in; Agent Manager control-plane logic is not built yet)                                                         |
| Agent Sandbox controller                               | ≈ 25 MiB                                                                                                                       | 9.2                                                                                                                              |
| Storage                                                | 1 PVC per session (size for expected downloads); deleted with the session                                                      | Phase 7                                                                                                                          |
| Magda                                                  | scale `authorization-api` (and the registry) for agent API traffic; the single replica tops out at ≈ 17 req/s on this hardware | 9.7                                                                                                                              |

Example: a cluster for 50 users with open sessions, of whom 10 are working at the same time (2 doing heavier analysis), needs ≈ 40 × 0.25 + 8 × 0.4 + 2 × 1.2 ≈ **15.6 GiB used** and ≈ 8–10 cores of burst capacity for the agent tier. With 512 MiB requests that is ≥ 25 GiB schedulable memory, plus Magda's own footprint (≈ 5 GiB for the full default stack) with authz/registry scaled out. The LLM is an external API and needs no cluster resources.

## Acceptance criteria

| Criterion                                                       | Status                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------- |
| Clean Minikube with a functional `gvisor` RuntimeClass          | ✅ (needs the F1 workaround)                            |
| gVisor proven from inside a workload                            | ✅                                                      |
| Agent Sandbox core + extensions installed                       | ✅                                                      |
| SandboxClaim creates a gVisor-backed sandbox                    | ✅                                                      |
| Reproducible image runs DSH + mgd in the sandbox                | ✅                                                      |
| DSH web UI reachable locally and reconnects to the same session | ✅ via in-sandbox relay + access Pod (F3)               |
| Shell, file and PTY/terminal operations                         | ✅ / ⚠️ PTY inside confined bash fails (F6)             |
| Read-only and workspace-write tested, backend recorded          | ✅ bwrap. ⚠️ read-only unusable without approvals (F7). |
| mgd real read-only workflow                                     | ✅                                                      |
| DSH drives mgd from natural language                            | ✅ (headless and browser)                               |
| Workspace persists across disconnect / reconnect                | ✅ (also across Pod recreation)                         |
| Delete/recreate gives a clean environment                       | ✅                                                      |
| Two sandboxes cannot read each other's data                     | ✅                                                      |
| No Kubernetes SA credential                                     | ✅                                                      |
| Non-root, no host or runtime mounts                             | ✅                                                      |
| CPU / memory / storage limits configured and observable         | ✅ (memory OOM kills the whole sandbox, F12)            |
| Startup and resource measurements                               | ✅                                                      |
| Reproducible from committed material                            | ✅                                                      |
| Findings fed back into #3811 / #3810                            | see [Implications](#implications-for-3811--3810)        |

## Incidental observations

- **Magda 7.0.0-alpha.5 fresh install on minikube.** The `authorization-db-migrator` post-install hook hit its backoff limit and the DB schemas were never created. The registry then failed with `role "client" does not exist`, and the indexer and minions crash-looped. Re-running the hooks fixed it: `helm upgrade --reuse-values` followed by `kubectl rollout restart deploy -n magda`. This looks like a DB-readiness race and is worth its own issue if it reproduces.
- The minikube Docker-driver Pods take 30 s to stop when `node` runs as PID 1, because node ignores SIGTERM. The access relay runs under `tini` for that reason.
- **Load-test harness:** `memory.peak` per pod cgroup (cgroup v2, node kernel 7.0) gives exact high-water marks that `kubectl top` (15–60 s resolution) and 1 s sampling both miss. Use it for future sizing work.
- Some harvested data.gov.au distributions point at stale (404) URLs. The agent noticed and adapted.
- DSH's workspace picker in the UI can browse the whole sandbox filesystem (e.g. `/data/dsh-home`). That is harmless inside a per-user sandbox, but the Magda UI customisation may want to pin the workspace.

## Implications for #3811 / #3810

1. **Routing (F3, F11).**
   - Agent Manager → in-sandbox relay on `podIP:8080`, with NetworkPolicy admitting only the Agent Manager.
   - The browser never sees Pod addresses. DSH's token cookie remains the per-session authenticator.
   - The Agent Manager must capture the startup token (stdout today; ask DSH for a token file or hook) and either perform the exchange server-side or hand the browser a one-time URL.
   - Because DSH validates Host/Origin, the Agent Manager must either preserve a trusted Host or pass `--trusted-host` (`DSH_TRUSTED_HOSTS` in the PoC entrypoint).
2. **Pod identity (F10).** Resolve sandboxes through `claim.status.sandbox.name` (warm adoption keeps pool names). Use claim name ↔ user mapping as the Agent Manager's source of truth.
3. **Warm pools vs per-user config (F10).** Warm adoption (0.34 s vs 2–7 s cold) only works if claims carry no `env` or volume overrides. Deliver the user's Magda credential after adoption (Agent Manager pushes it into the sandbox, or the sandbox fetches it with a one-time capability).
4. **Runtime matrix (F4, F5).** gVisor + bwrap gives full DSH enforcement. runc degrades DSH to Landlock. Report the DSH backend and enforcement level in sandbox health.
5. **Permission default (F7).** Use `workspace-write` + ask. Raise the read-only bash schema issue with DSH upstream.
6. **Terminal (F6).** The web terminal is unconfined by DSH and the agent's confined bash has no PTY. Decide whether the Magda UI exposes the terminal, and track devpts-in-bwrap-under-gVisor upstream (DSH and/or gVisor).
7. **Resource failure mode (F12).** One memory-hungry command restarts the whole session runtime. Add per-command limits in the DSH executor (or a cgroup inside the sandbox) and show OOM restarts to the user.
8. **Lifecycle.** "Start new session" = delete claim, then create claim. GC removes the Sandbox, Pod, PVC and PV (with a `Delete` StorageClass) in under 2 s. With `Retain` storage the Agent Manager must clean up PVs.
9. **Egress (F13).** The template-level NetworkPolicy works. Production needs an explicit gateway allow, a metadata deny, and an LLM / external-data egress design.
10. **gVisor installation (F1).** Pin by release and checksum. Do not trust addon or distro "latest" URLs.
11. **Sizing (F14–F16, F18).** Budget ≈ 0.25 GiB per open session plus ≈ 0.4–1.1 GiB per concurrently active one. Use 512 MiB requests with 2–4 GiB limits. The proxy tier is negligible. Scale Magda's authorization path for agent traffic. See Phase 9.8.
12. **Session naming (F17).** Use unique claim names per session.
13. **Credentials.** The PoC shares one OpenAI key across sandboxes via a Secret env var. That is acceptable for local testing only. Production needs per-user budgets or keys, or an Agent-Manager-mediated LLM proxy.
