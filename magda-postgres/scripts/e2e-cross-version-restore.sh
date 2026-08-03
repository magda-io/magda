#!/usr/bin/env bash
#
# E2E: cross-version wal-g backup / restore for the magda-postgres chart.
#
# Produces a base backup + WAL stream with PRODUCER_IMG (e.g. the currently
# shipped wal-g), then restores it under RESTORE_IMG (e.g. the upgraded wal-g)
# and asserts BOTH:
#   * full roll-forward  (recoveryTarget=latest)      -> all rows recovered
#   * point-in-time (PITR, recoveryTarget=<timestamp>) -> only pre-target rows
#
# This exercises the real restore path (wal-g wal-fetch as postgres
# restore_command), which the containerised integration harness does not — it is
# what catches wal-g 3.x's cross-device WAL-prefetch regression (roll-forward
# silently stopping at the base backup when WALG_PREFETCH_DIR is on a different
# filesystem than PGDATA).
#
# Requires: a running cluster (kubectl context set, e.g. minikube), helm, docker.
# The chart's postgresql subchart dep is fetched automatically.
#
# Usage:
#   PRODUCER_IMG=ghcr.io/magda-io/magda-postgres:6.1.2-alpha.0 \
#   RESTORE_IMG=ghcr.io/magda-io/magda-postgres:6.1.2-pr.3759.1 \
#   magda-postgres/scripts/e2e-cross-version-restore.sh
#
# Env (all optional): NS (default walg-e2e), DB_PW, KEEP_NS=1 (skip teardown),
# CHART_SRC (defaults to the in-repo chart).
set -euo pipefail

NS="${NS:-walg-e2e}"
PRODUCER_IMG="${PRODUCER_IMG:-ghcr.io/magda-io/magda-postgres:6.1.2-alpha.0}"
RESTORE_IMG="${RESTORE_IMG:-ghcr.io/magda-io/magda-postgres:6.1.2-pr.3759.1}"
DB_PW="${DB_PW:-magdae2epw}"
STS="default-db-postgresql"
POD="${STS}-0"
PVC="data-${STS}-0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHART_SRC="${CHART_SRC:-$(cd "$SCRIPT_DIR/../../deploy/helm/internal-charts/magda-postgres" && pwd)}"

say() { echo -e "\n=== $* ==="; }
fail() { echo "FAIL: $*" >&2; exit 1; }

# parse "registry/rest...:tag" into registry / repository / tag
img_parts() { local ref="$1"; local tag="${ref##*:}"; local repo="${ref%:*}"; echo "${repo%%/*}" "${repo#*/}" "$tag"; }
read -r PROD_REG PROD_REPO PROD_TAG < <(img_parts "$PRODUCER_IMG")
read -r REST_REG REST_REPO REST_TAG < <(img_parts "$RESTORE_IMG")

# psql helper: run one SQL statement, return trimmed scalar/stdout
psqlc() { kubectl -n "$NS" exec "$POD" -- env PGPASSWORD="$DB_PW" psql -U postgres -h 127.0.0.1 -tAc "$1"; }
rowcount() { psqlc "SELECT count(*) FROM xver;"; }

mc() { # run an mc one-liner against the in-cluster MinIO
  kubectl -n "$NS" run "mc-$RANDOM" --rm -i --restart=Never --image=minio/mc:latest --command -- \
    sh -c "mc alias set l http://minio:9000 minioadmin minioadmin123 >/dev/null 2>&1 && $1" 2>/dev/null
}

values_common() { cat <<YAML
postgresql:
  image: { registry: "$1", repository: "$2", tag: "$3", pullPolicy: IfNotPresent }
  persistence: { size: "2Gi" }
  resources: { requests: { cpu: 100m, memory: 300Mi } }
backupRestore:
  storageConfig:
    WALG_S3_PREFIX: "s3://walg/pg"
    AWS_ENDPOINT: "http://minio.${NS}.svc.cluster.local:9000"
    AWS_ACCESS_KEY_ID: "minioadmin"
    AWS_SECRET_ACCESS_KEY: "minioadmin123"
    AWS_S3_FORCE_PATH_STYLE: "true"
    AWS_REGION: "us-east-1"
YAML
}

reinstall() { # $1=values-file : uninstall + wipe PVC + install fresh, wait ready
  helm uninstall walg-e2e -n "$NS" >/dev/null 2>&1 || true
  kubectl -n "$NS" delete pvc "$PVC" --timeout=90s >/dev/null 2>&1 || true
  helm install walg-e2e "$CHART_DIR" -n "$NS" -f "$1" >/dev/null
  kubectl -n "$NS" rollout status "statefulset/$STS" --timeout=360s >/dev/null
}

# --- 0. scratch chart (drop cronjob: needs umbrella helpers; not used here) ----
say "Preparing chart (dep build, drop cronjob)"
CHART_DIR="$(mktemp -d)/magda-postgres"
cp -r "$CHART_SRC" "$CHART_DIR"
rm -f "$CHART_DIR/templates/cronjob-backup.yaml"
( cd "$CHART_DIR" && helm dependency build >/dev/null 2>&1 )

