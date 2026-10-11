#!/usr/bin/env bash
set -euo pipefail

chart="$(cd "$(dirname "$0")/.." && pwd)"
helm_root="$(dirname "$chart")"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

render() {
    local output="$1" release="$2" namespace="$3"
    shift 3
    helm template "$release" "$chart" --namespace "$namespace" "$@" >"$output"
}

count_kind() {
    grep -c "^kind: $1$" "$2" || true
}

resource_document() {
    local kind="$1" name="$2" file="$3"
    awk -v kind="$kind" -v name="$name" '
        BEGIN { RS = "---" }
        $0 ~ "(^|\\n)kind: " kind "(\\n|$)" &&
        $0 ~ "(^|\\n)  name: " name "(\\n|$)" { print; exit }
    ' "$file"
}

resources_of_kind() {
    local kind="$1" file="$2"
    awk -v kind="$kind" '
        BEGIN { RS = "---" }
        $0 ~ "(^|\\n)kind: " kind "(\\n|$)" { print "---"; print }
    ' "$file"
}

expect_failure() {
    local expected="$1"
    shift
    if "$@" >"$tmp/failure.out" 2>&1; then
        echo "Expected command to fail: $*" >&2
        exit 1
    fi
    grep -F "$expected" "$tmp/failure.out" >/dev/null
}

render "$tmp/disabled.yaml" magda test
[[ "$(count_kind SandboxTemplate "$tmp/disabled.yaml")" == 0 ]]
[[ "$(count_kind SandboxWarmPool "$tmp/disabled.yaml")" == 0 ]]
! grep -q 'Source: magda-core/charts/llm-services/' "$tmp/disabled.yaml"
! grep -q 'Source: magda-core/charts/agent-services/' "$tmp/disabled.yaml"

render "$tmp/llm-only.yaml" magda test \
    --set global.llmServices.enabled=true

grep -q 'Source: magda-core/charts/llm-services/templates/deployment.yaml' "$tmp/llm-only.yaml"
grep -q 'Source: magda-core/charts/llm-services/charts/litellm/templates/deployment.yaml' "$tmp/llm-only.yaml"
! grep -q 'Source: magda-core/charts/agent-services/' "$tmp/llm-only.yaml"
grep -q '\\"llm\\"' "$tmp/llm-only.yaml"
! grep -q '\\"agent\\"' "$tmp/llm-only.yaml"

for runtime in runc gvisor kata; do
    render "$tmp/$runtime.yaml" magda test \
        --set global.agentWorkspace.enabled=true \
        --set global.llmServices.enabled=true \
        --set agent-services.warmPool.type="$runtime" \
        --set agent-services.warmPool.size=1
    [[ "$(count_kind SandboxTemplate "$tmp/$runtime.yaml")" == 1 ]]
    [[ "$(count_kind SandboxWarmPool "$tmp/$runtime.yaml")" == 1 ]]
    grep -q 'MAGDA_INSTALLATION_ID' "$tmp/$runtime.yaml"
    grep -Eq '^  name: magda-agent-sandbox-[0-9a-f]{12}$' "$tmp/$runtime.yaml"
    grep -Eq '^      serviceAccountName: magda-agent-sandbox-[0-9a-f]{12}$' "$tmp/$runtime.yaml"
    [[ "$(grep -c '^automountServiceAccountToken: false$' "$tmp/$runtime.yaml")" == 1 ]]
    [[ "$(grep -c '^      automountServiceAccountToken: false$' "$tmp/$runtime.yaml")" == 1 ]]
    grep -q 'fsGroupChangePolicy: OnRootMismatch' "$tmp/$runtime.yaml"
    grep -q 'Kubernetes Agent Sandbox v1beta1 extension APIs are unavailable' "$tmp/$runtime.yaml"
    grep -q '^    type: Recreate$' "$tmp/$runtime.yaml"
    if [[ "$runtime" == runc ]]; then
        ! grep -q 'runtimeClassName:' "$tmp/$runtime.yaml"
    else
        grep -q "runtimeClassName: \"$runtime\"" "$tmp/$runtime.yaml"
    fi
done

render "$tmp/denied-public.yaml" magda test \
    --set global.agentWorkspace.enabled=true \
    --set global.llmServices.enabled=true \
    --set 'agent-services.runtime.deniedCidrs[0]=203.0.113.10/32'
awk '
    /cidr: 0\.0\.0\.0\/0/ { public_rule = 1 }
    public_rule && /- "203\.0\.113\.10\/32"/ { found = 1 }
    END { exit !found }
' "$tmp/denied-public.yaml"

