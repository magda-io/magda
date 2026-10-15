# Agent Workspace architecture and deployment

## Status and scope

Agent Workspace is an opt-in Magda capability that gives each authorized user a
private, browser-based coding and data-analysis agent. The MVP embeds DeepSeek
Harness (DSH) Web under **Settings → Agent Workspace**, bundles the `mgd` CLI,
and connects the agent to Magda using the current user's authority.

The feature is disabled by default with `global.agentWorkspace.enabled=false`.
The MVP additionally restricts access to members of Magda's **Admin Users** role.
It supports one current workspace per user.

## Architecture

![Agent Workspace architecture](./_resources/agent-workspace-architecture.png)

The browser uses same-origin Settings, lifecycle, DSH HTTP/WebSocket, and LLM
routes. Agent execution is isolated in a per-user Sandbox and PVC; model-provider
credentials remain in the Magda namespace.

### Components

- **Magda Web** exposes the feature-flagged, admin-only Settings route and renders
  lifecycle state. When ready, it embeds the runtime through
  `/api/v0/agent/runtime/` with DSH's native responsive sidebar, session history,
  Search, and collapse/expand navigation.
- **Agent Manager** is stateless. It authenticates the Gateway session, checks
  current role membership through `whoami`, manages Kubernetes resources,
  bootstraps the runtime, proxies DSH HTTP/WebSocket traffic, and reconciles idle
  workspaces.
- **Kubernetes Agent Sandbox** provides the per-user execution boundary. The
  qualified release is Kubernetes Agent Sandbox v1.0.4. The installation renders
  exactly one selected runc, gVisor, or Kata template and warm pool.
- **Agent Runtime** pins DSH, bundles `mgd`, and applies a deployment-owned Cordis
  profile. The workspace is mounted at `/data/workspace`; runtime configuration
  and DSH state are stored on the same per-user PVC.
- **LLM Services** independently authenticates the Magda user and allowlists
  deployment-selected model IDs before proxying to LiteLLM. Provider errors are
  sanitized at this boundary.
- **LiteLLM** holds the provider configuration. Provider credentials enter only
  through a Kubernetes Secret and are never sent to the browser or Sandbox.
- **Authorization API and DB migration** provide expiring system-managed API
  keys. These keys are private, hidden from public key lists, and immutable
  through public key-management routes.

## Lifecycle and resource identity

A user UUID and stable installation ID map deterministically to the claim name
`magda-agent-<installation ID>-<user UUID>`. Claims carry both
`agent.magda.io/installation-id` and `agent.magda.io/user-id` labels.
The user-visible states are:

`ABSENT`, `ALLOCATING`, `BOOTSTRAPPING`, `READY`, `SUSPENDING`, `SUSPENDED`,
`RESUMING`, `DELETING`, `FAILED`, and `DEGRADED`.

Provisioning performs these operations:

1. Create the installation-scoped user's `SandboxClaim` from the selected warm
   pool, making interrupted provisioning discoverable before issuing a secret.
2. Rotate the installation-scoped reserved managed API key. Its expiry follows
   the current eight-hour inactivity deadline.
3. Wait for the claim and Sandbox Pod to become ready.
4. Send a one-time bootstrap payload through `pods/exec` over stdin.
5. Write `mgd` configuration and DSH environment to mode-0600 files on the PVC.
6. Restart the runtime container and require post-bootstrap readiness before
   returning `READY`.

Idle `READY` workspaces are suspended even if an otherwise idle runtime WebSocket
remains open. While the workspace iframe is visible, the Settings page continues
polling lifecycle status so suspension replaces the stale iframe with the Resume
UI. Resume reuses the PVC and Sandbox and renews the deadline. Reset, explicit deletion, and logout revoke the key,
close sockets, delete the claim and storage, and remove all DSH sessions and
workspace files. Logout waits for cleanup before destroying the Magda session.
Any destructive cleanup that is only partially completed remains durably
`DELETING`; reconciliation retries key revocation and claim/PVC deletion after a
dependency recovers rather than stranding the workspace in `FAILED`. Reset also
persists its replacement intent, so successful retry cleanup provisions the fresh
workspace requested by the user. Reconciliation is single-flight globally and
shares the per-user lifecycle lock with UI actions; Terminate durably clears the
intent and cancels any in-flight replacement before it can be reprovisioned.

### One workspace, multiple sessions

A Magda user has one current SandboxClaim, PVC, filesystem workspace, and managed
API key per Magda installation. That Sandbox can hold multiple native DSH
**Sessions**. New Session creates another conversation in the existing
`/data/workspace`; it does not allocate another Sandbox, PVC, or key. The DSH
sidebar provides creation, history, rename, Search, switching, and reopening.
Sessions and files survive browser refresh, Pod replacement, and suspend/resume
because DSH state and `/data/workspace` share the PVC. Reset, Terminate, and
logout remove all sessions and files with that single workspace.

The PVC uses deployment-owned names rather than upstream product names:

- `/data/agent-home` contains DSH profiles, credentials, session logs, and storage;
- `/data/workspace/agent-harness/default-workspace` is the default working tree.

