#!/usr/bin/env bash
# Agent Workspace deployment profiles:
# - deploy/helm/agent-workspace-minikube.yml targets the local-deployment
#   umbrella (local-deployment -> magda -> magda-core);
# - deploy/helm/agent-workspace-gke-magda-core.yml uses the direct magda-core
#   values shape.
# Neither file may be packaged into the published magda-core chart.
# Requires `yarn update-all-charts` (vendored local-deployment dependencies).
set -euo pipefail

chart="$(cd "$(dirname "$0")/.." && pwd)"
helm_root="$(dirname "$chart")"
minikube_profile="$helm_root/agent-workspace-minikube.yml"
gke_profile="$helm_root/agent-workspace-gke-magda-core.yml"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# `! cmd` does not trigger `set -e`, so negative assertions use this helper.
refuted() {
    echo "Assertion failed: unexpected match at $0 line $1" >&2
    exit 1
}

count_kind() {
    grep -c "^kind: $1$" "$2" || true
}

resource_document() {
    local kind="$1" name="$2" file="$3"
    awk -v kind="$kind" -v name="$name" '
        BEGIN { RS = "---" }
        $0 ~ "(^|\\n)kind: " kind "(\\n|$)" &&
        $0 ~ "(^|\\n)  name: \"?" name "\"?(\\n|$)" { print; exit }
    ' "$file"
}

resources_of_kind() {
    local kind="$1" file="$2"
    awk -v kind="$kind" '
        BEGIN { RS = "---" }
        $0 ~ "(^|\\n)kind: " kind "(\\n|$)" { print "---"; print }
    ' "$file"
}

# Chart (dependency path below the top-level chart) of every rendered template.
rendered_charts() {
    sed -n 's|^# Source: ||p' "$1" | awk -F/ '{
        path = ""
        for (i = 2; i < NF; i += 2) {
            if ($i != "charts") break
            path = path (path == "" ? "" : "/") $(i + 1)
        }
        print (path == "" ? $1 : path)
    }' | sort -u
}

# --- Packaging: environment overlays are not part of magda-core.
[[ -z "$(find "$chart" -maxdepth 1 -name 'agent-workspace-*')" ]]
helm package "$chart" --destination "$tmp/package" >/dev/null
if tar -tzf "$tmp/package"/magda-core-*.tgz | grep -Eq 'agent-workspace-[^/]*\.ya?ml$'; then refuted $LINENO; fi

# --- Minikube profile through the local-deployment umbrella.
cat >"$tmp/ingress-ip.yaml" <<'EOF'
magda:
  magda-core:
    agent-services:
      runtime:
        hostAliases:
          - ip: 10.96.12.34
            hostnames: [magda.test]
        externalPrivateCidrs: [10.96.12.34/32]
        externalPrivatePorts: [443]
EOF
helm lint "$helm_root/local-deployment" -f "$minikube_profile" \
    -f "$tmp/ingress-ip.yaml" >/dev/null
helm template magda "$helm_root/local-deployment" --namespace magda \
    -f "$minikube_profile" -f "$tmp/ingress-ip.yaml" >"$tmp/minikube.yaml"

# Exactly the intended components: no connectors, minions, URL processors,
# semantic indexers, or additional auth plugins.
rendered_charts "$tmp/minikube.yaml" >"$tmp/minikube-charts.txt"
diff -u - "$tmp/minikube-charts.txt" <<'EOF'
magda-auth-internal
magda/magda-core
magda/magda-core/agent-services
magda/magda-core/authorization-api
magda/magda-core/authorization-db
magda/magda-core/combined-db
magda/magda-core/combined-db/magda-postgres
magda/magda-core/combined-db/magda-postgres/postgresql
magda/magda-core/content-api
magda/magda-core/content-db
magda/magda-core/gateway
magda/magda-core/indexer
magda/magda-core/ingress
magda/magda-core/llm-services
magda/magda-core/llm-services/litellm
magda/magda-core/opensearch
magda/magda-core/registry-api
magda/magda-core/registry-db
magda/magda-core/search-api
magda/magda-core/session-db
magda/magda-core/storage-api
magda/magda-core/storage-api/minio
magda/magda-core/web-server
EOF

# One umbrella-owned internal auth plugin, discovered by Gateway.
[[ "$(grep -c '^  name: magda-auth-internal$' "$tmp/minikube.yaml")" == 2 ]] # Deployment + Service
[[ -n "$(resource_document Service magda-auth-internal "$tmp/minikube.yaml")" ]]
grep -Fq 'authPlugins.json: "[{\"baseUrl\":\"http://magda-auth-internal\",\"key\":\"internal\"}]"' "$tmp/minikube.yaml"

# Nested component values reach their charts.
for image in magda-agent-manager magda-agent-runtime magda-llm-services \
    magda-authorization-api magda-opa magda-migrator-authorization-db \
    magda-gateway magda-storage-api magda-web-server; do
    grep -q "image: \"localhost:5000/$image:latest\"" "$tmp/minikube.yaml"