expect_failure \
    'global.agentWorkspace.enabled=true requires global.llmServices.enabled=true' \
    helm template magda "$chart" --namespace test \
        --set global.agentWorkspace.enabled=true
expect_failure 'agent-services.manager.replicas must be 1' \
    helm template magda "$chart" --namespace test \
        --set global.agentWorkspace.enabled=true \
        --set global.llmServices.enabled=true \
        --set agent-services.manager.replicas=2
expect_failure 'agent-services.warmPool.type must be one of' \
    helm template magda "$chart" --namespace test \
        --set global.agentWorkspace.enabled=true \
        --set global.llmServices.enabled=true \
        --set agent-services.warmPool.type=unknown
expect_failure 'agent-services.warmPool.size must be a non-negative integer' \
    helm template magda "$chart" --namespace test \
        --set global.agentWorkspace.enabled=true \
        --set global.llmServices.enabled=true \
        --set agent-services.warmPool.size=-1
expect_failure 'agent-services.warmPool.size must be a non-negative integer' \
    helm template magda "$chart" --namespace test \
        --set global.agentWorkspace.enabled=true \
        --set global.llmServices.enabled=true \
        --set-string agent-services.warmPool.size=one

render "$tmp/external.yaml" magda test \
    --set global.llmServices.enabled=true \
    --set llm-services.litellm.enabled=false \
    --set llm-services.backend.url=https://litellm.example/v1 \
    --set llm-services.backend.masterKeySecret.name=external-litellm \
    --set llm-services.backend.masterKeySecret.key=api-key
! grep -q 'charts/litellm/templates/' "$tmp/external.yaml"
grep -q 'value: "https://litellm.example/v1"' "$tmp/external.yaml"

# Generated credentials are retained, reused through lookup, and rendered only
# when they are release-owned. Operator-managed mode must reference, not create,
# the configured Secrets.
grep -q 'Source: magda-core/charts/llm-services/charts/litellm/templates/secret.yaml' "$tmp/llm-only.yaml"
grep -q 'helm.sh/resource-policy: keep' "$tmp/llm-only.yaml"
grep -q 'lookup "v1" "Secret"' "$helm_root/internal-charts/litellm/templates/secret.yaml"
grep -q 'magda.isPartOfRelease' "$helm_root/internal-charts/litellm/templates/secret.yaml"
grep -q 'lookup "v1" "Secret"' "$helm_root/internal-charts/agent-services/templates/control-secret.yaml"
grep -q 'magda.isPartOfRelease' "$helm_root/internal-charts/agent-services/templates/control-secret.yaml"
render "$tmp/operator-secrets.yaml" magda test \
    --set global.agentWorkspace.enabled=true \
    --set global.llmServices.enabled=true \
    --set agent-services.warmPool.type=runc \
    --set agent-services.controlPlaneSecret.create=false \
    --set agent-services.controlPlaneSecret.name=operator-control \
    --set llm-services.litellm.masterKeySecret.create=false \
    --set llm-services.litellm.masterKeySecret.name=operator-litellm
! grep -q 'Source: magda-core/charts/agent-services/templates/control-secret.yaml' "$tmp/operator-secrets.yaml"
! grep -q 'Source: magda-core/charts/llm-services/charts/litellm/templates/secret.yaml' "$tmp/operator-secrets.yaml"
grep -q 'name: operator-control' "$tmp/operator-secrets.yaml"
grep -q 'name: operator-litellm' "$tmp/operator-secrets.yaml"

expect_failure 'litellm.enabled=false requires backend.url' \
    helm template magda "$chart" --namespace test \
        --set global.llmServices.enabled=true \
        --set llm-services.litellm.enabled=false
expect_failure 'backend.* must be empty when litellm.enabled=true' \
    helm template magda "$chart" --namespace test \
        --set global.llmServices.enabled=true \
        --set llm-services.backend.url=https://unused.example

render "$tmp/release-a.yaml" release-a magda-a \
    --set global.agentWorkspace.enabled=true \
    --set global.llmServices.enabled=true \
    --set global.agentWorkspace.sandboxNamespace=shared-agents \
    --set agent-services.warmPool.type=runc
render "$tmp/release-b.yaml" release-b magda-b \
    --set global.agentWorkspace.enabled=true \
    --set global.llmServices.enabled=true \
    --set global.agentWorkspace.sandboxNamespace=shared-agents \
    --set agent-services.warmPool.type=runc