The pinned DSH release hard-codes its `deepseek-harness` directory segment, so
the runtime Dockerfile performs a fail-closed, version-specific replacement when
building the image. This pre-release path rename deliberately has no PVC migration:
reset local test workspaces after deploying it so the new workspace starts with
only the deployment-owned names.

## Authentication and trust boundaries

- Browser cookies and Gateway session headers terminate at Agent Manager. They
  are stripped before proxying to DSH.
- Agent Manager exchanges the memory-only DSH launch token for a DSH cookie and
  never returns either credential to the browser.
- The runtime receives a lifecycle-bound Magda key as raw `<key-id>:<key>`.
  DSH's OpenAI adapter adds the HTTP authorization scheme. Adding `Bearer` to
  the stored value is incorrect because DSH expects a raw API key.
- `mgd` uses the same lifecycle-bound user key against the configured external
  Magda `/api` base URL, so normal Magda authorization remains authoritative.
- Agent Manager RBAC includes `pods/exec` for bootstrap and deliberately excludes
  `pods/log` to avoid exposing the one-time payload.
- Gateway logout cleanup uses both a system JWT and a separate randomly generated
  control-plane secret. Destructive cleanup is same-origin gated.
- The Sandbox NetworkPolicy allows DNS, the selected ingress controller, and
  explicitly configured external CIDRs/ports. Private address ranges otherwise
  remain denied.

## Agent Skills publication API

Agent Services exposes the authenticated public surface
`/api/v0/agent/skills` for paginated READY metadata, metadata reads, validated
ZIP download, creation, replacement, and deletion. Workspace lifecycle routes
remain under their existing admin gate; skill routes accept ordinary authenticated
users and then enforce the typed
`object/agentSkill/{system,user}/{create,read,update,delete}` OPA operations.

Agent Skill metadata is stored as Registry records with `agent-skill` and
`access-control` aspects. The immutable record ID is derived server-side from
the immutable intended-user `agent-skill.userId` and root `SKILL.md` name: user
skills use `agent-skill-<user-uuid>-<name>` and system skills use
`agent-skill-system-<suffix>` for a full `system-<suffix>` name. For ordinary MVP
user publishing, `userId`, `access-control.ownerId`, and the authenticated actor
must match; the two fields remain distinct for future explicitly delegated use. Names are at
most 46 lowercase letters/digits with interior hyphens; user names cannot use
the `system-` prefix, and runtime-bundled names such as `capture-workflow` and
`magda-mgd` are reserved. Registry's primary key atomically enforces each
intended user's namespace, so the API never accepts a caller-selected ID or uses
full-text search for uniqueness. Different users may publish the same name.

The record name, `agent-skill.name`, and description are derived from `SKILL.md`
rather than accepted as independent API input. The two name copies must match;
the aspect copy allows Registry's existing `q` full-text search to index names,
including the components of hyphenated names. Replacements may update the
description but must preserve the name; renaming creates a new skill. The
Registry-backed publication states are `PENDING`, `READY`, and `DELETING`; only
READY records are catalogued. The default **All** query is one Registry-side
`READY AND (type=system OR userId=<caller>)` query, **My Skills** adds
`type=user` and `userId:<caller>`, and the future **Shared Skills** source view
adds `type=user` and `userId:!<caller>`. Registry applies these predicates and
OPA before sequence-keyset pagination, so other users' readable publications do
not leak into default pages and independent cursors never need post-hoc merging.
Catalogue traversal uses `reversePageTokenOrder=true`, never the unsupported
`orderBy` plus `pageToken` combination.

The typed OPA policy delegates `agent-skill` records exclusively by their actual
or proposed `type`; generic record grants cannot read or mutate them. Read rules
use Registry-compatible literal/existence conditions for partial authorization,
then Agent Services validates the full deterministic identity of every returned
record before exposing it. Typed write rules validate identity directly. Registry includes the trusted
original record in proposed-state authorization, preventing marker removal and
enforcing immutable publication type, intended user, ID/name, creator, archive
linkage, and record owner. Registry also applies these invariants before its
normal administrator override. Bulk mutation of typed skill records or either
skill marker is rejected; callers must use single-record CRUD so proposed state
is authorized. Separately authorized direct Registry callers can still create
integrity mismatches where no prior publication state exists. Agent Services
fails closed on an inconsistent or wrong-type record and never overwrites it or
attaches a ZIP.

Authorization migrations register separate system, user, and future-installation
CRUD resources. The unassigned **Agent Workspace Users** stock role contains
owner user/installation CRUD plus OrgUnit- and pre-authorised-constrained typed
reads; both read permissions allow explicitly exempt records. The unassigned
**Agent Skills Admins** role contains unconstrained system CRUD, allowing trusted
staff to publish without global administrator status. Neither role is granted to
Authenticated Users. #3858 owns `agentWorkspace/access` and attaches it to the
existing Workspace role in a later migration, so this stage never references a
nonexistent operation. Installation operations and their owner permission are
registered for #3861, but no installation record, API, policy, or sharing
functionality is activated here. Agent Services marks managed system
publications `constraintExemption=true`, so holders of an applicable
exemption-capable typed system-read permission can discover them. Here public
means broadly available to those authorised users, never anonymous access.
Later #3857/#3861 management may add OrgUnit and explicit-recipient grants;
those grants remain additive while public is enabled. User publications remain
owner-private unless explicitly constrained or shared.

