# E2E Test Case: in-cluster PostgreSQL wal-g cross-version backup / restore

A step-by-step end-to-end test for the `magda-postgres` chart's wal-g backup /
restore, run against a real cluster (e.g. minikube). It produces a base backup +
WAL stream with **one** wal-g version and restores it under **another**, verifying
that both **full roll-forward** and **point-in-time recovery (PITR)** survive the
version change. Run it whenever the bundled wal-g version (or the `magda-postgres`
image base) changes.

## What it covers

The chart is deployed twice against one shared in-cluster MinIO bucket:

1. **Producer** (old wal-g): with backups enabled, seed rows **A**, confirm
   continuous WAL archiving, take a base backup, then write **B**, record a PITR
   timestamp **T**, write **C**, and force a WAL switch so B and C are archived.
2. **Restore** (new wal-g), into a fresh volume, in recovery mode:
   - `recoveryTarget: latest` → must recover **A + B + C** (full roll-forward
     through WAL produced by the _other_ version).
   - `recoveryTarget: <T>` → must recover **A + B** only, stopping before **C**.

The restore drives `wal-g wal-fetch` as PostgreSQL's `restore_command`, so it
exercises wal-g's **WAL prefetch**. The containerised integration harness
(`magda-int-test-ts`) pre-stages WAL segments instead and cannot catch prefetch
regressions — e.g. wal-g 3.x moving prefetched segments into `$PGDATA/pg_wal` with
`rename(2)`, which fails (`invalid cross-device link`) when `WALG_PREFETCH_DIR` is
on a different filesystem than PGDATA and silently stops roll-forward at the base
backup. Because this case checks the recovered **row counts**, that failure shows
up as roll-forward recovering only the base-backup rows.

## Prerequisites

- A cluster with your `kubectl` context pointed at it (e.g. `minikube start`), plus
  `helm` and `docker`.
- Two `magda-postgres` images to compare — one carrying the _old_ wal-g, one the
  _new_ wal-g (e.g. a PR testing build; see
  [How to Release a New Version](../ci-version-release.md)). Set them, and the tags
  (the chart's image `registry`/`repository` defaults already point at
  `ghcr.io/magda-io/magda-postgres`, so only the tag varies):

  ```bash
  export NS=walg-e2e
  export DB_PW=magdae2epw
  export PROD_TAG=6.1.2-alpha.0      # image with the OLD wal-g
  export REST_TAG=6.1.2-pr.3759.1    # image with the NEW wal-g
  export CHART=deploy/helm/internal-charts/magda-postgres
  ```

## 1. Namespace, MinIO, bucket, DB secret

```bash
kubectl create namespace "$NS"

# In-cluster MinIO (S3-compatible) + service
kubectl -n "$NS" apply -f - <<'YAML'
apiVersion: apps/v1
kind: Deployment
metadata: { name: minio }
spec:
  replicas: 1
  selector: { matchLabels: { app: minio } }
  template:
    metadata: { labels: { app: minio } }
    spec:
      containers:
        - name: minio
          image: minio/minio:latest
          args: ["server", "/data"]
          env:
            - { name: MINIO_ROOT_USER, value: "minioadmin" }
            - { name: MINIO_ROOT_PASSWORD, value: "minioadmin123" }
          ports: [ { containerPort: 9000 } ]
          volumeMounts: [ { name: data, mountPath: /data } ]
      volumes: [ { name: data, emptyDir: {} } ]
---
apiVersion: v1
kind: Service
metadata: { name: minio }
spec:
  selector: { app: minio }
  ports: [ { name: s3, port: 9000, targetPort: 9000 } ]
YAML
kubectl -n "$NS" rollout status deploy/minio --timeout=180s

# Create the backup bucket
kubectl -n "$NS" run mc --rm -i --restart=Never --image=minio/mc:latest --command -- \
  sh -c "mc alias set l http://minio:9000 minioadmin minioadmin123 && mc mb -p l/walg"

# DB password secret the chart expects
kubectl -n "$NS" create secret generic db-main-account-secret \
  --from-literal=postgresql-password="$DB_PW"
```

