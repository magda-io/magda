#!/usr/bin/env bash
#
# Proves the plugin<->Magda compatibility handshake actually works.
#
# External charts (authentication plugins) vendor `magda.db-client-sslmode-env-v1`
# from magda-common and call into `magda.compatibility-check`, which lives in
# magda-core. Neither side is exercised by rendering Magda alone: Magda's own
# charts use `magda.db-client-sslmode-env` directly. Without this test the first
# time the handshake ever runs would be in a user's cluster.
#
# A throwaway fixture chart stands in for a plugin, so no external chart has to be
# published before the mechanism can be trusted.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../" && pwd)"

command -v helm >/dev/null 2>&1 || { echo "helm is required for this test"; exit 1; }

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# umbrella -> { magda-core (real definitions), fixture-plugin (vendors the shim) }
# The fixture is named to sort AFTER magda-core, mirroring real plugins
# (`magda-auth-oidc` > `magda`): if the check were ever shadowable, this ordering
# is the one that would expose it.
mk() { mkdir -p "$1/templates"; printf 'apiVersion: v2\nname: %s\nversion: 0.1.0\n' "$2" > "$1/Chart.yaml"; }

mk "${TMP_DIR}/umbrella" umbrella
echo "{}" > "${TMP_DIR}/umbrella/values.yaml"

mk "${TMP_DIR}/umbrella/charts/magda-core" magda-core
echo "{}" > "${TMP_DIR}/umbrella/charts/magda-core/values.yaml"
cp "${ROOT_DIR}/deploy/helm/magda-core/templates/_helpers.tpl" \
   "${TMP_DIR}/umbrella/charts/magda-core/templates/_helpers.tpl"

mk "${TMP_DIR}/umbrella/charts/zz-fixture-plugin" zz-fixture-plugin
mkdir -p "${TMP_DIR}/umbrella/charts/zz-fixture-plugin/charts/magda-common/templates"
printf 'apiVersion: v2\nname: magda-common\nversion: 0.1.0\ntype: library\n' \
  > "${TMP_DIR}/umbrella/charts/zz-fixture-plugin/charts/magda-common/Chart.yaml"
cp "${ROOT_DIR}/deploy/helm/magda-common/templates/_db-secrets.tpl" \
   "${TMP_DIR}/umbrella/charts/zz-fixture-plugin/charts/magda-common/templates/_db-secrets.tpl"
cat > "${TMP_DIR}/umbrella/charts/zz-fixture-plugin/values.yaml" <<'EOF'
global:
  magdaCompatibilityCheck: true
EOF
cat > "${TMP_DIR}/umbrella/charts/zz-fixture-plugin/templates/deployment.yaml" <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: fixture-plugin
data:
  env: |
{{ include "magda.db-client-sslmode-env-v1" . | indent 4 }}
EOF

UMB="${TMP_DIR}/umbrella"

# 1. Supported contract, check enabled: renders, and the shim emits the real value.
OUT="${TMP_DIR}/ok.yaml"
helm template compat "${UMB}" > "${OUT}"
if ! grep -q 'name: "PGSSLMODE"' "${OUT}"; then
    echo "expected the v1 shim to emit PGSSLMODE when the contract is supported"
    exit 1
fi
if ! grep -q 'value: "require"' "${OUT}"; then
    echo "expected the v1 shim to delegate to magda-core and resolve sslmode to require"
    exit 1
fi

# 2. `global.magdaCompatibilityCheck=false` must skip the check entirely - this is
#    what lets a plugin repo run `helm template`/`helm lint` standalone, and what
#    lets an operator deliberately run a mismatched pair.
helm template compat "${UMB}" --set global.magdaCompatibilityCheck=false > /dev/null || {
    echo "expected global.magdaCompatibilityCheck=false to skip the check"; exit 1; }

# 3. The check must actually be capable of failing. Point the fixture at a
#    contract this Magda version does not support and require a hard error that
#    names both the offending chart and the helper.
sed -i.bak 's/magda.db-client-sslmode-env-v1/magda.db-client-sslmode-env-v0/' \
    "${UMB}/charts/zz-fixture-plugin/templates/deployment.yaml"
cat >> "${UMB}/charts/zz-fixture-plugin/charts/magda-common/templates/_db-secrets.tpl" <<'EOF'
{{- define "magda.db-client-sslmode-env-v0" -}}
{{- include "magda.compatibility-check" (dict "helper" "db-client-sslmode-env-v0" "chart" .Chart.Name) -}}
{{- end -}}
EOF
if helm template compat "${UMB}" > /dev/null 2> "${TMP_DIR}/fail.stderr"; then
    echo "expected an unsupported helper contract to fail the render"
    exit 1
fi
grep -q "zz-fixture-plugin" "${TMP_DIR}/fail.stderr" || {
    echo "compatibility failure must name the offending chart"; exit 1; }
grep -q "db-client-sslmode-env-v0" "${TMP_DIR}/fail.stderr" || {
    echo "compatibility failure must name the unsupported helper contract"; exit 1; }

echo "compatibility check: supported contract renders, unsupported fails with an actionable message, opt-out works"