Each skill has one record-linked ZIP in the existing
`global.defaultDatasetBucket`:

```text
agent-services/skills/system-skills/<record-id>.zip
agent-services/skills/user-skills/<intended-user-uuid>/<record-id>.zip
```

Agent Services authenticates and authorises the real caller for exactly the
requested typed operation. Normal list/read/download and each caller OPA decision
use only that caller's `X-Magda-Session`. For lifecycle-only lookups and state
transitions that would otherwise imply an unrelated permission, Agent Services
mints a two-minute HS256 session for MAGDA's existing
`DEFAULT_ADMIN_USER_ID`; that token is confined to validated Agent Skill client
calls and is never returned, logged, stored, or forwarded to a Workspace,
browser, DSH, or `mgd`. The initial Registry create and Storage upload use the
real caller, update writes use the caller's update authority, and final delete
uses the caller's delete authority. Explicit `createdBy`, `updatedBy`, and
`access-control.ownerId` always retain real-user attribution.

Storage API assigns the original object owner and `magda-record-id`; replacement
uses the same key and a trusted existing record link so neither can be rebound by
query parameters. It preserves ownership while Registry records the current
publisher in `updatedBy`. Typed linked access additionally requires the object
key to equal `archiveKey` and Storage owner to equal Registry owner.

Create requires only typed create, writes PENDING before the caller-owned upload,
and uses the internal principal to mark READY after Storage succeeds. Delete
requires only typed delete; its internal DELETING marker does not imply caller
update authority. Storage's linked-record policy uses a trusted object-existence
flag so create cannot replace an existing archive and only delete can remove one.
Replacement validates first, hides the record as PENDING during publication, and
restores READY after the same object is replaced. Delete marks DELETING, removes
the ZIP, then removes the Registry record. A caller can safely retry partial
operations with the same type, intended user, owner, immutable name, and archive. Downloads
are bounded and are released only after ZIP revalidation and checksum/name/description agreement
with Registry metadata.

ZIP validation rejects malformed or encrypted archives, traversal and absolute
paths, duplicate/conflicting paths, links and special files, excessive size,
entry count, path length or nesting, missing/invalid `SKILL.md`, and invalid skill
names. User skills are Markdown-only. System skills may contain arbitrary regular
supporting files, including scripts, images, and model assets, subject to the same
archive entry, path, type, CRC, count, and size limits. Audit logs contain actor,
operation, type, record ID, result and error code only—never session credentials
or archive content.

## Managed DSH profile decisions

The deployment, not the user, owns provider, model, plugin, permission, and
reasoning configuration. The managed profile therefore:

- defaults to `workspace-write` with approval policy `ask`;
- exposes only the deployment-selected model and reasoning levels;
- hides provider/model/plugin configuration pages;
- removes the Model, Permission, and Feedback commands from the composer menu;
- disables persistent `danger-full-access` selection;
- keeps DSH's native sidebar, New Session, session history/switching, Search, and
  collapse/expand behavior;
- brands the sidebar **Agent Workspace** through DSH's `sidebar.brand.mark` and
  `sidebar.brand.name` slots and uses the same **M** mark in the empty-chat hero
  through `conversation.hero.brand.mark`;
- hides Automation tasks, Plugins, the Settings trigger, Workspace View Options,
  Add Workspace, Delete workspace, and the redundant new-session workspace
  chooser; and
- keeps every session rooted in the one managed `/data/workspace` filesystem.

The Settings and permission services remain mounted even though their buttons or
selectors are hidden. This preserves enforcement while removing the interactive
selector from the managed UI. DSH registers `/permission` from that same core service, so the
runtime includes a small client-only managed-profile plugin that filters the
command from composer candidates without weakening host-side enforcement.

For reasoning models with tools, the DSH route uses the OpenAI Responses API.
For example, GPT-5.6 Sol with `reasoningEffort: high` cannot use function tools
through Chat Completions, but it does support them through `/v1/responses`.
LLM Services proxies both Responses and Chat Completions for compatibility.

## Key implementation decisions

### Stateless manager, Kubernetes-owned state

The manager can restart without an application database. Claims, Sandbox status,
annotations, PVCs, and the Authorization DB are the durable sources of truth.
Per-user in-flight operations are serialized; destructive operations queue
behind provisioning rather than being silently dropped. Agent Manager is pinned
to one replica with a `Recreate` deployment strategy. Activity updates also use a
Kubernetes `resourceVersion` compare-and-swap, and Authorization applies API-key
expiry as `max(current, requested)`, so even a stale writer cannot shorten a
durable deadline. Every installation gets
a stable release/namespace-derived identifier. Claim names, labels, list
selectors, warm-pool resources, RBAC, and managed API-key names include that
identifier, so two Magda installations cannot adopt or delete one another's
workspaces even if an operator deliberately shares a Sandbox namespace.

