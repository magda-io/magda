#!/bin/bash
# Self-contained render test: recoveryMode.recoveryTarget -> MAGDA_RECOVERY_TARGET.
# Copies ONLY the real configmap template into a throwaway chart (no helpers /
# subchart needed) and renders it with helm.
set -uo pipefail
CHART="$(cd "$(dirname "$0")/../../deploy/helm/internal-charts/magda-postgres" && pwd)"
TMPL="$CHART/templates/extra-env-vars-configmap.yaml"
fail=0

render() { # $1 = extra values yaml lines under recoveryMode
    local tmp; tmp="$(mktemp -d)"
    mkdir -p "$tmp/templates"
    printf 'apiVersion: v2\nname: rt-render-test\nversion: 0.0.0\n' > "$tmp/Chart.yaml"
    cp "$TMPL" "$tmp/templates/"
    cat > "$tmp/values.yaml" <<EOF
postgresql:
  fullnameOverride: test-db
envVars: {}
backupRestore:
  backup:
    enabled: false
  storageConfig: {}
  recoveryMode:
    enabled: true
    baseBackupName: LATEST
$1
EOF
    helm template t "$tmp" -f "$tmp/values.yaml" 2>&1
    rm -rf "$tmp"
}
has() { printf '%s\n' "$1" | grep -qF -- "$2" || { echo "FAIL[$3]: missing: $2"; fail=1; }; }

# default (recoveryTarget omitted) -> latest
has "$(render '')" 'MAGDA_RECOVERY_TARGET: "latest"' default
# explicit values pass through
has "$(render '    recoveryTarget: immediate')" 'MAGDA_RECOVERY_TARGET: "immediate"' immediate
has "$(render '    recoveryTarget: latest')" 'MAGDA_RECOVERY_TARGET: "latest"' latest

[ "$fail" = 0 ] && echo "PASS: recovery-target-render" || { echo "render tests FAILED"; exit 1; }
