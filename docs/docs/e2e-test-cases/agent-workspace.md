# Agent Workspace End-to-End Test

## Purpose

Verify the integrated Agent Workspace path through a real Minikube deployment,
then apply the separate GKE alpha security-qualification extension where relevant:

```text
browser -> ingress -> gateway -> Agent Manager -> Agent Sandbox -> DSH Web
DSH / mgd -> external gateway -> Magda APIs / Magda LLM Services -> LiteLLM
```

This case covers the user-visible lifecycle, the trusted-header boundary, stock
DSH launch-token hand-off, persistent workspace behavior and both local runtime
profiles. See [Agent Workspace architecture](../architecture/agent-workspace.md) for
component contracts, [deployment and operations](../agent-workspace-deployment.md)
for installation, and [Agent Skills architecture](../architecture/agent-skills.md)
for publication and synchronization details.

## Prerequisites

- Minikube with the `ingress` addon and enough memory for Magda plus a DSH
  sandbox.
- Kubernetes Agent Sandbox **v1.0.4** (the qualified version):

  ```sh
  kubectl apply --server-side -f \
    https://github.com/kubernetes-sigs/agent-sandbox/releases/download/v1.0.4/sandbox-with-extensions.yaml
  kubectl -n agent-sandbox-system rollout status deploy --timeout=300s
  ```

