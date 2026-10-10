# Agent Workspace End-to-End Test

## Purpose

Verify the integrated Agent Workspace path through a real Minikube deployment:

```text
browser -> ingress -> gateway -> Agent Manager -> Agent Sandbox -> DSH Web
DSH / mgd -> external gateway -> Magda APIs / Magda LLM Services -> LiteLLM
```

This case covers the user-visible lifecycle, the trusted-header boundary, stock
DSH launch-token hand-off, persistent workspace behavior and both local runtime
profiles. See [Agent Workspace architecture and deployment](../architecture/agent-workspace.md)
for implementation details, key decisions, configuration, and deployment steps.

## Prerequisites

- Minikube with the `ingress` addon and enough memory for Magda plus a DSH
  sandbox.
- Kubernetes Agent Sandbox **v1.0.4** (the qualified version):

  ```sh
  kubectl apply --server-side -f \
    https://github.com/kubernetes-sigs/agent-sandbox/releases/download/v1.0.4/sandbox-with-extensions.yaml
  kubectl -n agent-sandbox-system rollout status deploy --timeout=300s
  ```

- The local Agent Manager, LLM Services and Agent Runtime images built and
  loaded into Minikube.
- `global.agentWorkspace.enabled=true` in the Magda Helm values. For a local
  self-signed ingress, route the in-Sandbox API URL through the ingress service
  and copy its CA into the Sandbox namespace before installing:

  ```sh
  INGRESS_IP=$(kubectl -n ingress-nginx get svc ingress-nginx-controller \
    -o jsonpath='{.spec.clusterIP}')
  kubectl create namespace magda-agent --dry-run=client -o yaml | kubectl apply -f -
  kubectl -n ingress-nginx get secret magda-test-tls \
    -o jsonpath='{.data.tls\.crt}' | base64 --decode >/tmp/magda-agent-ca.crt
  kubectl -n magda-agent create secret generic magda-agent-trusted-ca \
    --from-file=ca.crt=/tmp/magda-agent-ca.crt --dry-run=client -o yaml | kubectl apply -f -
  ```

  Generate the cluster-specific Helm override (do not commit the ephemeral
  Service IP) and pass it after `agent-workspace-minikube-values.yaml`:

  ```sh
  cat >/tmp/agent-workspace-ingress-values.yaml <<EOF
  agent-runtime:
    hostAliases:
      - ip: ${INGRESS_IP}
        hostnames: [magda.test]
    externalPrivateCidrs: [${INGRESS_IP}/32]
    externalPrivatePorts: [443]
  EOF
  ```

  The committed local values set
  `agent-manager.sandboxNamespaceResource.create=false` because this procedure
  pre-creates the namespace. They also set the in-Sandbox API URLs and select
  `magda-agent-trusted-ca` with `trustedCaSecret`.

- An admin login. `magda-auth-internal` is not a `magda-core` dependency; install
  it as a separate release or include it in an umbrella chart if password login
  is desired.
- For a real model response, create the provider secret before deployment:

  ```sh
  kubectl -n <magda-namespace> create secret generic litellm-provider \
    --from-literal=api-key="$OPENAI_API_KEY"
  ```

  Without this secret, the lifecycle and DSH paths remain testable and LLM calls
  should return a useful provider-credential error.

## Browser journey

1. Log in as an administrator and open **Settings -> Agent Workspace**.
2. Confirm the introduction states one workspace per user, user authority,
   suspend/resume behavior, temporary-file durability, and destructive
   reset/logout behavior.
3. Select **Start Agent Workspace**. Observe `ALLOCATING`, then
   `BOOTSTRAPPING`, then the embedded stock DSH UI (`READY`). Kubernetes names
   and addresses must not appear in the UI.
4. Start a conversation. Confirm new sessions use `workspace-write`, sandbox
   mode `workspace-write`, and approval policy `ask`; DSH navigation and the
   Feedback, Permission, and Model composer commands are absent; provider/model/
   plugin management and persistent danger-full-access are unavailable.
5. Ask the agent to run `mgd auth status` and a representative read such as a
   dataset search. The call must go through the external Magda endpoint using
   the lifecycle-bound user API key.
6. Ask for a throwaway dataset mutation. The bundled `mgd` guidance must ask for
   explicit confirmation before executing it. Confirm, verify the result, then
   clean it up.
7. Send a tool-using prompt that produces a streamed model response. Confirm a
   reasoning model follows `/api/v0/llm/v1/responses` (Chat Completions remains
   available for compatible models) and no provider credential appears in the
   browser or Sandbox.

## Lifecycle and security checks

Run each check while watching the Settings page and Kubernetes resources:

- Refresh the browser and reconnect to the same DSH workspace/session.
- Delete the DSH Pod. Confirm DSH restarts against the same PVC and the browser
  reconnects.
- Patch the bound Sandbox to `spec.operatingMode: Suspended`, confirm the UI
  offers Resume, resume it, and verify the same files/session remain.
- Set the selected warm pool to one replica before starting a second test user.
  Confirm claim adoption uses `claim.status.sandbox.name` and the pool creates a
  fresh replacement.
- Reset the workspace. Confirm the old claim, Sandbox, Pod, Service, PVC and
  reserved managed API key are deleted; a fresh generation/key/PVC is created.
- Open a DSH WebSocket and log out. Confirm the socket closes promptly and all
  workspace resources and the managed API key are deleted before logout
  completes.
- Log in as a non-admin. Confirm the navigation item is hidden and direct Agent
  Manager and LLM requests return 403.
- Inspect Agent Manager RBAC: it must include `pods/exec` but not `pods/log`.
- Inspect DSH requests at the Sandbox boundary: `X-Magda-Session`, browser
  cookies, `Authorization`, proxy authorization, and Magda API-key headers must
  be absent; `Host` must be the configured external authority.
- Confirm the launch-token file is on the memory `emptyDir`, mode 0600, is read
  with `pods/exec`, and neither token nor DSH cookie reaches browser responses or
  Pod logs.

Repeat the core browser, `mgd`, LLM streaming, refresh and reset journey with:

1. `agent-manager.warmPool=magda-agent-runc`; and
2. `agent-manager.warmPool=magda-agent-gvisor` with the Minikube gVisor runtime
   installed.

## Expected result

All transitions are visible and recoverable, the same-origin DSH iframe and
`/api/remote.mux` WebSocket work through the gateway, persisted state survives
restart/suspend, destructive transitions remove credentials and storage, and
both backend services independently reject non-admin users.