done
[[ "$(count_kind SandboxTemplate "$tmp/minikube.yaml")" == 1 ]]
[[ "$(count_kind SandboxWarmPool "$tmp/minikube.yaml")" == 1 ]]
minikube_sandbox="$(resources_of_kind SandboxTemplate "$tmp/minikube.yaml")"
grep -q 'storage: 10Gi' <<<"$minikube_sandbox"
if grep -q 'runtimeClassName:' "$tmp/minikube.yaml"; then refuted $LINENO; fi
grep -q '^  namespace: magda-agent$' "$tmp/minikube.yaml"
if resource_document Namespace magda-agent "$tmp/minikube.yaml" | grep -q .; then refuted $LINENO; fi
grep -q 'name: MAGDA_API_URL, value: "https://magda.test/api"' "$tmp/minikube.yaml"
grep -q 'secretName: magda-agent-trusted-ca' "$tmp/minikube.yaml"
grep -q 'value: "https://magda.test:18443/api/v0/agent/runtime/"' "$tmp/minikube.yaml"
# Dynamic ingress IP override nested under magda.magda-core.agent-services.
grep -Eq '^ +ip: 10\.96\.12\.34$' "$tmp/minikube.yaml"
grep -q 'cidr: "10.96.12.34/32"' "$tmp/minikube.yaml"
ingress="$(resource_document Ingress ingress "$tmp/minikube.yaml")"
grep -q 'kubernetes.io/ingress.class: nginx' <<<"$ingress"
grep -q 'host: "\?magda.test"\?' <<<"$ingress"
grep -q 'nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"' <<<"$ingress"
grep -q 'nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"' <<<"$ingress"
grep -q '/api/v0/agent/runtime' "$tmp/minikube.yaml"
# The provider credential is referenced, never committed.
grep -q 'name: litellm-provider' "$tmp/minikube.yaml"
if grep -Eq 'sk-[A-Za-z0-9]{16,}' "$minikube_profile" "$tmp/minikube.yaml"; then refuted $LINENO; fi

# gVisor variant of the same profile.
helm template magda "$helm_root/local-deployment" --namespace magda \
    -f "$minikube_profile" -f "$tmp/ingress-ip.yaml" \
    --set magda.magda-core.agent-services.warmPool.type=gvisor \
    >"$tmp/minikube-gvisor.yaml"
grep -q 'runtimeClassName: "gvisor"' "$tmp/minikube-gvisor.yaml"

# The ordinary local deployment does not enable Agent Workspace.
helm template magda "$helm_root/local-deployment" --namespace magda \
    >"$tmp/local-default.yaml"
if grep -q 'Source: .*/charts/agent-services/' "$tmp/local-default.yaml"; then refuted $LINENO; fi
if grep -q 'Source: .*/charts/llm-services/' "$tmp/local-default.yaml"; then refuted $LINENO; fi

# --- GKE reference profile: direct magda-core values shape.
helm lint "$chart" -f "$gke_profile" >/dev/null
helm template magda "$chart" --namespace magda -f "$gke_profile" \
    --set tags.ingress=true >"$tmp/gke.yaml"
if grep -q 'Source: magda-core/charts/agent-services/' "$tmp/gke.yaml"; then refuted $LINENO; fi
grep -q 'Source: magda-core/charts/llm-services/' "$tmp/gke.yaml"
gke_ingress="$(resource_document Ingress ingress "$tmp/gke.yaml")"
grep -q 'kubernetes.io/ingress.class: magda-agent-nginx' <<<"$gke_ingress"
grep -q 'nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"' <<<"$gke_ingress"
grep -q 'nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"' <<<"$gke_ingress"

helm template magda "$chart" --namespace magda -f "$gke_profile" \
    --set global.agentWorkspace.enabled=true >"$tmp/gke-enabled.yaml"
gke_sandbox="$(resources_of_kind SandboxTemplate "$tmp/gke-enabled.yaml")"
grep -q 'runtimeClassName: "gvisor"' <<<"$gke_sandbox"
grep -q 'storage: 10Gi' <<<"$gke_sandbox"
grep -q 'storageClassName: "\?standard-rwo"\?' <<<"$gke_sandbox"
grep -q '^  namespace: magda-agents$' "$tmp/gke-enabled.yaml"
awk '/^kind: SandboxWarmPool$/{found=1} found && /^  replicas:/{print $2; exit}' \
    "$tmp/gke-enabled.yaml" | grep -qx 2

# The same reference nested for the published magda umbrella renders the same
# Agent Services resources.
awk '
    /^[^ #][^:]*:/ { top = ($1 == "global:") }
    top || /^#/ || /^$/ { print; next }
    { nested = nested "  " $0 "\n" }
    END { printf "magda-core:\n%s", nested }
' "$gke_profile" >"$tmp/gke-umbrella.yaml"
helm template magda "$helm_root/magda" --namespace magda -f "$tmp/gke-umbrella.yaml" \
    --set global.agentWorkspace.enabled=true >"$tmp/gke-umbrella-render.yaml"
grep -q 'runtimeClassName: "gvisor"' "$tmp/gke-umbrella-render.yaml"
grep -q 'storageClassName: "\?standard-rwo"\?' "$tmp/gke-umbrella-render.yaml"

printf 'Agent Workspace deployment profiles passed\n'