- The local Agent Manager, LLM Services and Agent Runtime images, plus the
  changed existing components listed in
  [Build local images](../agent-workspace-deployment.md#build-local-images)
  (including `magda-opa` and `magda-storage-api`), built and loaded into
  Minikube. Reset any workspace created by an earlier development
  image before qualification: bootstrap configuration is PVC-backed and an
  existing claim is not reprovisioned by a Helm upgrade.
- The [local qualification overlay](../../../deploy/helm/agent-workspace-minikube.yml)
  enables `global.agentWorkspace.enabled=true` and targets
  `deploy/helm/local-deployment` (`local-deployment → magda → magda-core`).
  Component values are under `magda.magda-core`, while shared `global` values
  remain at the overlay root. Install with the documented
  [umbrella Helm command](../agent-workspace-deployment.md#minikube-specific-setup). For a local
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

  The certificate copied into the Sandbox must also be the certificate served
  by the ingress Service. When the local Ingress omits `tls.secretName`, make
  `magda-test-tls` the ingress-nginx default certificate (add the argument only
  once), then wait for the controller rollout:

  ```sh
  kubectl -n ingress-nginx get deploy ingress-nginx-controller \
    -o jsonpath='{.spec.template.spec.containers[0].args}' | \
    grep -- '--default-ssl-certificate=ingress-nginx/magda-test-tls' || \
    kubectl -n ingress-nginx patch deploy ingress-nginx-controller --type=json \
      -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--default-ssl-certificate=ingress-nginx/magda-test-tls"}]'
  kubectl -n ingress-nginx rollout status deploy/ingress-nginx-controller
  ```

  Alternatively, set the Ingress `tls.secretName`, with the TLS Secret in the
  same namespace as the Ingress. Do not trust a copied certificate while the
  controller is still serving its generated fake certificate.

  Generate the cluster-specific Helm override (do not commit the ephemeral
  Service IP) and pass it after `deploy/helm/agent-workspace-minikube.yml`:

  ```sh
  cat >/tmp/agent-workspace-ingress-values.yaml <<EOF
  magda:
    magda-core:
      agent-services:
        runtime:
          hostAliases:
            - ip: ${INGRESS_IP}
              hostnames: [magda.test]
          externalPrivateCidrs: [${INGRESS_IP}/32]
          externalPrivatePorts: [443]
  EOF
  ```

  The committed local values set
  `magda.magda-core.agent-services.sandboxNamespace.create=false` because
  this procedure pre-creates the namespace. They also set the in-Sandbox API
  URLs and select `magda-agent-trusted-ca` using
  `magda.magda-core.agent-services.runtime.trustedCaSecret`.

- An admin login, plus a non-admin login for the access checks below.
  The `local-deployment` umbrella includes the `magda-auth-internal` dependency;
  verify it is enabled and registered at `/auth/plugins`. Do **not** install
  a second independent plugin release over the umbrella-owned deployment.
  Standalone `magda-core` and custom parent deployments configure their own
  authentication plugins separately.
- For a real model response, create the provider secret before deployment:

  ```sh
  kubectl -n <magda-namespace> create secret generic litellm-provider \
    --from-literal=api-key="$OPENAI_API_KEY"
  ```

  Without this secret, the lifecycle and DSH paths remain testable and LLM calls
  should return a useful provider-credential error.

Before the browser checks, verify that the rendered local umbrella is using
**nested** `magda.magda-core.agent-services`/LLM/Gateway/Ingress overrides,
that the internal auth plugin appears at `/auth/plugins`, and that no old
`deploy/helm/magda-core/agent-workspace-*-values.yaml` file is used. Re-run
both runc and gVisor qualification after this overlay migration; unchanged
manifests are not proof that the different parent chart receives the intended
values. The separate GKE reference
[`deploy/helm/agent-workspace-gke-magda-core.yml`](../../../deploy/helm/agent-workspace-gke-magda-core.yml)
continues to use the **direct magda-core** values shape and is not a
`local-deployment` overlay. Its security gates are below.

## Browser journey

1. Log in as an administrator and open **Settings -> Agent Workspace -> Open
   Workspace**.
2. Confirm the introduction states one workspace per user, user authority,
   suspend/resume behavior, temporary-file durability, and destructive
   reset/logout behavior.
3. Select **Start Agent Workspace**. Observe `ALLOCATING`, then
   `BOOTSTRAPPING`, then the embedded stock DSH UI (`READY`). Kubernetes names
   and addresses must not appear in the UI. The destructive replacement button
   must be labelled **Start New Workspace**.
4. Confirm the native DSH sidebar is visible and branded **Agent Workspace** and
   the same **M** mark appears beside the empty-chat **Agent Workspace** heading.
   New Session, the session history, Search, rename, and collapse/expand must
   work. Automation tasks, Plugins, Settings, Workspace View Options, Add
   Workspace, Delete workspace, and the redundant workspace chooser must be
   absent. Feedback, Permission, and Model composer commands,
   provider/model/plugin management, and persistent `danger-full-access` must
   remain unavailable.
5. Create Session A and complete a distinctive prompt. Create Session B and
   complete a different prompt. Switch between A and B and confirm both
   histories remain. Rename one Session, search for it using DSH's native
   Session terminology, and open the search result.
6. Confirm new sessions use `workspace-write`, sandbox mode `workspace-write`,
   and approval policy `ask`. Ask the agent to run `mgd auth status` and a
   representative read such as a dataset search. The call must go through the
   external Magda endpoint using the lifecycle-bound user API key.
7. Ask for a throwaway dataset mutation. The bundled `mgd` guidance must ask for
   explicit confirmation before executing it. Confirm, verify the result, then
   clean it up.
8. Send a tool-using prompt that produces a streamed model response. Confirm a
   reasoning model follows `/api/v0/llm/v1/responses` (Chat Completions remains
   available for compatible models), the DSH model catalog reports the Helm-set alias, `contextWindow`, and
   `maxTokens`, and no provider credential appears in the browser or Sandbox.
   Verify the default `reasoningEffort: medium` reaches both DSH and LiteLLM.
   Repeat with `reasoningEffort: ""` and verify neither configures a reasoning
   effort while the provider request still succeeds.

## On-demand Python dependency checks

Run this qualification in an actual claimed Agent Sandbox with the chart defaults
of 1 CPU, 1536 MiB memory and 1 GiB ephemeral storage. Confirm the rendered Pod
limits before testing. Record the runtime image ID and the output of
`python3 --version`, `python3 -m pip --version`, `uv --version`,
`env | grep -E '^(UV_|PIP_CACHE_DIR|MAGDA_PYTHON_|MAGDA_WORKSPACE_)'`,
`magda-workspace-resources`, `df -h / /data`, and
`du -sh "$MAGDA_PYTHON_VENV_ROOT" "$MAGDA_PYTHON_CACHE_ROOT" "$MAGDA_PYTHON_TMPDIR" 2>/dev/null`.
The summary must show configured and effective 1 CPU, configured 1536 MiB and
effective 1610612736-byte (1.50 GiB) memory, current cgroup memory use, and a
10 GiB requested PVC. On Minikube hostpath, confirm that a larger `/data` `df`
value is labelled node-backed observed capacity rather than the Workspace quota.
`pwd` must report `/data/workspace/agent-harness/default-workspace`; every
package path above must be a descendant of that DSH `workspace-write` boundary.
`uv cache dir` must report that working tree's `.cache/uv`; automatic Python
downloads must be `never`, and uv must resolve `/usr/bin/python3` rather than
creating a managed interpreter. The runtime environment must not globally set
`TMPDIR` or `XDG_CACHE_HOME`; inspect a uv build subprocess if necessary to
confirm its wrapper scopes both to the persistent package paths. A write probe to
sibling `/data/cache` or `/data/config` must remain denied.

Before changing the Workspace, use a real model turn in a fresh claim and ask:

> I'd like to train a random forest regression model in Python later today. Can
> you check whether this Workspace has what I need, and tell me what you'd do if
> something is missing? Don't change anything yet.

The agent must load the bundled Python guidance, use the configured/cgroup
resource sources rather than `nproc`, `os.cpu_count()`, `free` or
`/proc/meminfo`, and report **1 CPU**, **1.5 GiB memory** and the **10 GiB
requested PVC**. It must distinguish current memory use from available capacity,
include the Minikube hostpath caveat when `df` shows the node disk, keep proposed
scikit-learn/BLAS parallelism within one CPU, and make no installation before
approval.

1. Through a real model turn, request work that needs a package not already
   installed. The bundled `python-dependencies` guidance must first inspect
   imports and project requirements, name the proposed packages and versions,
   explain why they are needed and that they come from an external distribution
   source, and ask for explicit approval. Before approval, no install or sync may
   run. The explanation must not claim this behavioural consent rule is a
   technical enforcement boundary.
2. After approval, create the isolated environment and install this qualified,
   mutually compatible Python 3.11 set (or document and review any replacement
   set explicitly):

   ```sh
   ENV_DIR="${MAGDA_PYTHON_VENV_ROOT}/skops-smoke"
   uv venv --python /usr/bin/python3 "$ENV_DIR"
   uv pip install --python "$ENV_DIR/bin/python" \
     'numpy==1.26.4' 'scipy==1.11.4' \
     'scikit-learn==1.4.2' 'skops==0.10.0'
   uv pip freeze --python "$ENV_DIR/bin/python"
   ```

3. Save this script in the managed session working tree and run it with the
   environment's interpreter. It must fit a RandomForest, inspect and restrict the serialized
   file's untrusted type names before loading, load it, and reproduce the same
   predictions:

   ```python
   from pathlib import Path
   import numpy as np
   from sklearn.datasets import load_iris
   from sklearn.ensemble import RandomForestClassifier
   import skops.io as sio

   X, y = load_iris(return_X_y=True)
   model = RandomForestClassifier(n_estimators=40, random_state=7).fit(X, y)
   expected = model.predict(X[:12])
   artifact = Path("random-forest.skops")
   sio.dump(model, artifact)
   untrusted = sio.get_untrusted_types(file=artifact)
   allowed_prefixes = ("numpy.", "sklearn.")
   unexpected = [name for name in untrusted if not name.startswith(allowed_prefixes)]
   if unexpected:
       raise RuntimeError(f"unexpected serialized types: {unexpected}")
   loaded = sio.load(artifact, trusted=untrusted)
   np.testing.assert_array_equal(expected, loaded.predict(X[:12]))
   print({"untrusted_types": untrusted, "predictions": expected.tolist()})
   ```

4. During installation, sample `memory.current` and `memory.peak` from cgroup v2
   where available (otherwise use the cluster metrics source) and retain the peak.
   Compare `df`/`du` before and after for the root filesystem and `/data`, plus
   `/tmp` and `/home/agent/.cache`. The venv, uv cache and `$MAGDA_PYTHON_TMPDIR` writes must be
   on `/data`; no Python interpreter may appear in the uv cache, and the
   ephemeral-storage limit must not be approached unexpectedly. Record resolved
   package versions, elapsed time, peak memory, PVC growth, ephemeral growth and
   any OOM, quota, eviction or build failure.
5. Exercise the exceptional system-site path only after checking Debian's actual
   pandas version and the proposed package's requirements. With approval, this
   lightweight compatibility check may be used:

   ```sh
   ENV_DIR="${MAGDA_PYTHON_VENV_ROOT}/system-pandas-smoke"
   uv venv --python /usr/bin/python3 --system-site-packages "$ENV_DIR"
   uv pip install --python "$ENV_DIR/bin/python" 'tabulate==0.9.0'
   "$ENV_DIR/bin/python" - <<'PY'
   import pandas, tabulate
   print({"pandas": pandas.__version__, "tabulate": tabulate.__version__})
   PY
   ```

   If resolution or imports reveal incompatibility, report it and remove the
   environment; do not force the install or modify system Python. Isolated venvs
   remain the documented default.

6. Create a marker inside each venv, suspend/resume the Workspace, then delete its
   Sandbox Pod. The same environment interpreter, imports, model artifact and
   markers must survive on the same PVC. Finally reset or terminate the Workspace
   and confirm the old PVC and environments are deleted. A new claim must request
   10 GiB; upgrading the chart must not be reported as resizing an existing PVC.
7. Run `uv cache prune`, remove only the named smoke environments after approval,
   and re-check usage. Confirm errors and actual versions are reported truthfully
   and that no `sudo`, runtime `apt-get`, global pip, `--system`,
   `--break-system-packages`, privilege escalation or Python download was used.

## Office document checks

Use a **fresh** claimed Workspace (Start New Workspace → Permanently Reset, or a
new user) with no published, synchronized or project skills and no manual
package installation. Use the known-content fixtures in
[`magda-agent-runtime/office-fixtures/`](../../../magda-agent-runtime/office-fixtures/)
(facts defined in `generate_fixtures.py`, asserted in the image by
`test_office_skills.py`). Rename copies before upload, for example
`coastal-report.docx`, `field-briefing.pptx` and `programme-budget.xlsx`, so
that answers cannot come from file names. Inspect each turn with
`magda-session-history events --session <id> --turn <n>` in the claimed Pod,
and watch `/sys/fs/cgroup/memory.peak` and `memory.events`.

1. **Reading.** In a new session attach the three files and ask, without
   mentioning skills or tools:

    > I've attached three files. Please answer from their actual contents and say
    > where in each file you found each answer. (1) Report: what peak salinity was
    > recorded, at which station and on what date? Who leads North Reef, and what
    > are the replicate A and B values? What does the footnote say? (2) Deck: what
    > is the Pilbara budget, what do the speaker notes remind the committee about,
    > and is there any hidden slide? (3) Spreadsheet: what is the total cost on the
    > Summary sheet (give both the formula and its value), and what is the Q3
    > amount on the Detail sheet?

    Expected: 35.2 PSU at BW-7 on 14 March 2026; Dr Amara Okafor; replicates
    7.81 / 7.79 from the nested table; footnote "Calibrated against the CSIRO
    reference probe in February 2026."; Pilbara AUD 1,250,000 (slide 3); notes
    "budget approval is due 30 June" (slide 2); hidden slide 5 "Contingency";
    `Summary!B6 =SUM(B3:B5)` = 785000.5 and `Detail!C4` 235500.15 as cached
    values. History shows `skill` calls for `office-docx`, `office-pptx` and
    `office-xlsx`, a `load_workspace_dependencies` call, and Bash using
    `/usr/local/lib/magda-agent/primary-runtime/dependencies/python/bin/python3`
    on the `$DSH_HOME/attachments/v1/files/…` paths, with no approval prompt or
    package installation.
2. **Generation, rendering and delivery.** Ask for a two-slide deck from the
   workbook with a column chart of the Summary items and the total in a
   caption, and to check how the slides look. Expected: python-pptx generation,
   `check_office.py`, a kit `render` using the skill's absolute `node`/`cli`
   paths, and `present` of the final `.pptx` as a deliverable. With the current
   text-only model entry, `read_image` refuses the previews and the agent says
   visual inspection was unavailable.
3. **Recalculation.** Attach `uncalculated.xlsx` (renamed) and ask what `A3`
   shows. Expected: the agent reports there is no cached result, runs the kit's
   `recalculate` into a new file, and answers 6 (`=A1*A2`).
4. **Unsupported inputs.** Attach `legacy.doc`, `encrypted.xlsx`,
   `truncated.docx` and `misnamed-spreadsheet.docx` (renamed). Expected: no
   invented contents for the first three, advice to re-export, and the misnamed
   file identified as an XLSX workbook by content.
5. **Reserved names.** `mgd agent-skill validate` on a draft named `office-docx`
   is rejected as reserved for a runtime-bundled Agent Skill.

**Observed (2026-11-13, Minikube runc, arm64, demo LLM route):** steps 1–5
passed (1–4 in a fresh Workspace), with answers and tool paths as expected and no
approvals. In step 2 the kit reported `missingFonts` `Arial` and `Aptos`, which
it substituted; the rendered slide was correct on manual inspection. The
cgroup memory peak across the four turns was 1.41 GiB of 1.5 GiB (including
page cache), with no OOM kill. **Not yet tested:** amd64 images and emulated
cross-architecture builds, gVisor, files saved by Microsoft Office itself,
CJK text, image-capable models, and other models.

## Lifecycle and security checks

Run each check while watching the Settings page and Kubernetes resources:

- Record the claim, PVC, and managed-key IDs, create both Sessions, then refresh
  the browser. Confirm both histories remain available and no resource ID changes.
  From the Sandbox, confirm DSH state is under `/data/agent-home` and its default
  working tree is `/data/workspace/agent-harness/default-workspace`. A fresh PVC
  must not contain the former `dsh-home` or `deepseek-harness` paths.
- Delete the DSH Pod. Confirm DSH restarts against the same PVC, the browser
  reconnects, and both Sessions remain available.
- Patch the bound Sandbox to `spec.operatingMode: Suspended`, confirm the UI
  offers Resume, resume it, and verify both Sessions and shared files remain on
  the same PVC.
- Create another Session and confirm it does not rotate the managed API key or
  create another SandboxClaim/PVC.
- Navigate among Sessions, refresh, and collapse/expand the sidebar; all managed
  hidden controls must remain absent. Verify normal desktop and narrow browser
  widths without iframe overflow or clipping.
- Set the selected warm pool to one replica before starting a second test user.
  Confirm claim adoption uses `claim.status.sandbox.name` and the pool creates a
  fresh replacement.
- Reset the workspace. Confirm all previous DSH Sessions and files plus the old
  claim, Sandbox, Pod, Service, PVC and reserved managed API key are deleted; a
  fresh generation/key/PVC is created. Repeat with Terminate and confirm the
  workspace reaches `ABSENT` without replacement.
- Leave a DSH WebSocket open without user input for more than the configured idle
  interval. Confirm protocol ping/pong and an idle Remote stream do not renew
  activity and the workspace suspends. Keep the Settings page open: within one
  status-poll interval it must remove the stale runtime iframe and show **Resume
  Agent Workspace**, rather than allowing a prompt to fail with HTTP 409.
- Run a foreground Agent turn across the configured idle-suspension threshold.
  Confirm `api-session/status` keeps the workspace `READY` until the turn settles,
  then confirm its idle clock resumes.
- Send real mutating runtime interactions across an accelerated lifecycle window.
  Confirm each renews the persisted claim deadline and managed API-key expiry,
  allowing continued activity beyond the original eight-hour deadline.
- Inject one transient Kubernetes patch failure and one Authorization API key
  extension failure. Confirm the next interaction retries, an older/concurrent
  request cannot shorten the newer deadline, and a partial claim-first update is
  repaired without shortening either value.
- Inject an Authorization API key-revocation failure during both Terminate and
  Reset. Confirm the claim remains `DELETING` with key identity intact; restore
  the dependency and confirm reconciliation completes key, claim, and PVC
  cleanup. Terminate must finish `ABSENT`; Reset must preserve its intent and
  provision one fresh replacement workspace. Overlap two reconciliation passes
  and confirm only one replacement is created; issue Terminate during recovery
  and confirm the replacement is cancelled and the final state is `ABSENT`.
  Fail the Reset-intent annotation patch and confirm Terminate is rejected rather
  than acknowledged; after a successful retry and Manager restart, confirm no
  replacement is provisioned.
- Delay a successful `session/list` response until after closing the last DSH
  WebSocket. Also let an older running response arrive while a newer request is
  pending, then complete the newer request with an empty response; repeat with
  the older response arriving after the newer success and after
  disconnect/reconnect. Confirm none of the stale responses renews activity or
  prevents idle suspension. Fail a newer request after the older valid response
  is buffered and confirm that baseline is then accepted. While one valid socket survives, add and remove a second socket and
  confirm its churn does not discard the valid baseline.
- Restart Agent Manager after that partial update. Confirm reconciliation uses the
  persisted activity timestamp to repair key expiry. Resume a suspended workspace
  and verify the deadline renews.
- Advance inactivity beyond the accelerated hard-delete interval. Confirm the
  claim, Sandbox, Pod, Service, PVC, and managed API key are removed.
- Open a DSH WebSocket and log out. Confirm the socket closes promptly and all
  workspace resources and the managed API key are deleted before logout
  completes.
- Run the [Workspace access checks](#workspace-access-checks).
- In a disposable cluster without KAS, attempt an enabled Helm install and confirm
  the pre-install hook fails with the missing KAS v1beta1 API message before
  normal Agent resources are installed.
- Render/install two releases with a shared explicit Sandbox namespace. Confirm
  installation labels, claim names, selectors, warm pools, Sandbox
  ServiceAccounts, RBAC, and managed API-key names differ. Confirm each
  SandboxTemplate explicitly references its own no-RBAC/no-IAM ServiceAccount and
  that one Manager cannot list or delete the other's claims.
- For an upgrade fixture from the old split charts, reset all legacy workspaces
  before upgrade and verify the legacy unscoped claims, user PVCs, and
  `magda-agent-workspace` keys are gone. Confirm the merged chart does not adopt
  an intentionally retained unscoped test claim.
- Inspect Agent Manager RBAC: it must include `pods/exec` but not `pods/log`.
- Inspect DSH requests at the Sandbox boundary: `X-Magda-Session`, browser
  cookies, `Authorization`, proxy authorization, and Magda API-key headers must
  be absent; `Host` must be the configured external authority.
- Confirm the launch-token file is on the memory `emptyDir`, mode 0600, is read
  with `pods/exec`, and neither token nor DSH cookie reaches browser responses or
  Pod logs.

Repeat the core browser, `mgd`, LLM streaming, refresh and reset journey with
each runtime. Through the `local-deployment` umbrella the key is nested under
`magda.magda-core`:

1. `magda.magda-core.agent-services.warmPool.type=runc` (the profile default);
   and
2. `--set magda.magda-core.agent-services.warmPool.type=gvisor` with the
   Minikube gVisor RuntimeClass installed.

Switching runtime replaces the SandboxTemplate and warm pool: terminate or
reset existing workspaces first.

Each render must contain exactly one SandboxTemplate and one matching
SandboxWarmPool. Kata is covered by the offline Helm render matrix; run the full
journey on a Kata-capable cluster when qualifying that production runtime.

## Gateway CSP and ingress WebSocket regression checks

In the **rendered local umbrella** (not only source templates), check that
Gateway's `helmetPerPath` allows
`script-src 'self' 'unsafe-inline' 'unsafe-eval'` only for the DSH
`/api/v0/agent/runtime` mount. Exercise the actual response headers for a
DSH resource, an ordinary Magda page and a sibling-prefix/near-match route;
only DSH may inherit the relaxed policy (#3846). Verify that the Ingress
annotations `nginx.ingress.kubernetes.io/proxy-read-timeout` and
`nginx.ingress.kubernetes.io/proxy-send-timeout` render as 3600 seconds
with Workspace enabled, remain absent without Workspace unless explicitly
configured, and honor deliberate overrides (#3847).

The render-level and Gateway request-level checks are automated:

```sh
bash deploy/helm/magda-core/tests/agent-services-render.sh
bash deploy/helm/magda-core/tests/agent-workspace-profiles.sh
(cd magda-gateway && yarn test)   # agentWorkspaceCsp.spec.ts; needs PostgreSQL
```

On the deployed umbrella, compare the live `Content-Security-Policy` of
`/api/v0/agent/runtime/` with an ordinary page and a near-match such as
`/api/v0/agent/runtime-evil/`. Confirm the controller's effective
configuration for the Magda host contains `proxy_read_timeout 3600s` and
`proxy_send_timeout 3600s`.

On a real local ingress path, keep a DSH WSS connection
(`/api/v0/agent/runtime/api/remote.mux`) open beyond the old default
timeout, deliberately close/restart the Gateway or Manager, and verify
browser reconnect rather than a permanently hung socket. DSH sends a
protocol ping about every two seconds, so an open DSH socket is never idle at
the TCP level; the effective nginx configuration is the evidence for the
timeout annotations themselves.
Controller config reloads may terminate WebSockets; document and test this
behaviour without confusing it with idle Workspace deletion. These
tests **do not** replace GKE provider NetworkPolicy or IAM qualification.

## Workspace access checks

`agentWorkspace/access` (#3858) is the only Workspace permission. Use a
non-admin user `U` and an administrator `A`, each with an API key (gateway
headers `X-Magda-API-Key-Id`/`X-Magda-API-Key`). Lifecycle endpoints are
`GET/POST/DELETE /api/v0/agent/session` and `POST /api/v0/agent/session/{resume,reset}`;
the runtime proxy is `/api/v0/agent/runtime/`; the model route is
`/api/v0/llm/v1/models`.

1. **Anonymous:** every lifecycle route, a runtime GET and a runtime WebSocket
   upgrade (`Connection: Upgrade`, `Upgrade: websocket`) return 401.
2. **Unassigned `U`:** `whoami` has no `agentWorkspace/access`; Settings hides
   **Agent Workspace**; the direct route redirects with a permission error; all
   lifecycle routes, runtime HTTP, the WebSocket upgrade and the LLM route
   return 403; no SandboxClaim is created for `U`.
3. **Grant:** assign **Agent Workspace Users** to `U`. Settings shows the item;
   `U` can start, use (DSH HTTP and WebSocket, model turns), reset and delete
   their own Workspace. The claim carries `U`'s user-hash label.
4. **Cross-user:** while `A` has a READY Workspace, `U` adds `?userId=<A>`, a
   body `{"userId":"<A>"}`, `X-Magda-User-Id: <A>` or `A`'s Sandbox name to
   lifecycle and runtime requests. Every request acts only on `U`'s claim, and
   `A`'s claim annotations and Sandbox are unchanged.
5. **Forged identity:** a JWT signed with another secret, or an
   `X-Magda-Session` copied from another environment, returns 401.
6. **Administrator:** `A` keeps access to their own Workspace without any
   explicit grant (policy administrator override).
7. **Revocation:** with `U`'s DSH WebSocket open, remove the role. The next
   runtime/lifecycle/LLM request returns 403, and the open WebSocket closes
   within `RUNTIME_AUTH_RECHECK_SECONDS` (default 60); the Manager logs
   `agent-websocket-access-revoked`. Use a real WebSocket client (browser or
   Node's `WebSocket`): DSH closes a raw upgraded socket that never sends
   WebSocket frames after a few seconds, which hides the revocation result.
8. **Skill permissions are independent:** a user with only typed skill read
   permissions can call `/api/v0/agent/skills` but receives 403 from the
   Workspace routes.

## Agent Skill synchronization checks

Publish one system skill and one current-user skill, then:

- **Fresh Workspace:** start a Workspace with no existing claim. Agent Manager
  logs a single `mgd agent-skill sync --force --json --workspace-status` exec;
  the claim reaches READY independently and its `agent.magda.io/skill-sync-*`
  annotations record `success` with two installs. In the Sandbox, both
  `/data/agent-home/skills/<name>/` entries are real directories containing
  `.magda-skill-install.json`, and `$XDG_DATA_HOME/mgd/agent-skills/` (on
  `/data`) holds only `sources/<key>/` (no installation index or journal).
- **Existing Workspace:** edit the user skill's `SKILL.md`, restart Agent
  Manager (or reset the claim's sync status to `notAttempted`). The recovery
  sync is non-forced: status becomes `partial`, the edit survives, READY and the
  DSH iframe stay available.
- **Manual Sandbox CLI:** delete a skill directory and corrupt the other's
  marker, then run `mgd agent-skill sync --json`: the deleted skill is
  reinstalled and the marker repaired without `--force`. With an edited copy,
  ordinary sync reports `LOCAL_MODIFICATION` with the exact path while other
  clean skills still update; `mgd agent-skill sync --force --json` resets it.
- **Required download failure:** make one current publication undownloadable
  (e.g. stop the Storage API) and rerun the Manager sync or a manual
  `mgd agent-skill sync --force`: the result is `failed`, every installed
  skill (including unpublished edits) is unchanged, and READY/DSH stay
  available. Neither manual run
  changes the claim's Manager-owned sync annotations.
- **No Python:** run `mgd agent-skill sync --json` with `PATH` containing only
  `node` and `mgd`; it succeeds.
- **Outage:** with the API unreachable, both forms report `failed` and the
  installed tree is byte-for-byte unchanged.
- **DSH discovery:** instantiate the pinned
  `@deepseek-ai/dsh-skill-filesystem` provider in the Sandbox and list skills;
  exactly the synchronized names (plus image-bundled ones) appear, with no entry
  for the marker or `.magda-skill-staging/`.
- **Status isolation:** a local-computer `mgd agent-skill sync` against the
  same user never changes any claim annotation.

## Workflow capture checks

These checks drive real model turns through the DSH UI. Model wording varies
between runs, so judge behaviour (what the agent does and claims) rather than
exact text. Record the session ID, and the publication ID where there is one.

- **Bundled discovery:** in a fresh Workspace with no published skills (or with
  Registry or Storage API scaled to 0), `ls -l /usr/local/lib/magda-agent/skills`
  shows a root-owned, read-only `capture-workflow/SKILL.md`. The pinned
  filesystem provider lists `capture-workflow` with source `bundled`, next to
  `magda-mgd` (`user-agents`) and any synchronized skills (`user-dsh`). Typing
  `/capture-workflow` in the composer offers it, and the model's skill catalog
  lists it.
- **Prompt integrity:** decode the session's first `system/message` event (for
  example by running the image's `magda-session-history` decoder logic in a
  one-off `node` script as the test operator). It still starts with DSH's
  identity and `You are a coding agent powered by the magda-agent-default model.`,
  still ends with `Your working directory is <cwd>.`, and contains
  `# Reusable workflows in MAGDA Agent Workspace` exactly once. The model
  catalog, provider, reasoning effort, permission preset and approval policy are
  unchanged.
- **Successful capture:** complete a realistic task: find a dataset with
  `mgd`, inspect its distributions and CSV schema, compute an aggregate with
  pandas, and validate it against an independent check. Then ask the agent to
  save the workflow as a skill. Expect `skill-drafts/<name>/SKILL.md` under the
  session directory, generalised inputs (no dataset ID, `magda://` URL,
  `/data/...` path or user ID), a passing `mgd agent-skill validate`, and an
  explanation that the draft is local, unpublished, lost on reset or logout, and
  needs approval. `mgd agent-skill list --type user` must not show it yet.
- **Approval in chat (one approval):** reply "Publish it." The agent calls
  `magda_agent_skill_publish` with `path: "skill-drafts/<name>"`, `type: "user"`,
  `userApproved: true`. No question card, DSH approval prompt or Bash call
  appears. The session log has no `approval/asked` event for that turn, and
  the tool result is `{"outcome":"published", "publication":{type,id,name,checksum,…}, "localCache":"updated"}`
  with no credential or raw `mgd` output. Asking it to synchronise calls
  `magda_agent_skill_sync`, again without prompts, and DSH lists the skill.
- **Question card path:** with a reviewed draft but no chat approval (for
  example "use the publish confirmation so I can decide"), the same tool call
  shows DSH's question card **Publish skill** with **Publish / Cancel**. Cancel →
  `outcome: cancelled`, nothing published; Publish → `outcome: published`
  within the same call (one tool call per turn, no further model step).
- **System skill:** as an authorized admin, ask for a `system-…` skill. The same
  tool and card appear, and the text says it can become available to other
  authorised MAGDA users and their Workspaces, subject to system-skill
  visibility, and never to anonymous users. Publish succeeds. As a user without
  system create permission, the same call returns
  `outcome: rejected`, `status: 403` (`AGENT_SKILL_FORBIDDEN`). A chat-approved
  `magda_agent_skill_delete` of the system skill runs without a card.
- **Overwrite wording:** `overwriteRemoteChanges: true` without chat approval
  shows the same single card, saying the newer version stored in MAGDA will be
  overwritten (or deleted with its newer changes).
- **Ordinary Bash stays sandboxed:** `touch /data/config/x` from Bash fails with
  `Read-only file system … workspace-write`; the overlay contains no
  `danger-full-access`.
- **Uncertain outcome:** with a write interrupted after sending (deterministically,
  a mock that drops the connection after the POST), the tool returns
  `outcome: uncertain` with `target {type, id, name, checksum}`, `mgd` sends the
  write once, and no `show`/`list` follows automatically. A 409/403 returns
  `rejected`, an unreachable service `failed`.
- **Fresh Workspace:** select **Start New Workspace**. The new claim's forced
  sync reports success, and `/data/agent-home/skills/<name>` exists with
  identical content while `skill-drafts/` does not. A new session can load the
  published skill.
- **No approval / decline:** ask for a draft only ("draft it, don't publish"),
  or decline when asked. Nothing appears in `mgd agent-skill list`. A later,
  unrelated "thanks" must not be treated as approval.
- **Secrets and identifiers:** run a task whose tool output contains a
  synthetic token (for example a fake `X-Magda-API-Key` header in a local file)
  and a specific dataset ID, then capture it. The draft must contain neither.
  `magda-session-history events --grep X-Magda` shows `[REDACTED]`.
- **Failed or unfinished task:** ask to capture a task whose validation failed.
  The agent must say so and offer to finish it, or mark the steps as
  unverified. It must not describe them as verified.
- **Name collision:** ask for a new draft with the name of an existing
  publication. Either the pre-check catches it, or publish fails with 409; in
  both cases the agent asks for another name and never replaces the existing
  publication.
- **Local edit versus publication:** edit an installed or published copy
  without approving publication. The agent must call it a local change.
- **Suggestions:** after a substantial, successful multi-step workflow, an
  optional one-sentence offer to save it is acceptable (it is not required on
  every run). After simple questions, single commands, failed tasks, a declined
  offer, or a workflow that was just published, no offer is made.
- **Credentials:** as the test operator, compare the profile's API key, key ID
  and the LLM key with every decoded session row: no row, including tool results
  and history output, contains them.
- **Compaction or missing context:** run `/compact` after a workflow (or start
  capture in a new turn after compaction), then ask to capture it. The agent
  uses the summary and, only when a detail is missing, narrow
  `magda-session-history outline` or `events` queries. The helper returns only
  this Workspace's sessions, refuses symlinks, caps output, never prints system
  prompts or reasoning, and leaves `/data/agent-home/sessions` byte-for-byte
  unchanged. A late `events --from-seq` query reports only a few
  `stats.framesDecoded`. Run `node magda-agent-runtime/bench-session-history.mjs`
  in the Sandbox to compare time and peak RSS against the previous helper; a
  budget-limited query starts with `# INCOMPLETE RESULT` and exits 3. Request
  100 events at `--max-chars 8000` from a long session: both text and `--json`
  output stay within 64 KiB, the JSON parses, and the result is
  `complete: false` with a `--from-seq` cursor that pages on without gaps.
- **Regression:** DSH launches, the managed UI is unchanged, the model and
  provider configuration is unchanged, READY is independent of skill sync, and
  Stage 2 manual and forced `mgd agent-skill sync` still pass.

## Agent Skills catalogue checks (#3857)

1. **Navigation:** with `agentWorkspace/access` only, the **Agent Workspace**
   group shows **Open Workspace** only. With only a typed skill read permission
   (`object/agentSkill/system/read` or `.../user/read`), it shows **Agent
   Skills** only, and `/settings/agent-workspace` redirects with a permission
   error. With both, or as an administrator, both appear. Without either the
   group is hidden. **Shared Skills** appears with `object/agentSkill/user/read`
   or `object/agentSkill/install/read`, independently of Workspace access (see
   [sharing checks](#agent-skill-sharing-and-installation-checks-3861)).
2. **Introduction:** the guide ("What are Agent Skills? How do I create one?")
   explains skills and shows the CSV example. It is open when you have no
   skills and collapsed otherwise. **Open Workspace** is in the header only with
   Workspace access.
3. **Listing:** publish more than one page of user skills (page size 10) and at
   least one system skill. **All** shows READY system + own user skills;
   **My Skills** only own user skills; **System Skills** only system skills.
   **Next**/**Previous** walk the keyset pages without duplicates or gaps;
   changing filter or search returns to page 1. PENDING or DELETING records
   never appear. Another user's user skill never appears.
4. **Search:** a keyword from one skill's description finds it on page 1; an
   unmatched keyword shows the empty state.
5. **Metadata:** each compact card shows the name, type, description and
   last-updated date; **Details** reveals the publication ID, intended user
   (user skills), owner, and created/updated time and user from the Registry
   record. Cards use two columns on wide screens.
6. **System entries** have no Download, Replace, Delete or edit control, even
   for an administrator.
7. **Download ZIP** of an own user skill matches `mgd agent-skill pull`.
8. **Replace ZIP:** a valid archive with the same `SKILL.md` name succeeds and
   updates description/`updatedAt`/`updatedBy` while ID, name, type, intended
   user, owner and creator stay unchanged. The success text gives the
   resynchronise guidance. Check the errors: a non-ZIP or invalid archive, a
   changed `name`, a user without `object/agentSkill/user/update` (no Replace
   button; a direct `PUT` returns 403), a stale `If-Match` after another
   replacement from `mgd` (conflict message), and an offline network.
9. **Responsive/accessibility:** at phone width the list has no horizontal
   scroll; filters expose `aria-pressed`; the page is usable by keyboard;
   loading, empty and error states are announced.

## Agent Skill sharing and installation checks (#3861)

Detailed source/recipient permission, alias, revocation, sync and fork assertions are in [Agent Skill sharing E2E](./agent-skills-sharing.md). This page retains the integrated test's other contracts.


## Retry / Re-check skill sync checks (#3857)

Read the claim's `agent.magda.io/skill-sync-*` annotations and poll
`ps -eo args` in the Sandbox to see the Manager's exec.

1. **Partial:** edit an installed published skill in the Workspace, then make
   the Manager record `partial` (for example, replace that skill's ZIP and
   restart the Manager for a non-forced recovery). The banner shows counts and
   the skill with "edited in this Workspace" and offers **Retry / Re-check
   skill sync**.
2. **Cancel** closes the dialog with no request (Manager log and Sandbox
   `ps` show no sync).
3. **Confirm** runs exactly one `mgd agent-skill sync --force --json --workspace-status`. The edited copy is replaced, the status becomes
   `success`, and DSH stays loaded and usable throughout.
4. **Duplicates:** two quick Retry calls produce one exec; the second response
   has `deduplicated: true`.
5. **Outage:** scale Registry or Storage API to 0 and Retry. The result is
   `failed` with "No installed skills were changed", local files are unchanged,
   and the Workspace stays READY. Restore and Retry again for `success`.
6. **Reset during Retry:** start a Retry, then **Start New Workspace**. The old
   attempt never writes the new claim's status; the request returns `409`.
7. **Display:** reopening a Workspace whose last sync succeeded shows only the
   toolbar status. A sync completing while the page is open shows the success
   banner for 15 seconds, and later polls don't bring it back. Partial and
   failed results stay visible.
8. **Status ownership:** a manual `mgd agent-skill sync` or the
   `magda_agent_skill_sync` tool does not change the annotations; a status GET
   alone never starts an exec.
9. **Authorization:** Retry needs `agentWorkspace/access` and targets only the
   caller's claim, whatever body, query or headers are sent.

## Minikube gVisor troubleshooting

If the Settings page remains at **Allocating your Agent Workspace**, inspect the
Sandbox Pod before resetting the claim or PVC:

```sh
kubectl -n magda-agent get sandboxclaims,sandboxes,pods,pvc
kubectl -n magda-agent describe pod <sandbox-pod>
```

On ARM64 Minikube, some gVisor addon versions still download the legacy
standalone `runsc` and `containerd-shim-runsc-v1` release files. gVisor now
publishes a release archive containing those binaries and their required
`gvisor-bin` sidecars. A failed legacy download can leave a small XML
`NoSuchKey` response installed as each executable. Sandbox events then repeat
`fork/exec ... containerd-shim-runsc-v1: exec format error` and the UI remains
in `ALLOCATING`.

Confirm the node architecture and installed runtime before changing workspace
resources:

```sh
PROFILE=<minikube-profile>
minikube ssh -p "$PROFILE" -- uname -m
minikube ssh -p "$PROFILE" -- 'sudo /usr/bin/runsc --version'
minikube ssh -p "$PROFILE" -- \
  "sudo grep -c 'containerd.runtimes.runsc' /etc/containerd/config.toml"
```

Recover a disposable local cluster as follows:

1. Disable the broken Minikube gVisor installer so a restart cannot overwrite
   the repair. This removes its managed `RuntimeClass`, so recreate that object
   after installing the runtime.
2. Follow the current [gVisor installation guide](https://gvisor.dev/docs/user_guide/install/)
   to download the checksum-verified release archive for the exact architecture.
   Install `runsc`, `containerd-shim-runsc-v1`, and the complete sibling
   `gvisor-bin` directory together on the Minikube node.
3. Keep exactly one `runsc` containerd runtime stanza, restart containerd and
   kubelet, then recreate `RuntimeClass/gvisor` with handler `runsc`. Repeated
   addon runs can append a duplicate TOML table and prevent containerd from
   starting.
4. Confirm the live `SandboxTemplate` uses the intended locally loaded runtime
   image and pull policy. A stale template that points at an unavailable
   registry tag produces `ImagePullBackOff` after the runtime itself is fixed:

   ```sh
   kubectl -n magda-agent get sandboxtemplate -o jsonpath=\
   '{range .items[*]}{.metadata.name}{"\t"}{.spec.podTemplate.spec.containers[0].image}{"\t"}{.spec.podTemplate.spec.containers[0].imagePullPolicy}{"\n"}{end}'
   ```

5. Recycle only unclaimed warm-pool Sandboxes so the controller copies the
   repaired template. Do not delete a bound user claim or PVC unless the test
   explicitly calls for a destructive workspace reset. Refresh the Settings
   page if an earlier allocation already timed out, then start the workspace
   again and require the claim, Sandbox, Pod, runtime proxy, and embedded DSH UI
   all to become ready.

For local lifecycle testing where gVisor itself is not under qualification, use
`runc` (`magda.magda-core.agent-services.warmPool.type=runc` through the
umbrella) instead of weakening the Sandbox security
context or bypassing readiness checks.

### Model turns fail with `Connection error`

If DSH loads but every prompt retries five times and ends with **This turn
failed — Connection error**, test the model path from the bound Sandbox. The
browser and runtime proxy can be healthy while the Sandbox cannot reach or
trust the LLM gateway.

```sh
POD=$(kubectl -n magda-agent get pod \
  -l agents.x-k8s.io/claim-uid -o jsonpath='{.items[0].metadata.name}')
kubectl -n magda-agent exec "$POD" -- getent hosts magda.test
kubectl -n magda-agent exec "$POD" -- node -e \
  'fetch(process.env.MAGDA_LLM_BASE_URL + "/models").then(async r => console.log(r.status, await r.text())).catch(e => { console.error(e); process.exit(1) })'
```

Expected local results are the ingress Service IP for `magda.test` and HTTP
`401 Magda authentication required`; that response proves DNS routing and TLS
trust work before DSH adds its lifecycle-bound credential. Interpret failures as
follows:

- `127.0.0.1` or connection refused: the live Sandbox lacks the cluster-specific
  `runtime.hostAliases`, or `MAGDA_LLM_BASE_URL` incorrectly contains the
  host-only Minikube port such as `:18443`. Keep `DSH_PUBLIC_URL` browser-facing,
  but set `agent-services.llmApiUrl` to the in-cluster ingress URL on port 443.
- `self-signed certificate`: `runtime.trustedCaSecret` is absent/stale, or
  ingress-nginx is serving its generated fake certificate instead of the
  certificate copied into that Secret. Compare SHA-256 fingerprints and configure
  the controller default certificate or an Ingress `tls.secretName`.
- HTTP 401: transport is repaired. A subsequent DSH turn should authenticate;
  inspect LLM Services and LiteLLM only if it still fails.

`SandboxTemplate` changes affect newly created Sandboxes, not a running Pod.
Recycle only an unclaimed warm-pool Sandbox. For a bound local test workspace,
copy the repaired template's `spec.podTemplate` to its Sandbox and suspend/resume
that Sandbox so Kubernetes recreates the Pod while retaining the claim and PVC.
Do not delete the claim or PVC merely to apply network/TLS configuration. A
Sandbox restart also invalidates the Agent Manager's cached DSH cookie, so reload
the page; if WebSocket reconnects return HTTP 409, restart Agent Manager and
reload once more.

## GKE provider security qualification

See [Agent Workspace GKE security qualification](./agent-workspace-gke-security.md) for positive/negative CNI, metadata/IAM, ingress and CSI checks. The transport PoC did **not** demonstrate production security readiness.


## Expected result

All transitions are visible and recoverable, the same-origin DSH iframe and
`/api/remote.mux` WebSocket work through the gateway, persisted state survives
restart/suspend, destructive transitions remove credentials and storage, and
both backend services independently reject users without
`agentWorkspace/access`.