### Meaningful inactivity lifecycle

The accepted lifecycle is 30 minutes of meaningful inactivity before suspension
and eight hours before permanent deletion. Both values are configurable. For the
alpha, **meaningful activity** begins when Agent Manager accepts an authenticated,
allowlisted DSH mutation RPC (for example prompt, session/terminal create, rename,
write, cancel, or delete), plus an explicit resume or an executing foreground
Agent turn. The lease is persisted before the mutation is sent to DSH; if lease
persistence fails, the proxy rejects the request without executing it. DSH uses
HTTP `POST` for both reads and writes, so method alone is deliberately
insufficient. DSH reports foreground execution through the
`api-session/status` Remote event. While that state is running, Agent Manager
renews activity at a bounded interval, including turns longer than the
30-minute suspension threshold. Per-socket ownership prevents one of several
browser sockets from clearing another, a short disconnect grace covers transport
reconnect, and the authoritative `session/list` running snapshot restores the
baseline after reconnect. Each request is tagged with its browser-connection
epoch and a monotonic sequence. A snapshot is accepted only while that exact
epoch is active and it is newer than the last successfully applied snapshot.
An older successful response is buffered while any newer request remains pending:
a newer success supersedes it, while failure, malformed data, oversize or abort
cancels the newer token and releases the newest buffered valid response. Zero/live
transport boundaries and
Remote status events invalidate older requests, while unrelated secondary-socket
churn does not discard a surviving baseline. Consequently,
out-of-order responses and responses arriving after disconnect/reconnect cannot
create or resurrect foreground activity. Existing snapshot ownership expires
after the last browser transport disconnects, so a missed settlement cannot
renew an abandoned workspace forever. Page loads, other list/catalog/status RPCs,
unauthenticated or non-allowlisted requests, oversized bodies rejected by the
proxy, lifecycle polling, merely opening a WebSocket, ordinary Remote-stream
traffic, and WebSocket heartbeat/ping-pong frames do not renew the deadline.

A meaningful request first advances the persisted claim activity timestamp and
`SandboxClaim.spec.lifecycle.shutdownTime`, then extends the managed Magda API
key to the same deadline. Per-user writes are serialized and take the maximum of
the requested and persisted timestamps, so old or concurrent requests cannot
shorten either deadline. Failed writes remain retryable; key extension has a
bounded immediate backoff before periodic reconciliation takes over. Reconciliation reads the
persisted timestamp after Manager restart and repairs a partial key extension.
It also completes persisted suspend/resume/delete transitions;
an interrupted allocation/bootstrap is destroyed after credential revocation.
If revocation is temporarily unavailable, the claim remains `DELETING` with key
identity intact and reconciliation retries before removing the PVC. It suspends a running
Sandbox after 30 minutes and permanently
deletes the claim (and its owner-controlled PVC) and credential after eight
hours. Reset and logout remain immediate destructive operations.

### Warm pools

Warm Sandboxes reduce first-use latency. The claim's reported Sandbox name is
always used rather than predicting a Pod name. A replacement unclaimed Sandbox
is created automatically after adoption.

### External Magda route from the Sandbox

`mgd` and LLM calls intentionally use the external Gateway rather than bypassing
it with service-to-service URLs. This exercises ordinary authentication,
authorization, routing, and audit boundaries. Local self-signed deployments must
map the external hostname to the ingress Service IP and mount its CA certificate.

### Memory-only token handoff

The DSH launch token is written to a memory-backed `emptyDir`, read by Agent
Manager with `pods/exec`, and exchanged server-side. It is not stored on the PVC
or exposed through Pod logs.

### Same-origin runtime proxy

Serving DSH below the Magda origin avoids third-party-cookie and iframe-origin
problems. The proxy supports WebSockets, pins the upstream Host, caps request
bodies, authenticates before buffering, deduplicates cookie exchange, and closes
open sockets during destructive lifecycle operations.

## Helm configuration

LLM Services is independently deployable. Agent Workspace requires it:

```yaml
global:
  agentWorkspace:
    enabled: true
    # Empty derives <release-namespace>-agents with collision-safe truncation.
    sandboxNamespace: ""
  llmServices:
    enabled: true
  defaultAgentModel:
    # Stable MAGDA/DSH-facing alias; provider upgrades do not change it.
    alias: magda-agent-default
    providerModel: openai/gpt-5.6-sol
    # Set to "" to omit the setting and use the provider default.
    reasoningEffort: medium
    contextWindow: 1050000
    maxTokens: 128000

agent-services:
  warmPool:
    type: gvisor # runc, gvisor, or kata
    size: 2
  runtimeClasses:
    gvisor: gvisor
    kata: kata
  hardDeleteSeconds: 28800
  idleSuspendSeconds: 1800
  # Optional overrides inherit global.defaultAgentModel when omitted.
  llm:
    model: ""
    contextWindow: null
    maxTokens: null
  runtime:
    storage:
      size: 5Gi

llm-services:
  # An empty list inherits global.defaultAgentModel.alias.
  allowedModels: []
  litellm:
    enabled: true
    # Optional overrides; empty values inherit global.defaultAgentModel.
    model:
      alias: ""
      providerModel: ""
```