Create a values file with the storage config (shared by every phase):

```bash
cat > /tmp/walg-e2e-storage.yaml <<YAML
postgresql:
  persistence: { size: "2Gi" }
  resources: { requests: { cpu: 100m, memory: 300Mi } }
backupRestore:
  storageConfig:
    WALG_S3_PREFIX: "s3://walg/pg"
    AWS_ENDPOINT: "http://minio.$NS.svc.cluster.local:9000"
    AWS_ACCESS_KEY_ID: "minioadmin"
    AWS_SECRET_ACCESS_KEY: "minioadmin123"
    AWS_S3_FORCE_PATH_STYLE: "true"
    AWS_REGION: "us-east-1"
YAML
```

## 2. Prepare the chart

The chart's `cronjob-backup.yaml` needs umbrella (`magda-common`) helpers and isn't
used here, so work from a copy with it removed, and fetch the postgresql subchart:

```bash
cp -r "$CHART" /tmp/walg-e2e-chart
rm -f /tmp/walg-e2e-chart/templates/cronjob-backup.yaml
( cd /tmp/walg-e2e-chart && helm dependency build )
```

## 3. Produce backups with the OLD wal-g

Deploy the producer with backups enabled:

```bash
helm install walg-e2e /tmp/walg-e2e-chart -n "$NS" -f /tmp/walg-e2e-storage.yaml \
  --set postgresql.image.tag="$PROD_TAG" \
  --set backupRestore.backup.enabled=true \
  --set backupRestore.backup.archiveTimeout=30
kubectl -n "$NS" rollout status statefulset/default-db-postgresql-pg17 --timeout=360s

# sanity: this pod runs the OLD wal-g
kubectl -n "$NS" exec default-db-postgresql-pg17-0 -- wal-g --version
```

Seed rows **A** and confirm WAL is being archived (expect `failed_count = 0` after
`archiveTimeout`):

```bash
kubectl -n "$NS" exec default-db-postgresql-pg17-0 -- env PGPASSWORD="$DB_PW" \
  psql -U postgres -h 127.0.0.1 -c \
  "CREATE TABLE xver(id bigserial primary key, tag text, v text);
   INSERT INTO xver(tag,v) SELECT 'A','a'||g FROM generate_series(1,100) g;
   CHECKPOINT;"
sleep 35
kubectl -n "$NS" exec default-db-postgresql-pg17-0 -- env PGPASSWORD="$DB_PW" \
  psql -U postgres -h 127.0.0.1 -c \
  "SELECT archived_count, failed_count FROM pg_stat_archiver;"
```

