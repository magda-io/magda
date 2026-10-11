# Sandbox runtime design

**Status:** Foundation Accepted (#3822); installation scoping and CSI facts implemented/proven in MVP/GKE PoC; GKE security qualification remains open  
**Owner ticket:** #3822  
**Depends on:** design overview and [network-security.md](./network-security.md)  
**Evidence:** #3812 / PR #3817, local PR #3844, GKE PR #3852, MVP PR #3850

## Resource ownership

| Resource | Owner |
| --- | --- |
| \`SandboxTemplate\` / \`SandboxWarmPool\` | Magda Helm \`agent-services\` chart (one selected type/pool per release) |
| \`SandboxClaim\` | Agent Manager |
| \`Sandbox\`, Pod, internal headless Service | Kubernetes Agent Sandbox controller |
| Template-created PVC | KAS controller / selected StorageClass |

Kubernetes Agent Sandbox CRDs/controller are a **separate cluster prerequisite**. The Manager uses the Kubernetes API, not a separate controller REST service.

## One current Sandbox per installation and user

One current \`SandboxClaim\` exists for each Magda **installation + authenticated user UUID**, with no separate Agent session DB/id. The #3850 installation ID is a stable 12-character hash of Helm release namespace/name. Current deterministic claim format:

\`\`\`text
magda-agent-<installation-id>-<user-uuid>
\`\`\`

Labels include \`agent.magda.io/installation-id\` and \`agent.magda.io/user-id\`. This preserves the one-current-Sandbox UX **within a Magda installation**, without accidentally treating a second Magda release's same user UUID as the same Sandbox. The claim's \`metadata.uid\` is the incarnation identifier when required.

The default Sandbox namespace is \`<release-namespace>-agents\`, truncated/hashed for Kubernetes naming limits; an explicit override is supported. Claim listing, adoption, cleanup, warm-pool names, and reserved managed-key names are installation-scoped even when an operator explicitly shares a Sandbox namespace. The old \`magda-agent-<user-uuid>\` example is superseded.

## Stable and derived identifiers

- User + installation -> deterministic claim name; claim -> adopted Sandbox via **\`SandboxClaim.status.sandbox.name\`**.
- Adoption retains the original warm-pool Sandbox name; **claim and Sandbox names can differ**.
- Current KAS contract: backing Pod has the Sandbox name and, when enabled, \`Sandbox.status.serviceFQDN\` identifies its KAS-created Service.
- With \`service: true\`, keep Sandbox/Pod/Service names within the Kubernetes DNS label limit; do not assume an arbitrarily long claim name is safe.

## Sandbox contents and process model

The Pod carries pinned DSH and its Magda profile, \`mgd\`, approved analysis tools, trusted skills and a private PVC. DSH binds directly to the Pod network at \`0.0.0.0:3080\`. **There is no bridge sidecar.**

A warm Sandbox may start DSH before assignment, without the eventual user's credential. On claim/adoption, Agent Manager transfers bootstrap data through \`pods/exec\` stdin and configures persistent DSH/\`mgd\` profiles. Never inject user secrets in SandboxClaim metadata/env or leave them on the image. Warm adoption must be preserved.

Suspension or Pod replacement preserves **filesystem state, not arbitrary process memory**. Running terminal tools/foreground execution may be interrupted (see the explicit lifecycle semantics question in [session-lifecycle.md](./session-lifecycle.md)).

## Persistent volume and GKE CSI contract

A dedicated PVC contains DSH home/journals/workspace files, DSH managed config/credentials, and \`mgd\` state. It survives suspend/resume and replacement; reset, logout and permanent claim deletion must delete it. StorageClass reclaim must ensure the backing persistent volume/disk is eventually deleted.

**Verified real-GKE finding (#3852):** with GKE PD CSI and \`fsGroup: 10001\`, the default Kubernetes \`fsGroupChangePolicy: Always\` recursively changed DSH's \`0600\` credential file to \`0660\` on remount, and DSH rejected startup after suspend/resume or Pod replacement. The problem also occurred under **runc**, so it is a CSI ownership issue, not a gVisor-only bug. The fix \`fsGroupChangePolicy: OnRootMismatch\` was tested on GKE and is already in the #3850 runtime template. Verify restrictive credential modes after remount.

The #3852 zonal GKE test also verified claim/PVC/PV/GCE PD deletion with reclaim policy \`Delete\`. **Regional storage/HA, zone rescheduling, cross-zone failover and Spot preemption are not qualified.** A zonal PV constrains where replacement Pods can run; production topology and StorageClass must be chosen together.

## Single selected WarmPool and runtime

\`\`\`yaml
agent-services:
  warmPool:
    type: gvisor  # runc | gvisor | kata
    size: 2       # local 0; production starting point 2
  runtimeClasses:
    gvisor: gvisor
    kata: kata
\`\`\`

The selected type renders **one** \`SandboxTemplate\` and \`SandboxWarmPool\`. \`runc\` omits a RuntimeClass and is strictly a trusted-development configuration. The number is a target for unclaimed warm Sandboxes; a claimed Sandbox/PVC never returns to the pool. Changing type or moving from the old split charts requires an explicit drain/reset migration.

Runtime options:

| Environment | Runtime | Qualification/status |
| --- | --- | --- |
| Local developer | runc | Trusted single-developer only |
| Local security / Minikube | gVisor | Local PoC #3844 |
| GKE | GKE Sandbox / gVisor | **Runtime, transport and zonal PD verified** in #3852; **network policy and cloud IAM not yet secure-qualified** |
| AKS | Kata Pod Sandboxing | Separate provider qualification required |
| EKS | Future option | #3821, out of initial scope |

GKE Standard requires a **dedicated GKE Sandbox node pool** with \`--sandbox type=gvisor\` (not the default node pool) and a GKE-managed \`gvisor\` RuntimeClass providing the scheduling selector/toleration. In #3852 a small Spot test pool was used for cost control; **Spot node preemption is not acceptable as an assumed durable production execution guarantee**.

The Agent Manager must not contain provider-specific gVisor/Kata control logic.

## Common hardening

- Non-root UID/GID, \`allowPrivilegeEscalation: false\`, capabilities dropped, no privileged containers/host namespaces/\`hostPath\`/runtime socket.
- \`automountServiceAccountToken: false\`, finite resources/storage, per-Sandbox enforced NetworkPolicy, and qualified KSA/cloud IAM policy.
- **GKE exception:** the metadata server returned a Google Workload Identity token response in #3852 despite \`automountServiceAccountToken: false\`. A dedicated least-privileged Sandbox KSA and tested IAM/network boundary remain requirements ([network-security.md](./network-security.md)).
- GKE Pod \`seccompProfile: RuntimeDefault\` can be admitted while host seccomp does not apply inside the gVisor sandbox; do not mislabel it as an extra effective in-sandbox guard.
- Direct DSH Service must admit only this installation's Agent Manager; network-policy **enforcement**, not merely the manifest, must be proven.

## Required qualification

Separate application and provider evidence:

- #3844: local Minikube/runc/gVisor DSH, HTTP/WebSocket, auth and lifecycle.
- #3852: GKE L4/ingress-nginx/DSH/gVisor **and zonal GCE PD storage**; did **not** exercise full Gateway/auth or an enforcing CNI.
- #3850: the integrated Magda Agent MVP with installation-scoped Helm/Manager and CSI fix (draft; local E2E).
- GKE client deployment: rerun isolation matrix on Dataplane V2/qualified Calico, verify effective Workload Identity permissions, GKE ingress controller provenance, and production storage constraints before asserting end-to-end security qualification.
