# End-to-End Full Cluster Deployment Test

CI runs `helm template`/`helm lint` and unit/integration tests against individual services, but it never actually installs the Helm chart into a real Kubernetes cluster and exercises it at runtime. Some classes of bug only show up there:

- A Pod that `CrashLoopBackOff`s because of a bad default config value (e.g. a value that's valid for an old version of a dependency but throws on the version actually shipped).
- A `CronJob` that fails silently or crash-loops because something it depends on at runtime (an NPM package, a service endpoint) isn't actually available yet, even though the chart deployed "successfully".
- Migration / first-boot / auto-provisioning bugs that only manifest on a genuinely clean install, not a cluster that's been upgraded in place many times.

Run this test before merging any PR whose CI test plan can't otherwise prove it (chart/template changes, CronJob changes, anything touching startup/middleware), and as part of validating a [PR preview release](./pr-preview-release-testing.md) before merging.

## Prerequisites

- A local `minikube` cluster (docker driver recommended; 8+ CPU / 16GB+ RAM for the full default stack, which includes OpenSearch and the semantic search components).
- Helm v3 (`helm version`) and `kubectl` configured against the `minikube` context.
- A published build to test — either a real release/alpha tag, or a [PR preview release](./pr-preview-release-testing.md) (e.g. `v6.0.0-pr.3665.5`).

## Step 1: Fully Purge Any Existing Deployment

Don't reuse an existing deployment. An in-place upgrade can mask first-boot bugs (migrations that already ran, admin users that already exist, PVCs that already have data). Delete everything and start clean:

```bash
helm uninstall magda -n magda
kubectl delete namespace magda --wait=true --timeout=180s
```

`helm uninstall` will report a few Secrets "kept due to the resource policy" (`db-main-account-secret`, `combined-db-password`, `storage-secrets`, `auth-secrets`) — deleting the namespace removes those too, along with the PostgreSQL/MinIO/OpenSearch PVCs.

```bash
kubectl get ns magda        # should return NotFound
kubectl get pv | grep magda # should return nothing
```

## Step 2: Fresh Install

```bash
kubectl create namespace magda
helm install magda oci://ghcr.io/magda-io/charts/magda --version <VERSION> -n magda
```

Installing with no `-f values.yaml` (default values) deploys the **full stack**, including OpenSearch, `semantic-search-api`, `magda-embedding-api`, and the PDF/CSV semantic indexers. This is the most thorough scenario and the one that matches what a new default user actually gets — see the chart's `README.md`/`values.yaml` if you specifically need a minimal deploy (e.g. `tags.all=false` plus per-component tags, and `global.searchEngine.hybridSearch.enabled=false`; disabling the semantic-search stack requires setting several tags simultaneously since a subchart activates if _any_ of its tags is true).

## Step 3: Wait for Pods to Stabilise

```bash
kubectl get pods -n magda -w
```

A full default install brings up ~24 Pods. Expect this to take several minutes (image pulls, DB migrations, OpenSearch cluster formation). It's normal to see a handful of early restarts on `indexer`, `magda-pdf-semantic-indexer`, and `magda-csv-semantic-indexer` — they can start before OpenSearch is accepting connections yet and get killed with `Connection refused`, then come back up cleanly once OpenSearch is ready. Check `kubectl describe pod` / `kubectl logs --previous` if a restart doesn't self-resolve within a few minutes; that's the difference between "normal startup race" and "actual regression".

Confirm nothing is stuck once things settle:

```bash
kubectl get pods -n magda --no-headers | grep -vE "Running|Completed"
# should print nothing
```

## Step 4: Core Checks

### Pod health sweep

No Pod should be in `CrashLoopBackOff` or `Error`. Check restart counts didn't keep climbing after the initial settle:

```bash
kubectl get pods -n magda -o json | python3 -c "
import json,sys
d = json.load(sys.stdin)
for p in d['items']:
    r = sum(c.get('restartCount', 0) for c in p['status'].get('containerStatuses', []))
    print(f\"{r:3d}  {p['metadata']['name']}\")
"
```

### Gateway CSP header

If the change under test touches `magda-gateway`'s CSP/helmet config, confirm the Gateway Pod is `Running` with `0` restarts (a bad CSP directive throws a hard error at startup under helmet v8 — see [#3660](https://github.com/magda-io/magda/issues/3660)), then check the actual header:

```bash
kubectl port-forward -n magda svc/gateway 18080:80 &
curl -s -D - -o /dev/null http://localhost:18080/
```

Compare the `Content-Security-Policy` header against the directives configured in `gateway.helmet.contentSecurityPolicy` / `gateway.helmetPerPath` for the values file you deployed with.

### Authenticated request round trip

For a pure API-level smoke test, it's fine to act as the auto-provisioned default admin user (`global.defaultAdminUserId`, default `00000000-0000-4000-8000-000000000000`) rather than creating a new one. Build a session JWT for it and confirm the auth chain works end-to-end:

```bash
JWT_SECRET=$(kubectl get secret -n magda auth-secrets -o jsonpath='{.data.jwt-secret}' | base64 -d)
yarn --silent acs-cmd jwt 00000000-0000-4000-8000-000000000000 "$JWT_SECRET" | tail -1 > /tmp/admin.jwt

curl -s -H "X-Magda-Session: $(cat /tmp/admin.jwt)" http://localhost:18080/api/v0/auth/users/whoami
```

> `acs-cmd jwt` prints a `JWT token for user ... is:` label line before the token — take only the last line, or the header will be malformed and every request will 400. Run it via `yarn --silent acs-cmd ...`, not plain `yarn acs-cmd ...` — without `--silent`, yarn appends its own `Done in ...s.` line after the command output, which `tail -1` would grab instead of the token.

> Minting a token straight from the JWT secret only works because you have direct cluster/Secret access — it's a testing shortcut, not a real access path. It bypasses the gateway's normal authentication entirely, so it only works for calls made from inside the cluster (or through a port-forward standing in for one) and should never be used to represent "external API access". For actual API access from outside the cluster, through the gateway, a user should create an **API key** instead — via the "My Account" panel in the Web UI, or the `create-api-key` CLI script — see [How to create API key](./how-to-create-api-key.md) and the [Guide to Magda Internals](<./architecture/Guide to Magda Internals.md>) for how authentication is actually meant to work end-to-end.

#### Testing via the UI (requires a real login)

A JWT built directly with `acs-cmd jwt` only works for API calls — there's no way to paste it into the browser to log into the UI as that user. If the smoke test needs to exercise the UI while logged in, install the [`magda-auth-internal`](https://github.com/magda-io/magda-auth-internal) plugin and create a dedicated test admin account instead. This flow was verified against a real minikube deployment as follows:

1. **Install the plugin as its own Helm release in the `magda` namespace**, pointed at the officially published chart (don't build from a local checkout — see the version-skew warning below):
   ```bash
   helm install magda-auth-internal oci://ghcr.io/magda-io/charts/magda-auth-internal --version <VERSION> \
     -n magda --set global.externalUrl=http://localhost:6100 --set global.enableLivenessProbes=true
   ```
   It reuses the main deployment's existing `auth-secrets` Secret and `gateway-config` ConfigMap, so it just needs to land in the same namespace — no separate DB/secret setup required.
2. **Register it with Gateway** by upgrading the main `magda` release. The value lives under `magda-core.gateway.authPlugins` (gateway is a subchart of `magda-core`, not top-level — `gateway.authPlugins` alone silently renders an empty `authPlugins.json` and does nothing):
   ```yaml
   # auth-plugin-values.yaml
   magda-core:
     gateway:
       authPlugins:
         - key: internal
           baseUrl: http://magda-auth-internal
   ```
   ```bash
   helm upgrade magda oci://ghcr.io/magda-io/charts/magda --version <VERSION> -n magda \
     --reuse-values -f auth-plugin-values.yaml
   kubectl rollout status deployment/gateway -n magda
   ```
   Confirm it took: `kubectl get configmap -n magda gateway-config -o jsonpath='{.data.authPlugins\.json}'` should show the `internal` entry, not `[]`.
3. **Create a local user with the `set-user-password` tool**, cloning/checking out [`magda-auth-internal`](https://github.com/magda-io/magda-auth-internal) at the same version as the chart you installed — an older checkout can be schema-incompatible with the current DB (see warning below):

   ```bash
   git clone https://github.com/magda-io/magda-auth-internal.git && cd magda-auth-internal
   git checkout v<VERSION>
   yarn install
   # On Apple Silicon, bcrypt's prebuilt binary is sometimes x86_64 — if you hit
   # `ERR_DLOPEN_FAILED ... incompatible architecture`, rebuild it from source:
   #   npm rebuild bcrypt --build-from-source

   export PGPASSWORD=$(kubectl get secret -n magda db-main-account-secret -o jsonpath='{.data.postgresql-password}' | base64 -d)
   kubectl port-forward -n magda svc/combined-db-postgresql 15432:5432 &
   POSTGRES_HOST=localhost POSTGRES_PORT=15432 POSTGRES_DB=auth POSTGRES_USER=postgres POSTGRES_PASSWORD="$PGPASSWORD" \
     yarn set-user-password -c e2e-test-admin@example.com -p "<a real password>" -n "E2E Test Admin" -a
   ```

   As of `magda-auth-internal` v3.0.0, the `-a`/`--isAdmin` flag inserts the "Admin Users" RBAC role directly at creation time — there's no separate admin-promotion step needed. (Older versions predate the app's move away from a `users.isAdmin` column and will fail with `column "isAdmin" of relation "users" does not exist` against a current database — check out a version that matches the deployed chart.)

4. **Verify the user via `acs-cmd`** (optional, but confirms the tool sees the same data):
   ```bash
   POSTGRES_HOST=localhost POSTGRES_PORT=15432 POSTGRES_DB=auth POSTGRES_USER=postgres POSTGRES_PASSWORD="$PGPASSWORD" \
     yarn acs-cmd list users
   ```
   Should list the new user with both `Authenticated Users` and `Admin Users` roles.
5. **Log into the UI** with that user's email/password.

This last step needs real HTTPS access to the local minikube deployment — see [How to setup HTTPS access to Local Dev Cluster](./how-to-setup-https-to-local-cluster.md). It's not optional: the plugin's session cookie is configured `secure: true`, and `express-session` silently withholds `Set-Cookie` on a non-HTTPS connection (confirmed by testing the login POST over a plain `kubectl port-forward` — it redirects with `result=success` but no session cookie is ever set, so a subsequent `whoami` call comes back anonymous). A `kubectl port-forward` tunnel is enough to validate the plugin/API wiring (steps 1-4 above), but not enough to get a working browser session.

### Data round trip (registry → indexer → search)

```bash
TOKEN=$(cat /tmp/admin.jwt)
ID="smoke-test-$(date +%s)"

curl -s -X PUT "http://localhost:18080/api/v0/registry/records/$ID" \
  -H "X-Magda-Session: $TOKEN" -H "Content-Type: application/json" -H "X-Magda-Tenant-Id: 0" \
  -d "{\"id\":\"$ID\",\"name\":\"Smoke Test\",\"aspects\":{\"dcat-dataset-strings\":{\"title\":\"Smoke Test\"},\"publishing\":{\"state\":\"published\"}}}"

sleep 15
curl -s "http://localhost:18080/api/v0/search/datasets?query=Smoke%20Test" -H "X-Magda-Session: $TOKEN"

curl -s -X DELETE "http://localhost:18080/api/v0/registry/records/$ID" -H "X-Magda-Session: $TOKEN" -H "X-Magda-Tenant-Id: 0"
```

Confirms the registry API accepts writes, the indexer picks up the change, and it becomes searchable — the core dataset lifecycle working across three services.

### Deeper feature-specific testing

The checks above are the baseline smoke test suite. If the PR under test changes a specific feature (semantic search access control, a connector, a minion), add targeted checks for that feature on top of this baseline rather than replacing it — e.g. creating a dataset with a distribution, waiting for the relevant indexer to build its index, and testing the feature's specific API/behavior with both anonymous and authenticated requests.

### Feature-specific testing through the gateway with an API key

The baseline checks above act as the internal admin using an `X-Magda-Session`
JWT minted from the cluster secret — a convenient **internal** shortcut that
bypasses the gateway's real authentication. To verify a feature the way an
external client actually uses it, test **through the gateway authenticated with
an API key** instead. (A minted JWT is an internal auth method; real external
clients authenticate with an API key — see
[How to create API key](./how-to-create-api-key.md) and the
[Guide to Magda Internals](<./architecture/Guide to Magda Internals.md>).)

The steps below establish that external path once — host → gateway
(authentication + routing) → service. Concrete, repeatable feature checks that
build on it live under [E2E test cases](./e2e-test-cases/) — for example
[Large file storage (multipart upload + Range download)](./e2e-test-cases/large-file-storage.md).

#### 1. Expose the gateway to the host via `minikube tunnel`

On the docker driver the NodePort's `minikube ip` address isn't routable from the
host, so switch the gateway to a `LoadBalancer` and run `minikube tunnel`. Use a
**non-privileged port** (e.g. 8080) so the tunnel doesn't need `sudo` (privileged
ports like 80 make `minikube tunnel` prompt for a password):

```bash
kubectl patch svc gateway -n magda -p '{"spec":{"type":"LoadBalancer"}}'
kubectl patch svc gateway -n magda --type=json \
  -p='[{"op":"replace","path":"/spec/ports/0/port","value":8080}]'
minikube tunnel &            # keep running; serves the LB at 127.0.0.1:8080
export BASE=http://127.0.0.1:8080
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/api/v0/auth/users/whoami"   # 200 = reachable
```

(`kubectl port-forward -n magda svc/gateway 18080:80 &` is a simpler alternative
that also routes through the gateway if you can't use a tunnel.)

#### 2. Bootstrap an admin API key (JWT used only to create the key)

```bash
ADMIN_ID=00000000-0000-4000-8000-000000000000
JWT_SECRET=$(kubectl get secret -n magda auth-secrets -o jsonpath='{.data.jwt-secret}' | base64 -d)
yarn --silent acs-cmd jwt "$ADMIN_ID" "$JWT_SECRET" | tail -1 > /tmp/admin.jwt
curl -s -X POST "$BASE/api/v0/auth/users/$ADMIN_ID/apiKeys" \
  -H "X-Magda-Session: $(cat /tmp/admin.jwt)" -H "Content-Type: application/json" -d '{}'
# -> {"id":"<API_KEY_ID>","key":"<API_KEY>"}
```

Supply the key on subsequent requests as `X-Magda-API-Key-Id` / `X-Magda-API-Key`.

#### 3. (Optional) create a dedicated admin test user via the API

Using the admin API key from step 2 (`-H X-Magda-API-Key-Id:.. -H X-Magda-API-Key:..`):

```bash
# create user -> returns {"id": "<NEW_USER_ID>", ...}
curl -s "${AUTH[@]}" -X POST "$BASE/api/v0/auth/users" -H "Content-Type: application/json" \
  -d '{"displayName":"E2E Admin","email":"e2e@example.com","source":"e2e-test","sourceId":"e2e-1"}'
# grant the "Admin Users" role (id 00000000-0000-0003-0000-000000000000)
curl -s "${AUTH[@]}" -X POST "$BASE/api/v0/auth/users/<NEW_USER_ID>/roles" \
  -H "Content-Type: application/json" -d '["00000000-0000-0003-0000-000000000000"]'
# create an API key for the new user -> {"id":..,"key":..}
curl -s "${AUTH[@]}" -X POST "$BASE/api/v0/auth/users/<NEW_USER_ID>/apiKeys" \
  -H "Content-Type: application/json" -d '{}'
```

#### 4. Run your feature's checks

With `$BASE` reachable and an API key in hand, exercise the feature's endpoints —
always sending the `X-Magda-API-Key-Id` / `X-Magda-API-Key` headers. Prefer a
scripted, checksum/assertion-based driver so the case is repeatable. Ready-to-run
examples live under [E2E test cases](./e2e-test-cases/), e.g.
[Large file storage (multipart upload + Range download)](./e2e-test-cases/large-file-storage.md).

#### Cleanup

Restore the gateway service and stop the tunnel when finished:

```bash
kubectl patch svc gateway -n magda --type=json -p='[{"op":"replace","path":"/spec/ports/0/port","value":80}]'
kubectl patch svc gateway -n magda -p '{"spec":{"type":"NodePort"}}'
# then stop the `minikube tunnel` process you started
```

Also remove any throwaway users / API keys you created and delete uploaded test
objects (see each test case's own cleanup notes).

## Step 5: Retrieve DB Credentials Safely

Several checks (e.g. running [`@magda/acs-cmd`](https://www.npmjs.com/package/@magda/acs-cmd) against Postgres) need the DB password from the `db-main-account-secret` Secret. Capture it into a shell variable — **do not print it to stdout/logs**:

```bash
export PGPASSWORD=$(kubectl get secret -n magda db-main-account-secret -o jsonpath='{.data.postgresql-password}' | base64 -d)
kubectl port-forward -n magda svc/combined-db-postgresql 15432:5432 &
POSTGRES_HOST=localhost POSTGRES_PORT=15432 POSTGRES_DB=auth POSTGRES_USER=postgres POSTGRES_PASSWORD="$PGPASSWORD" \
  yarn acs-cmd list users
```

Run it as `yarn acs-cmd <command>` (which resolves via the `node_modules/.bin/acs-cmd` symlink) rather than invoking `scripts/acs-cmd/index.js` directly with `node` — Commander derives the subcommand executable prefix from `process.argv[1]`'s basename, so running through `index.js` looks for a nonexistent `index-list` executable. `yarn acs-cmd --help` lists all top-level commands (`list`, `admin`, `assign`, `remove`, `create`, `jwt`); `yarn acs-cmd <command> --help` drills into a specific one.

## Step 6: Clean Up

Kill any `kubectl port-forward` processes you started. Either leave the deployment running for further manual poking, or tear it down the same way you started (`helm uninstall` + `kubectl delete namespace magda`) so the next test starts clean.
