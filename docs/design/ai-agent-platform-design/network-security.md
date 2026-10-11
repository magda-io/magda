# Network and sandbox security design

**Status:** Draft — intended isolation accepted; GKE enforcement and IAM boundary require qualification  
**Owner:** #3811 / GKE #3848; coordinates with #3822, #3824, #3825 and #3838  
**Evidence:** local PoC #3844; real GKE PoC #3852 (transport validated; network isolation **not** validated)

## Trust and attacker model

DSH and its tools execute code controlled or influenced by user prompts, external data and plugins. Assume a running Sandbox may execute untrusted commands and access its own user-scoped Magda API key. Network controls protect **other Sandboxes, cluster services, cloud credentials and the control plane**; they do **not** prevent exfiltration of the Magda key already deliberately present inside an Internet-connected Sandbox.

Security layers are complementary: gVisor/Kata runtime isolation, unprivileged Pod configuration, **functioning** NetworkPolicy/egress enforcement, minimal Kubernetes/Cloud IAM permissions, Magda server-side authorization, and browser/Gateway/Manager authentication. A DSH Host/Origin fence and \`workspace-write\` approval policy are **not** network isolation or server-side delegated-authority controls.

## Sandbox ingress — enforced default deny

No public Sandbox Service/Pod exposure and no Sandbox-to-Sandbox ingress. Allow DSH \`:3080\` only from the installation's intended Agent Manager Pods and only for the necessary TCP port. No bridge sidecar. Namespace, release and Pod selectors must continue to isolate multiple Magda installations even when they explicitly share an agent namespace.

A Kubernetes \`NetworkPolicy\` object alone is insufficient: its effective enforcement must be verified.

## Sandbox egress policy

The initial product allows controlled public Internet access so the agent can fetch public data/tools. Intended boundary:

- **Allow:** DNS through the selected resolver; approved public Internet; HTTPS to the Magda **external** endpoint for both \`mgd\` and \`/api/v0/llm/...\`. Internal LiteLLM is not a direct Sandbox dependency.
- **Deny:** Kubernetes API/control-plane, unintended Pod/Service/VPC networks, private and link-local destinations, metadata services, other users' Sandboxes, direct internal services including LiteLLM, unless a strictly necessary, reviewed exception is defined.
- Public FQDN policies cannot in general be expressed fully by standard Kubernetes NetworkPolicy; provider CNI features or an egress proxy may be needed for stronger controls. Verify external-DNS-to-internal-address and traffic redirection/hairpin paths in the actual environment.

The runtime's explicit ingress-controller egress exception reflects the external-Magda route; it is not permission to call arbitrary internal services.

## Mandatory enforcement qualification on GKE

**Observed in #3852:** the tested GKE Standard cluster had \`LEGACY_DATAPATH\` and no Calico NetworkPolicy enforcement. KAS created valid NetworkPolicy objects, **but a disallowed Pod reached DSH, and a Sandbox reached a private ClusterIP and the private control-plane endpoint**. This is a **failed security precondition of the cluster**, not successful isolation. GKE gVisor and a created policy do not compensate for absent policy enforcement.

A GKE Agent Workspace deployment is **unsupported for untrusted workloads** until the operator has enabled and demonstrated enforcing NetworkPolicy (e.g. Dataplane V2 or a suitably configured Calico deployment). Magda's current #3850 Helm pre-install hook checks KAS API discovery/RuntimeClass, **not** effective enforcement; document and enforce the distinction.

Minimum positive/negative test matrix, in the **same environment/path** intended for the client deployment:

| Flow | Required result |
| --- | --- |
| Approved installation Agent Manager -> its Sandbox DSH \`:3080\` | Allow |
| Other namespace/other release/peer Sandbox -> that DSH service | **Deny** |
| Sandbox -> configured DNS resolver | Allow |
| Sandbox -> intended external Magda HTTPS API/LLM route | Allow |
| Sandbox -> approved public HTTPS endpoint | Allow per deployment policy |
| Sandbox -> other in-cluster service, Pod/Service CIDRs or private VPC address | **Deny**, except documented narrow exceptions |
| Sandbox -> Kubernetes API/private control-plane endpoint | **Deny** |
| Sandbox -> cloud metadata token endpoint | Deny if supported and compatible with GKE requirements; otherwise document the necessary exception and verify **zero useful IAM privilege** |

Run probes from an actual gVisor/KAS Sandbox and disallowed peer; record cluster version/CNI, tests, packet paths, policies and effective results. A configuration flag, CRD existence or API query alone does **not** prove enforcement. A deny-all canary can assist qualification; an install-time check must not claim proof without a real traffic test.

## GKE metadata server and Workload Identity boundary

**Observed in #3852:** \`automountServiceAccountToken: false\` was set, but requests to the GKE metadata server's \`.../service-accounts/default/token\` endpoint returned HTTP **200** from the Sandbox. \`kube-env\` returned 404. The PoC recorded HTTP statuses **only**: it did **not** establish what IAM permissions, if any, were granted by the returned token.

Therefore:

1. Use a dedicated minimally privileged Kubernetes ServiceAccount for Sandbox Pods instead of implicitly inheriting a namespace \`default\` identity; do not give it Kubernetes API permissions or unnecessary Google IAM roles. \`automountServiceAccountToken: false\` remains useful, but does **not** block metadata-server network access.
2. Audit all GKE Workload Identity Federation grants affecting that identity, **especially broad namespace or workload identity pool \`principalSet\` IAM grants**; check permissions by an actual authorized/denied IAM probe, not solely by token HTTP status.
3. Test metadata-path isolation on the enforcing GKE datapath. Some GKE features require metadata-server connectivity; validate the relevant platform addresses and GKE NetworkPolicy/Workload Identity requirements before denying a CIDR indiscriminately. If metadata access must remain, achieve the boundary through **no effective IAM permissions**, audited policy and explicit residual-risk documentation.
4. Keep GKE Cloud identity **separate** from Magda's deliberately sandbox-held, expiring user API key. Never mount node, provider or Agent Manager credentials.

**Open design decision:** the exact explicit ServiceAccount name/namespace contract, whether GKE metadata denial is technically enforceable for the chosen CNI without impairing necessary services, and the required preflight/IAM verification procedure. Track these as security acceptance criteria, not assumptions already achieved.

## LiteLLM network boundary

\`\`\`text
Sandbox -> direct LiteLLM: denied
external client -> direct LiteLLM: denied
Magda LLM Services -> LiteLLM: allowed
\`\`\`

LiteLLM provider and internal service credentials remain outside Sandbox Pods.

## Other protected assets and hardening

Protect host/kernel and other tenants, Kubernetes control plane, other users' PVCs, internal Magda/private networks, cloud/LLM provider credentials, protected skills and deployment control credentials.

Common Pod baseline:

- GKE: gVisor on a qualified GKE Sandbox node pool; AKS: Kata after separate qualification; \`runc\` is trusted local development only.
- Non-root UID/GID, no privilege escalation or extra capabilities, no host network/PID/IPC, no \`hostPath\`/container runtime socket, bounded CPU/memory/storage, \`automountServiceAccountToken: false\`.
- No automatic Kubernetes ServiceAccount token mounting; **do not** infer that this excludes GKE metadata-server-issued Google tokens.
- Per-Sandbox PVC plus GKE CSI ownership setting \`fsGroupChangePolicy: OnRootMismatch\`; otherwise remount can weaken file modes and make DSH refuse startup.
- Verify actual runtime/CNI/storage/IAM behaviour on each deployment provider and after meaningful changes.

Provider-specific GKE security controls belong in deploy-time prerequisites/qualification and runtime configuration, not Magda Agent Manager application business logic.

## Qualification status

- **#3844 (Minikube):** local DSH HTTP/WSS, network policy matrix and runc/gVisor behaviour tested.
- **#3852 (real GKE):** external L4 ingress, gVisor/KAS, DNS/public egress, WebSockets, and PD CSI verified. **GKE NetworkPolicy isolation not enforced; Cloud IAM privileges unknown.**
- **#3850 (MVP draft):** security-oriented Helm templates and KAS API/RuntimeClass preflight implemented, **but no real enforcing-GKE network/metadata IAM qualification shown**.

Do not advertise full GKE sandbox security qualification until the negative network matrix and Cloud identity tests pass on the selected real cluster.