The merged `agent-services` chart owns the Manager Deployment, Service, RBAC,
control Secret, Sandbox namespace, and exactly one selected SandboxTemplate and
SandboxWarmPool. `runc` omits `runtimeClassName` and is intended only for trusted
local development. gVisor and Kata default to RuntimeClasses named `gvisor` and
`kata`, which may be overridden.

Changing `warmPool.type` while claims exist is a migration, not an in-place
runtime switch. Drain or reset active workspaces, confirm their claims and warm
Sandboxes are gone, then upgrade the release and admit new workspaces.

### Mandatory migration from the split charts

Upgrading from the earlier `agent-manager` + `agent-runtime` charts to
`agent-services` is also a **drain/reset migration**. Legacy claim names and
managed-key names were user-scoped but not installation-scoped. The new Manager
intentionally does not adopt those resources, and Helm replaces the old
unhashed Template/WarmPool. Before upgrading:

1. Ask every user to publish durable results, then reset or log out through the
   old Manager. Do not manually delete a claim first: reset/logout revokes the
   legacy `magda-agent-workspace` managed key before deleting its claim and PVC.
2. Confirm no claimed legacy workspaces remain. Unclaimed old warm Sandboxes may
   remain until Helm removes the old pool during the upgrade:

   ```sh
   kubectl -n <sandbox-namespace> get sandboxclaims,sandboxes,pvc
   kubectl get sandboxclaims -A \
     -l '!agent.magda.io/installation-id'
   ```

3. If the old Manager cannot perform cleanup, use an administrator-issued system
   JWT with the trusted Authorization API private route to revoke each user's
   key named `magda-agent-workspace`, and only then remove that user's legacy
   claim/PVC. Never carry a raw legacy credential into the new runtime.
4. Upgrade Helm. Verify that exactly one installation-hashed Template/Pool is
   present, every new claim has `agent.magda.io/installation-id`, and no legacy
   managed keys, unscoped claims, claimed Sandboxes, or user PVCs remain. Users
   can then start clean installation-scoped workspaces.

With bundled LiteLLM enabled, its service URL and retained master-key Secret are
derived automatically. To use an external backend, set
`llm-services.litellm.enabled=false` and provide all of
`llm-services.backend.url`, `masterKeySecret.name`, and `masterKeySecret.key`.
Provider credentials remain confined to LiteLLM. The bundled chart reads an
optional provider credential from `providerSecret.name`/`providerSecret.key`
through the fixed internal environment name `LITELLM_PROVIDER_API_KEY`; leave
both Secret fields empty for a workload-identity or credential-free provider.
The bundled LiteLLM configuration exposes exactly one model, so its effective
allowlist must contain exactly one matching alias. An external
LiteLLM-compatible backend may expose multiple aliases:

```yaml
llm-services:
  allowedModels:
    - magda-agent-default
    - another-model
  litellm:
    enabled: false
  backend:
    url: https://llm.example/v1
    masterKeySecret:
      name: external-litellm-key
      key: master-key
```

MAGDA cannot inspect an external backend's model catalog. The operator is
responsible for ensuring every allowlisted alias exists there, and the Agent
Workspace model is included in the list. This deployment-wide allowlist remains
an independent restriction even when per-user OPA model authorization is added.