Take a base backup. Run `adduser.sh` first: under `kubectl exec` wal-g runs without
the bitnami entrypoint's `nss_wrapper`, so it can't resolve its uid (1001) until a
`/etc/passwd` record exists (the pod's own `archive_command`/recovery run under the
entrypoint and don't need this):

```bash
kubectl -n "$NS" exec default-db-postgresql-pg17-0 -- /usr/local/bin/adduser.sh
kubectl -n "$NS" exec default-db-postgresql-pg17-0 -- \
  bash -c 'PGHOST=127.0.0.1 PGUSER=postgres PGPASSWORD='"$DB_PW"' wal-g backup-push $PGDATA'
```

Write **B**, capture the PITR target **T**, write **C**, and force a WAL switch so
they archive. Note the printed `T` — you'll use it in step 5:

Each statement group below is a **separate `-c`**, and that matters: `psql -c` sends a
multi-statement string as one simple-query message, which PostgreSQL wraps in a single
implicit transaction. Bundled together, B and C would commit at the same instant, and
`now()` — which returns _transaction start_ time, not wall clock — would yield a `T`
earlier than B's commit. The step-5 PITR would then recover neither B nor C (100 rows),
silently passing through a procedure that no longer tests point-in-time granularity at
all. Separate `-c` flags run as separate transactions, and `clock_timestamp()` is read
at execution time rather than transaction start.

```bash
# B commits on its own, before T is taken.
kubectl -n "$NS" exec default-db-postgresql-pg17-0 -- env PGPASSWORD="$DB_PW" \
  psql -U postgres -h 127.0.0.1 \
  -c "INSERT INTO xver(tag,v) SELECT 'B','b'||g FROM generate_series(1,50) g;" \
  -c "CHECKPOINT;" \
  -c "SELECT clock_timestamp() AS pitr_target_T;"

sleep 3    # keep T strictly between B's and C's commits

# C commits strictly after T.
kubectl -n "$NS" exec default-db-postgresql-pg17-0 -- env PGPASSWORD="$DB_PW" \
  psql -U postgres -h 127.0.0.1 \
  -c "INSERT INTO xver(tag,v) SELECT 'C','c'||g FROM generate_series(1,50) g;" \
  -c "CHECKPOINT;" \
  -c "SELECT pg_switch_wal();"

sleep 35   # let the last segment archive
export T='<paste the pitr_target_T value here>'
```

## 4. Restore under the NEW wal-g — roll-forward

Restore into a **fresh** volume (delete the producer's PVC) in recovery mode with
`recoveryTarget: latest`, using the NEW wal-g image. Expect **200** rows (A+B+C):

```bash
helm uninstall walg-e2e -n "$NS"
kubectl -n "$NS" delete pvc data-default-db-postgresql-pg17-0

helm install walg-e2e /tmp/walg-e2e-chart -n "$NS" -f /tmp/walg-e2e-storage.yaml \
  --set postgresql.image.tag="$REST_TAG" \
  --set backupRestore.recoveryMode.enabled=true \
  --set backupRestore.recoveryMode.recoveryTarget=latest
kubectl -n "$NS" rollout status statefulset/default-db-postgresql-pg17 --timeout=360s

kubectl -n "$NS" exec default-db-postgresql-pg17-0 -- wal-g --version   # NEW wal-g
kubectl -n "$NS" exec default-db-postgresql-pg17-0 -- env PGPASSWORD="$DB_PW" \
  psql -U postgres -h 127.0.0.1 -c "SELECT count(*) FROM xver;"   # expect 200
```

If this returns only **100**, roll-forward stopped at the base backup — check the
pod log for `invalid cross-device link` (the `WALG_PREFETCH_DIR` regression).

## 5. Restore under the NEW wal-g — PITR

Same again, but target the timestamp **T** (between B and C). Expect **150** rows
(A+B) and **no C**:

```bash
helm uninstall walg-e2e -n "$NS"
kubectl -n "$NS" delete pvc data-default-db-postgresql-pg17-0

helm install walg-e2e /tmp/walg-e2e-chart -n "$NS" -f /tmp/walg-e2e-storage.yaml \
  --set postgresql.image.tag="$REST_TAG" \
  --set backupRestore.recoveryMode.enabled=true \
  --set backupRestore.recoveryMode.recoveryTarget="$T"
kubectl -n "$NS" rollout status statefulset/default-db-postgresql-pg17 --timeout=360s

kubectl -n "$NS" exec default-db-postgresql-pg17-0 -- env PGPASSWORD="$DB_PW" \
  psql -U postgres -h 127.0.0.1 -c \
  "SELECT count(*) AS total FROM xver;
   SELECT count(*) AS c_rows FROM xver WHERE tag='C';"   # expect total=150, c_rows=0
```

## Cleanup

```bash
kubectl delete namespace "$NS"
rm -rf /tmp/walg-e2e-chart /tmp/walg-e2e-storage.yaml
```

## Notes

- On Apple-Silicon minikube the amd64 `magda-postgres` image runs under
  rosetta/qemu, so pod startup is slower — the rollout timeouts above allow for it.
- `WALG_PREFETCH_DIR` must stay on the **same filesystem** as PGDATA. The chart
  default (`/bitnami/postgresql/wal-g-prefetch`) is on the data PVC but outside
  PGDATA; a value on the image's overlay FS breaks roll-forward under wal-g 3.x.
- See also [in-cluster database backup and restore](../in-cluster-database-backup-and-restore.md)
  for how the chart wires `storageConfig`, `archive_command`, and recovery.