# --- 1. namespace + MinIO + bucket + db secret ---------------------------------
say "Namespace + MinIO + bucket"
kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl -n "$NS" apply -f - >/dev/null <<'YAML'
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
kubectl -n "$NS" rollout status deploy/minio --timeout=180s >/dev/null
mc "mc mb -p l/walg >/dev/null 2>&1; mc rm --recursive --force l/walg >/dev/null 2>&1 || true" >/dev/null
kubectl -n "$NS" create secret generic db-main-account-secret \
  --from-literal=postgresql-password="$DB_PW" --dry-run=client -o yaml | kubectl apply -f - >/dev/null

# --- 2. producer: base backup (A) + WAL (B, C) with the OLD wal-g ---------------
say "Producer: $PRODUCER_IMG (backup enabled)"
PVAL="$(mktemp)"; { values_common "$PROD_REG" "$PROD_REPO" "$PROD_TAG"; echo "  backup: { enabled: true, archiveTimeout: 30 }"; } > "$PVAL"
reinstall "$PVAL"
echo "wal-g in producer: $(kubectl -n "$NS" exec "$POD" -- wal-g --version 2>&1 | head -1)"
psqlc "CREATE TABLE xver(id bigserial primary key, tag text, v text);" >/dev/null
psqlc "INSERT INTO xver(tag,v) SELECT 'A','a'||g FROM generate_series(1,100) g;" >/dev/null
psqlc "CHECKPOINT;" >/dev/null
say "Verify WAL archiving (failed_count must be 0)"
sleep 35
ARCH="$(psqlc "SELECT archived_count||'/'||failed_count FROM pg_stat_archiver;")"
echo "pg_stat_archiver archived/failed = $ARCH"
[ "${ARCH#*/}" = "0" ] || fail "WAL archiving reported failures ($ARCH)"
[ "${ARCH%/*}" -ge 1 ] || fail "no WAL archived ($ARCH)"
say "Base backup (adduser.sh works around nss_wrapper being absent under kubectl exec)"
kubectl -n "$NS" exec "$POD" -- /usr/local/bin/adduser.sh >/dev/null 2>&1 || true
kubectl -n "$NS" exec "$POD" -- bash -c "PGHOST=127.0.0.1 PGUSER=postgres PGPASSWORD=$DB_PW wal-g backup-push \$PGDATA" 2>&1 \
  | grep -q "Wrote backup" || fail "base backup-push failed"
# post-backup writes B, PITR target T, then C; force WAL switch so they archive
psqlc "INSERT INTO xver(tag,v) SELECT 'B','b'||g FROM generate_series(1,50) g;" >/dev/null
psqlc "CHECKPOINT;" >/dev/null
T="$(psqlc "SELECT now();")"
psqlc "SELECT pg_sleep(3);" >/dev/null
psqlc "INSERT INTO xver(tag,v) SELECT 'C','c'||g FROM generate_series(1,50) g;" >/dev/null
psqlc "CHECKPOINT;" >/dev/null
psqlc "SELECT pg_switch_wal();" >/dev/null
echo "PITR target T (between B and C) = $T"
sleep 35
echo "MinIO objects: $(mc "echo base=\$(mc ls l/walg/pg/basebackups_005/ | wc -l) wal=\$(mc ls l/walg/pg/wal_005/ | wc -l)")"

# --- 3. restore under the NEW wal-g: roll-forward (latest) ----------------------
say "Restore roll-forward: $RESTORE_IMG (recoveryTarget=latest) -> expect 200 (A+B+C)"
RVAL="$(mktemp)"; { values_common "$REST_REG" "$REST_REPO" "$REST_TAG"; cat <<YAML
  backup: { enabled: false }
  recoveryMode: { enabled: true, recoveryTarget: "latest" }
YAML
} > "$RVAL"
reinstall "$RVAL"
echo "wal-g in restore: $(kubectl -n "$NS" exec "$POD" -- wal-g --version 2>&1 | head -1)"
N="$(rowcount)"; echo "rows recovered = $N"
[ "$N" = "200" ] || fail "roll-forward expected 200, got $N (cross-version WAL replay broken?)"

# --- 4. restore under the NEW wal-g: PITR to T ---------------------------------
say "Restore PITR: recoveryTarget=$T -> expect 150 (A+B, no C)"
QVAL="$(mktemp)"; { values_common "$REST_REG" "$REST_REPO" "$REST_TAG"; cat <<YAML
  backup: { enabled: false }
  recoveryMode: { enabled: true, recoveryTarget: "$T" }
YAML
} > "$QVAL"
reinstall "$QVAL"
N="$(rowcount)"; C="$(psqlc "SELECT count(*) FROM xver WHERE tag='C';")"
echo "rows recovered = $N (C rows = $C)"
[ "$N" = "150" ] || fail "PITR expected 150, got $N"
[ "$C" = "0" ] || fail "PITR recovered $C 'C' rows; should stop before them"

# --- 5. teardown ---------------------------------------------------------------
if [ "${KEEP_NS:-}" = "1" ]; then
  echo -e "\nKEEP_NS=1 set; leaving namespace $NS in place."
else
  say "Teardown"; kubectl delete namespace "$NS" --wait=false >/dev/null 2>&1 || true
fi

echo -e "\nALL CHECKS PASSED (roll-forward + PITR across $PRODUCER_IMG -> $RESTORE_IMG)"