pool_a="$(awk '/^kind: SandboxWarmPool$/{found=1} found && /^  name:/{print $2; exit}' "$tmp/release-a.yaml")"
pool_b="$(awk '/^kind: SandboxWarmPool$/{found=1} found && /^  name:/{print $2; exit}' "$tmp/release-b.yaml")"
id_a="$(sed -n 's/.*name: MAGDA_INSTALLATION_ID, value: "\([^"]*\)".*/\1/p' "$tmp/release-a.yaml" | head -1)"
id_b="$(sed -n 's/.*name: MAGDA_INSTALLATION_ID, value: "\([^"]*\)".*/\1/p' "$tmp/release-b.yaml" | head -1)"
key_a="$(sed -n 's/.*name: MANAGED_API_KEY_NAME, value: "\([^"]*\)".*/\1/p' "$tmp/release-a.yaml" | head -1)"
key_b="$(sed -n 's/.*name: MANAGED_API_KEY_NAME, value: "\([^"]*\)".*/\1/p' "$tmp/release-b.yaml" | head -1)"
sandbox_sa_a="magda-agent-sandbox-$id_a"
sandbox_sa_b="magda-agent-sandbox-$id_b"
[[ -n "$pool_a" && -n "$pool_b" && "$pool_a" != "$pool_b" ]]
[[ -n "$id_a" && -n "$id_b" && "$id_a" != "$id_b" ]]
[[ "$key_a" == "magda-agent-workspace-$id_a" ]]
[[ "$key_b" == "magda-agent-workspace-$id_b" ]]
[[ "$key_a" != "$key_b" ]]
grep -q "name: magda-agent-manager-$id_a" "$tmp/release-a.yaml"
grep -q "name: magda-agent-manager-$id_b" "$tmp/release-b.yaml"
grep -q "name: magda-agent-preflight-$id_a" "$tmp/release-a.yaml"
grep -q "name: magda-agent-preflight-$id_b" "$tmp/release-b.yaml"
grep -q "agent.magda.io/installation-id: \"$id_a\"" "$tmp/release-a.yaml"
grep -q "agent.magda.io/installation-id: \"$id_b\"" "$tmp/release-b.yaml"
grep -q 'namespace: shared-agents' "$tmp/release-a.yaml"
grep -q 'namespace: shared-agents' "$tmp/release-b.yaml"

# Sandbox identities live in the shared Sandbox namespace but remain unique to
# each Magda installation. They are explicitly selected by the Pod template,
# do not mount a Kubernetes token, and receive no RoleBinding or GKE IAM
# annotation from this chart.
[[ "$sandbox_sa_a" != "$sandbox_sa_b" ]]
sa_doc_a="$(resource_document ServiceAccount "$sandbox_sa_a" "$tmp/release-a.yaml")"
sa_doc_b="$(resource_document ServiceAccount "$sandbox_sa_b" "$tmp/release-b.yaml")"
[[ -n "$sa_doc_a" && -n "$sa_doc_b" ]]
grep -q '^  namespace: shared-agents$' <<<"$sa_doc_a"
grep -q '^  namespace: shared-agents$' <<<"$sa_doc_b"
grep -q '^automountServiceAccountToken: false$' <<<"$sa_doc_a"
grep -q '^automountServiceAccountToken: false$' <<<"$sa_doc_b"
! grep -q 'iam.gke.io/gcp-service-account' <<<"$sa_doc_a"
! grep -q 'iam.gke.io/gcp-service-account' <<<"$sa_doc_b"
grep -q "^      serviceAccountName: $sandbox_sa_a$" "$tmp/release-a.yaml"
grep -q "^      serviceAccountName: $sandbox_sa_b$" "$tmp/release-b.yaml"
! resources_of_kind RoleBinding "$tmp/release-a.yaml" | grep -q "name: $sandbox_sa_a"
! resources_of_kind RoleBinding "$tmp/release-b.yaml" | grep -q "name: $sandbox_sa_b"
! resources_of_kind ClusterRoleBinding "$tmp/release-a.yaml" | grep -q "name: $sandbox_sa_a"
! resources_of_kind ClusterRoleBinding "$tmp/release-b.yaml" | grep -q "name: $sandbox_sa_b"

long_namespace="this-is-a-valid-but-deliberately-long-release-namespace-for-magda"
render "$tmp/long-namespace.yaml" magda "$long_namespace" \
    --set global.agentWorkspace.enabled=true \
    --set global.llmServices.enabled=true \
    --set agent-services.warmPool.type=runc
derived_namespace="$(awk '/^kind: SandboxTemplate$/{found=1} found && /^  namespace:/{print $2; exit}' "$tmp/long-namespace.yaml")"
[[ ${#derived_namespace} -le 63 ]]
[[ "$derived_namespace" =~ -[0-9a-f]{8}$ ]]

printf 'Agent Services render matrix passed\n'