The stable public alias is `magda-agent-default`; changing only
`global.defaultAgentModel.providerModel` changes the bundled backend route
without changing DSH or LLM Services clients. The default explicitly selects
`medium` reasoning, with a 1,050,000-token context window and 128,000-token
maximum output. Set `global.defaultAgentModel.reasoningEffort: ""` to omit the
reasoning setting from both DSH and LiteLLM and let the provider choose its model
default. This is distinct from the explicit `off` effort. When selecting another
model, update `providerModel`, `reasoningEffort`, `contextWindow`, and `maxTokens`
to its capabilities. See the
[GPT-5.6 Sol model specification](https://developers.openai.com/api/docs/models/gpt-5.6-sol).

Model settings are written into a workspace during provisioning. Existing
PVC-backed workspaces are intentionally not rebootstraped during a Helm upgrade;
reset development or pre-release workspaces after changing these settings so a
stale alias or reasoning effort is not retained.

## Deployment

### Prerequisites

1. A Kubernetes cluster with an ingress controller and a working Magda release.
2. Kubernetes Agent Sandbox v1.0.4 installed cluster-wide:

   ```sh
   kubectl apply --server-side -f \
     https://github.com/kubernetes-sigs/agent-sandbox/releases/download/v1.0.4/sandbox-with-extensions.yaml
   kubectl -n agent-sandbox-system rollout status deploy --timeout=300s
   ```

   KAS remains a cluster prerequisite, not a Magda Helm dependency. An
   `agent-services` pre-install/pre-upgrade hook checks the expected v1beta1 APIs
   and the selected gVisor/Kata RuntimeClass. The hook runs only during a real
   installation, so offline `helm lint` and `helm template` continue to work.

3. A Magda authentication plugin or another way to establish an administrator
   session. `magda-auth-internal` is not a dependency of `magda-core`.
4. Images for Agent Manager, Agent Runtime, LLM Services, Authorization API,
   Gateway, Web Server, and Authorization DB Migrator published to a registry
   accessible by the cluster.
5. A provider API key stored outside Helm values:

   ```sh
   kubectl -n <magda-namespace> create secret generic litellm-provider \
     --from-literal=api-key="$OPENAI_API_KEY" \
     --dry-run=client -o yaml | kubectl apply -f -
   ```

### Build local images

From the repository root, the following commands build the new services. Use
organisation-specific image names/tags for a shared registry:

```sh
(
  cd magda-agent-manager
  ../node_modules/.bin/create-docker-context-for-node-component \
    --build --tag localhost:5000/magda-agent-manager:latest --local
)
(
  cd magda-llm-services
  ../node_modules/.bin/create-docker-context-for-node-component \
    --build --tag localhost:5000/magda-llm-services:latest --local
)
yarn workspace @magda/agent-runtime docker-build-local --version latest
```

Build the changed existing components using the repository's standard component
builder, including `magda-authorization-api`, `magda-gateway`,
`magda-web-server`, and `magda-migrator-authorization-db`.

### Minikube-specific setup

The supplied `deploy/helm/magda-core/agent-workspace-minikube-values.yaml`
expects local images loaded into Minikube. For each local image:

```sh
minikube -p <profile> image load localhost:5000/<image>:latest
```

Create the Sandbox namespace and trust the local ingress certificate:

```sh
kubectl create namespace magda-agent --dry-run=client -o yaml | kubectl apply -f -
INGRESS_IP=$(kubectl -n ingress-nginx get svc ingress-nginx-controller \
  -o jsonpath='{.spec.clusterIP}')
kubectl -n ingress-nginx get secret magda-test-tls \
  -o jsonpath='{.data.tls\.crt}' | base64 --decode >/tmp/magda-agent-ca.crt
kubectl -n magda-agent create secret generic magda-agent-trusted-ca \
  --from-file=ca.crt=/tmp/magda-agent-ca.crt \
  --dry-run=client -o yaml | kubectl apply -f -
```

Generate the cluster-specific ingress override. Do not commit the ephemeral
Service IP:

```sh
cat >/tmp/agent-workspace-ingress-values.yaml <<EOF
agent-services:
  runtime:
    hostAliases:
      - ip: ${INGRESS_IP}
        hostnames: [magda.test]
    externalPrivateCidrs: [${INGRESS_IP}/32]
    externalPrivatePorts: [443]
EOF
```

Refresh chart dependencies and deploy:

```sh
helm dependency update deploy/helm/magda-core
helm upgrade --install magda deploy/helm/magda-core \
  --namespace magda --create-namespace \
  -f deploy/helm/magda-core/agent-workspace-minikube-values.yaml \
  -f /tmp/agent-workspace-ingress-values.yaml \
  --set global.agentWorkspace.enabled=true \
  --timeout 15m --wait
```

Because `magda-core` deliberately does not own authentication plugins, install
the internal password plugin as a separate release for local sign-in. The
Minikube values above already register its service URL with Gateway:

```sh
helm upgrade --install magda-auth-internal \
  deploy/helm/local-deployment/charts/magda-auth-internal-4.0.0.tgz \
  --namespace magda \
  --set global.magdaCompatibilityCheck=false \
  --set global.externalUrl=https://magda.test:18443 \
  --timeout 5m --wait
curl --fail --silent --show-error --insecure \
  https://magda.test:18443/auth/plugins
```

The final command must return an entry whose key is `internal`; an empty array
means Gateway has not registered the plugin and the password form will not be
shown.

If deploying through the top-level `deploy/helm/magda` umbrella, run
`helm dependency update deploy/helm/magda` first so its generated local
`magda-core` dependency is current.

For a Docker-driver Minikube profile, expose ingress ports when creating the
profile or use a persistent port-forward. Map `magda.test` to `127.0.0.1` on the
browser host when using a local port mapping:

```text
127.0.0.1 magda.test
```

### Production deployment

Use the same values through the normal Magda umbrella or deployment repository,
with these differences:

- publish versioned images and configure the standard global image registry and
  pull secrets;
- use a real external hostname and trusted TLS certificate;
- omit local `hostAliases` when cluster DNS resolves the external name, while
  retaining the required NetworkPolicy destination;
- provision `litellm-provider` through the platform secret manager;
- select a qualified gVisor or Kata RuntimeClass and size the one selected warm
  pool and its PVCs (`runc` is trusted local-development only);
- set permanent-delete and idle-suspension inactivity values for the
  organisation's policy;
- include the Authorization DB migration before starting the updated
  Authorization API; and
- retain `global.agentWorkspace.enabled=false` until all dependencies, secrets,
  and security qualification checks are ready.

### GKE alpha reference profile

The GKE work in [PR #3852](https://github.com/magda-io/magda/pull/3852)
provides real interoperability evidence for GKE Standard, a dedicated GKE
Sandbox/gVisor node pool, KAS v1.0.4, a regional L4 passthrough NLB terminating
TLS at community ingress-nginx, HTTPS/WSS, and PD CSI provision/remount/reclaim.
It also found the CSI ownership issue addressed by
`fsGroupChangePolicy: OnRootMismatch`.

It did **not** qualify the integrated Magda Gateway/auth/logout path, real
LiteLLM/provider access, effective GKE NetworkPolicy enforcement, Workload
Identity isolation, warm pools greater than zero, multiple users, HA,
multi-zone operation, node upgrades, cert-manager, or native GCE L7/Gateway API.
The supplied `agent-workspace-gke-values.yaml` is therefore an **alpha reference
profile**, not a qualified production profile. Do not claim GKE production or
security qualification until the functional gates below pass.

#### Cluster and gVisor prerequisites

Use GKE Standard with NetworkPolicy enforcement provided by **GKE Dataplane V2**
(preferably selected at cluster creation with `--enable-dataplane-v2`) or a
separately qualified Calico configuration. Create a dedicated, non-default
COS_CONTAINERD node pool with `--sandbox type=gvisor`; production Sandbox nodes
must not be Spot/preemptible. Keep ordinary system workloads on a non-Sandbox
pool. Verify the GKE-managed `gvisor` RuntimeClass and its
`sandbox.gke.io/runtime=gvisor` scheduling requirements:

```sh
gcloud container clusters describe "$CLUSTER" --location "$LOCATION" \
  --format='yaml(datapathProvider,networkPolicy,workloadIdentityConfig)'
gcloud container node-pools list --cluster "$CLUSTER" --location "$LOCATION"
kubectl get runtimeclass gvisor -o yaml
kubectl get apiservice | grep agents.x-k8s.io
```

KAS v1.0.4 remains an external prerequisite. `pods/exec` must work because Agent
Manager uses it for the one-time launch-token/bootstrap hand-off. GKE gVisor does
not support `kubectl port-forward`, but this architecture does not depend on it.
Published runtime images must include amd64 and be pullable from Artifact
Registry by the nodes or configured image pull secrets.

#### NetworkPolicy is a hard functional prerequisite

Creating or listing NetworkPolicy objects does **not** demonstrate enforcement.
The #3852 cluster accepted KAS-managed policies while an unauthorized Pod could
reach DSH and the Sandbox could reach private services and the control-plane
endpoint. The Helm KAS preflight intentionally checks APIs and RuntimeClass only;
it cannot prove dataplane behavior.

Before enabling Agent Workspace for untrusted workloads, run a disposable traffic
matrix and retain the evidence:

1. confirm Agent Manager can reach the claimed Sandbox Service on TCP 3080;
2. confirm ordinary probe Pods in both the Magda and Sandbox namespaces, without
   the allowed labels, time out when connecting to Sandbox TCP 3080;
3. from the Sandbox, confirm kube-dns, the configured external Magda HTTPS
   endpoint, and an approved public HTTPS endpoint work;
4. from the Sandbox, confirm direct Agent Manager, Registry, Authorization,
   PostgreSQL and other Sandbox ClusterIPs, every private or public
   Kubernetes/control-plane endpoint, and `169.254.169.254` time out; public
   control-plane addresses must be added as exact `/32` entries in
   `agent-services.runtime.deniedCidrs`;
5. repeat after suspend/resume and Sandbox Pod replacement.

Any forbidden successful connection fails qualification. If enforcement cannot be
verified, leave Agent Workspace disabled. The authoritative intended matrix is in
`agent-services/templates/runtime.yaml`; the executable procedure is in the
Agent Workspace end-to-end test document.

#### Sandbox Kubernetes and Google Cloud identity

Every Sandbox Pod uses a dedicated installation-scoped Kubernetes ServiceAccount
in the Sandbox namespace. It has no RoleBinding or ClusterRoleBinding, no Google
IAM binding, and `automountServiceAccountToken: false`. Agent Manager has a
separate KSA and Kubernetes RBAC; never reuse that identity for a Sandbox.

On GKE, `automountServiceAccountToken: false` prevents a projected Kubernetes
credential but does **not** make the GKE metadata server inaccessible. PR #3852
received HTTP 200 from the Workload Identity token endpoint; obtaining a token
alone does not prove that the identity has useful IAM permissions. Operators must:

- inspect the Pod `serviceAccountName` and KSA annotations and confirm Kubernetes
  API authorization is denied;
- audit direct IAM bindings for the Sandbox KSA and broader Workload Identity
  Federation grants to namespace or pool-wide `principalSet` principals;
- grant neither `roles/iam.workloadIdentityUser` nor Google resource roles to the
  Sandbox identity by default; and
- identify the metadata identity, audit its effective permissions, and verify
  access to unrelated Google Cloud resources is denied.

Metadata-server blocking through NetworkPolicy remains unverified until tested on
an enforcing GKE dataplane. If the identity has unintended permissions or the
required isolation cannot be established, do not enable Agent Workspace.

#### ingress-nginx, IngressClass and external NLB

Install the controller separately with a unique class and verify ownership:

```yaml
controller:
  ingressClass: magda-agent-nginx
  ingressClassResource:
    name: magda-agent-nginx
    controllerValue: k8s.io/ingress-nginx
  service:
    type: LoadBalancer
    externalTrafficPolicy: Local
    annotations:
      cloud.google.com/l4-rbs: "enabled"
    loadBalancerSourceRanges: ["<approved-cidr>"]
```

```sh
kubectl get ingressclass magda-agent-nginx \
  -o jsonpath='{.spec.controller}{"\n"}'
```

The result must be `k8s.io/ingress-nginx`. Do not assume a class named `nginx` is
community ingress-nginx: the #3852 cluster's class with that name belonged to the
F5 controller (`nginx.org/ingress-controller`), which does not consume community
annotations. Set `cloud.google.com/l4-rbs: enabled` when creating the controller
Service; adding it later does not migrate a legacy target-pool load balancer.

Verify in GCP that the external forwarding rule is regional EXTERNAL TCP on ports
80/443, targets a regional TCP backend service using GCE_VM_IP NEGs, and has no
URL map or target HTTP(S) proxy. TLS terminates in ingress-nginx. Native GCE L7
Ingress/BackendConfig and Gateway API remain outside this alpha profile.

Set `ingress.proxyReadTimeout` and `proxySendTimeout` to 3600. The NLB has no HTTP
timeout, but nginx defaults close quiet sockets after about 60 seconds. Test a
quiet socket beyond 60 seconds and the selected operational window, streaming,
and browser reconnect after Gateway/Manager restart. A controller config reload
can close existing sockets at `worker-shutdown-timeout` (240 seconds by default)
without a WebSocket close frame; DSH must reconnect. Shared-controller changes
can therefore interrupt sessions.

> **Controller lifecycle warning:** community ingress-nginx v1.15.1/chart 4.15.1
> was its final release in March 2026 and receives no future fixes. Its GKE PoC
> evidence remains useful only as a frozen alpha path. New production adoption
> requires explicit risk acceptance and a time-bound migration plan. Any
> successor controller requires fresh WSS, timeout, reload, and NetworkPolicy
> qualification; F5 NGINX is not a drop-in replacement.

#### Persistent storage

The tested GKE profile explicitly selects `standard-rwo`: PD CSI
(`pd.csi.storage.gke.io`), ReadWriteOnce, `WaitForFirstConsumer`, and reclaim
policy `Delete`. Zonal PD pins the Sandbox to one zone; regional/multi-zone
storage, capacity, performance, and backup policy remain operator decisions and
are not qualified. Workspaces remain temporary.

Verify a marker file, DSH session, and credential mode before and after
suspend/resume and Pod deletion. The same PVC must survive and the credential
must remain mode 0600. Deleting the claim must remove Sandbox, Pod, Service, PVC,
PV, and GCE disk. A StorageClass with reclaim policy `Retain` requires explicit
operator cleanup and does not satisfy the automatic deletion claim.

### Basic smoke verification

After deployment:

```sh
kubectl -n magda rollout status deploy/agent-manager
kubectl -n magda rollout status deploy/llm-services
kubectl -n magda rollout status deploy/litellm
kubectl -n magda-agent get sandboxclaims,sandboxes,pods
```

Log in as an administrator, open **Settings → Agent Workspace**, start the
workspace, and wait for `READY`. Verify the managed DSH UI, a real model/tool
response through `/api/v0/llm/v1/responses`, `mgd auth status`, a Registry read,
and destructive cleanup of the claim and managed key.

This smoke test is not a GKE security qualification. The full lifecycle test and
mandatory GKE qualification gate—including gVisor, positive/negative networking,
KSA/IAM/metadata, NLB shape, WSS reload/reconnect, CSI lifecycle/reclaim and
cleanup evidence—is in `docs/docs/e2e-test-cases/agent-workspace.md`.

## Operational notes

- Agent Runtime is a versioned workspace package. The normal Docker CI publishes
  both amd64 and arm64 manifests and the release retag/push path copies
  `magda-agent-runtime` alongside other Magda images. DSH remains pinned to the
  qualified runtime version in the Dockerfile.
- A same-tag local runtime image does not replace existing warm Sandboxes. Delete
  only the unclaimed warm Sandbox and wait for its replacement before resetting a
  test workspace onto a rebuilt image.
- LiteLLM configuration changes require a Pod restart unless the deployment
  template checksum changes.
- A `runAsNonRoot` image must declare a numeric UID. Agent Manager and LLM
  Services use UID 1000; Agent Runtime uses UID/GID 10001. Its Pod security
  context sets `fsGroupChangePolicy: OnRootMismatch`; this is required on GKE PD
  CSI and similar volumes so remounts do not broaden DSH's mode-0600 credential
  file and break resume or Pod replacement.
- Local GPT-5.6 Sol use required a 1 GiB LiteLLM memory limit during qualification.
- Reset and logout are destructive by design. Publish important outputs to Magda
  or another durable store first.
