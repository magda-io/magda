#!/usr/bin/env bash
set -euo pipefail

chart="$(cd "$(dirname "$0")/.." && pwd)"
helm_root="$(dirname "$chart")"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# `! cmd` does not trigger `set -e`, so negative assertions use this helper.
refuted() {
    echo "Assertion failed: unexpected match at $0 line $1" >&2
    exit 1
}

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
if grep -q 'Source: magda-core/charts/llm-services/' "$tmp/disabled.yaml"; then refuted $LINENO; fi
if grep -q 'Source: magda-core/charts/agent-services/' "$tmp/disabled.yaml"; then refuted $LINENO; fi

render "$tmp/llm-only.yaml" magda test \
    --set global.llmServices.enabled=true

grep -q 'Source: magda-core/charts/llm-services/templates/deployment.yaml' "$tmp/llm-only.yaml"
grep -q 'Source: magda-core/charts/llm-services/charts/litellm/templates/deployment.yaml' "$tmp/llm-only.yaml"
if grep -q 'Source: magda-core/charts/agent-services/' "$tmp/llm-only.yaml"; then refuted $LINENO; fi
grep -q '\\"llm\\"' "$tmp/llm-only.yaml"
if grep -q '\\"agent\\"' "$tmp/llm-only.yaml"; then refuted $LINENO; fi

# One global model definition drives Agent Manager, LLM Services, and nested
# LiteLLM. The public alias stays stable when only the provider model changes.
render "$tmp/model-default.yaml" magda test \
    --set global.agentWorkspace.enabled=true \
    --set global.llmServices.enabled=true
for expected in \
    'name: MAGDA_LLM_MODEL, value: "magda-agent-default"' \
    'name: ALLOWED_MODELS, value: "[\"magda-agent-default\"]"' \
    'model_name: "magda-agent-default"' \
    'model: "openai/gpt-5.6-sol"' \
    'name: MAGDA_LLM_CONTEXT_WINDOW, value: "1050000"' \
    'name: MAGDA_LLM_MAX_TOKENS, value: "128000"' \
    'name: MAGDA_LLM_REASONING_EFFORT, value: "medium"' \
    'reasoning_effort: "medium"' \
    'api_key: "os.environ/LITELLM_PROVIDER_API_KEY"' \
    'name: LITELLM_PROVIDER_API_KEY'; do
    grep -Fq "$expected" "$tmp/model-default.yaml"
done
if resource_document Deployment litellm "$tmp/model-default.yaml" | grep -q 'optional: true'; then refuted $LINENO; fi
for expected in \
    'name: REGISTRY_API_URL, value: "http://registry-api/v0"' \
    'name: STORAGE_API_URL, value: "http://storage-api/v0"' \
    'name: DEFAULT_STORAGE_BUCKET, value: "magda-datasets"' \
    'name: TENANT_ID, value: "0"' \
    'name: SKILL_ARCHIVE_MAX_COMPRESSED_BYTES, value: "8388608"' \
    'name: SKILL_ARCHIVE_MAX_UNCOMPRESSED_BYTES, value: "33554432"' \
    'name: SKILL_ARCHIVE_MAX_ENTRIES, value: "256"' \
    'name: SKILL_ARCHIVE_MAX_PATH_LENGTH, value: "240"' \
    'name: SKILL_ARCHIVE_MAX_NESTING_DEPTH, value: "8"' \
    'name: SKILL_ARCHIVE_MAX_MARKDOWN_BYTES, value: "1048576"'; do
    grep -Fq "$expected" "$tmp/model-default.yaml"
done
if resource_document Deployment agent-manager "$tmp/model-default.yaml" | grep -q 'MINIO_'; then refuted $LINENO; fi
if grep -R -q 'apiKeyEnv' "$helm_root/internal-charts/litellm"; then refuted $LINENO; fi

render "$tmp/provider-model.yaml" magda test \
    --set global.llmServices.enabled=true \
    --set global.defaultAgentModel.providerModel=openai/another-model
grep -q 'model_name: "magda-agent-default"' "$tmp/provider-model.yaml"
grep -q 'model: "openai/another-model"' "$tmp/provider-model.yaml"
grep -Fq 'name: ALLOWED_MODELS, value: "[\"magda-agent-default\"]"' "$tmp/provider-model.yaml"

render "$tmp/reasoning.yaml" magda test \
    --set global.agentWorkspace.enabled=true \
    --set global.llmServices.enabled=true \
    --set global.defaultAgentModel.reasoningEffort=high
grep -q 'reasoning_effort: "high"' "$tmp/reasoning.yaml"
grep -q 'name: MAGDA_LLM_REASONING_EFFORT, value: "high"' "$tmp/reasoning.yaml"

render "$tmp/no-reasoning.yaml" magda test \
    --set global.agentWorkspace.enabled=true \
    --set global.llmServices.enabled=true \
    --set-string global.defaultAgentModel.reasoningEffort=
if grep -q 'MAGDA_LLM_REASONING_EFFORT' "$tmp/no-reasoning.yaml"; then refuted $LINENO; fi
if grep -q 'reasoning_effort:' "$tmp/no-reasoning.yaml"; then refuted $LINENO; fi

render "$tmp/capabilities.yaml" magda test \
    --set global.agentWorkspace.enabled=true \
    --set global.llmServices.enabled=true \
    --set global.defaultAgentModel.contextWindow=200000 \
    --set global.defaultAgentModel.maxTokens=50000
grep -q 'name: MAGDA_LLM_CONTEXT_WINDOW, value: "200000"' "$tmp/capabilities.yaml"
grep -q 'name: MAGDA_LLM_MAX_TOKENS, value: "50000"' "$tmp/capabilities.yaml"

render "$tmp/chart-overrides.yaml" magda test \
    --set global.agentWorkspace.enabled=true \
    --set global.llmServices.enabled=true \
    --set agent-services.llm.model=private-alias \
    --set agent-services.llm.contextWindow=300000 \
    --set agent-services.llm.maxTokens=60000 \
    --set 'llm-services.allowedModels[0]=private-alias' \
    --set llm-services.litellm.model.alias=private-alias \
    --set llm-services.litellm.model.providerModel=openai/private-model
grep -q 'name: MAGDA_LLM_MODEL, value: "private-alias"' "$tmp/chart-overrides.yaml"
grep -Fq 'name: ALLOWED_MODELS, value: "[\"private-alias\"]"' "$tmp/chart-overrides.yaml"
grep -q 'model_name: "private-alias"' "$tmp/chart-overrides.yaml"
grep -q 'model: "openai/private-model"' "$tmp/chart-overrides.yaml"
grep -q 'name: MAGDA_LLM_CONTEXT_WINDOW, value: "300000"' "$tmp/chart-overrides.yaml"
grep -q 'name: MAGDA_LLM_MAX_TOKENS, value: "60000"' "$tmp/chart-overrides.yaml"

# Prove global propagation through the released top-level magda chart.
helm template magda "$helm_root/magda" --namespace test \
    --set global.agentWorkspace.enabled=true \
    --set global.llmServices.enabled=true \
    --set global.defaultAgentModel.providerModel=openai/top-level-model \
    --set magda-core.agent-services.llm.model=top-level-alias \
    --set 'magda-core.llm-services.allowedModels[0]=top-level-alias' \
    --set magda-core.llm-services.litellm.model.alias=top-level-alias \
    >"$tmp/top-level.yaml"
grep -q 'name: MAGDA_LLM_MODEL, value: "top-level-alias"' "$tmp/top-level.yaml"
grep -Fq 'name: ALLOWED_MODELS, value: "[\"top-level-alias\"]"' "$tmp/top-level.yaml"
grep -q 'model_name: "top-level-alias"' "$tmp/top-level.yaml"
grep -q 'model: "openai/top-level-model"' "$tmp/top-level.yaml"
grep -q 'name: MAGDA_LLM_REASONING_EFFORT, value: "medium"' "$tmp/top-level.yaml"
grep -q 'reasoning_effort: "medium"' "$tmp/top-level.yaml"

helm template magda "$helm_root/magda" --namespace test \
    --set global.agentWorkspace.enabled=true \
    --set global.llmServices.enabled=true \
    --set-string global.defaultAgentModel.reasoningEffort= \
    >"$tmp/top-level-no-reasoning.yaml"
if grep -q 'MAGDA_LLM_REASONING_EFFORT' "$tmp/top-level-no-reasoning.yaml"; then refuted $LINENO; fi
if grep -q 'reasoning_effort:' "$tmp/top-level-no-reasoning.yaml"; then refuted $LINENO; fi

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
    awk '
        /^---$/ {
            if (service_account && sandbox_name && token_disabled) found = 1
            service_account = sandbox_name = token_disabled = 0
        }
        /^kind: ServiceAccount$/ { service_account = 1 }
        /^  name: magda-agent-sandbox-/ { sandbox_name = 1 }
        /^automountServiceAccountToken: false$/ { token_disabled = 1 }
        END {
            if (service_account && sandbox_name && token_disabled) found = 1
            exit !found
        }
    ' "$tmp/$runtime.yaml"
    grep -Eq '^      serviceAccountName: magda-agent-sandbox-[0-9a-f]{12}$' "$tmp/$runtime.yaml"
    awk '
        /^---$/ {
            if (sandbox_template && sandbox_identity && token_disabled) found = 1
            sandbox_template = sandbox_identity = token_disabled = 0
        }
        /^kind: SandboxTemplate$/ { sandbox_template = 1 }
        /^      serviceAccountName: magda-agent-sandbox-/ { sandbox_identity = 1 }
        /^      automountServiceAccountToken: false$/ { token_disabled = 1 }
        END {
            if (sandbox_template && sandbox_identity && token_disabled) found = 1
            exit !found
        }
    ' "$tmp/$runtime.yaml"
    grep -q 'fsGroupChangePolicy: OnRootMismatch' "$tmp/$runtime.yaml"
    grep -q 'Kubernetes Agent Sandbox v1beta1 extension APIs are unavailable' "$tmp/$runtime.yaml"
    grep -q '^    type: Recreate$' "$tmp/$runtime.yaml"
    if [[ "$runtime" == runc ]]; then
        if grep -q 'runtimeClassName:' "$tmp/$runtime.yaml"; then refuted $LINENO; fi
    else
        grep -q "runtimeClassName: \"$runtime\"" "$tmp/$runtime.yaml"
    fi
done

# The Sandbox uses the same internal/model gateway override as Agent Manager.
# This allows browser-facing DSH_PUBLIC_URL to retain a host-mapped local port
# while in-cluster model traffic targets the ingress Service on standard TLS.
render "$tmp/llm-api-override.yaml" magda test \
    --set global.agentWorkspace.enabled=true \
    --set global.llmServices.enabled=true \
    --set global.externalUrl=https://magda.test:18443 \
    --set agent-services.llmApiUrl=https://magda.test/api/v0/llm/v1
[[ "$(grep -Fc 'value: "https://magda.test/api/v0/llm/v1"' "$tmp/llm-api-override.yaml")" -eq 2 ]]
grep -q 'value: "https://magda.test:18443/api/v0/agent/runtime/"' "$tmp/llm-api-override.yaml"

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
expect_failure 'agent-services.skillArchive.maxCompressedBytes must be a positive integer' \
    helm template magda "$chart" --namespace test \
        --set global.agentWorkspace.enabled=true \
        --set global.llmServices.enabled=true \
        --set agent-services.skillArchive.maxCompressedBytes=0
expect_failure 'agent-services.skillArchive.maxMarkdownBytes must not exceed maxUncompressedBytes' \
    helm template magda "$chart" --namespace test \
        --set global.agentWorkspace.enabled=true \
        --set global.llmServices.enabled=true \
        --set agent-services.skillArchive.maxMarkdownBytes=40000000
expect_failure 'agent-services.tenantId must be a non-negative integer' \
    helm template magda "$chart" --namespace test \
        --set global.agentWorkspace.enabled=true \
        --set global.llmServices.enabled=true \
        --set agent-services.tenantId=true
expect_failure 'agent-services.tenantId must be a non-negative integer' \
    helm template magda "$chart" --namespace test \
        --set global.agentWorkspace.enabled=true \
        --set global.llmServices.enabled=true \
        --set-string agent-services.tenantId=zero

render "$tmp/external.yaml" magda test \
    --set global.llmServices.enabled=true \
    --set llm-services.litellm.enabled=false \
    --set llm-services.backend.url=https://litellm.example/v1 \
    --set llm-services.backend.masterKeySecret.name=external-litellm \
    --set llm-services.backend.masterKeySecret.key=api-key
if grep -q 'charts/litellm/templates/' "$tmp/external.yaml"; then refuted $LINENO; fi
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
if grep -q 'Source: magda-core/charts/agent-services/templates/control-secret.yaml' "$tmp/operator-secrets.yaml"; then refuted $LINENO; fi
if grep -q 'Source: magda-core/charts/llm-services/charts/litellm/templates/secret.yaml' "$tmp/operator-secrets.yaml"; then refuted $LINENO; fi
grep -q 'name: operator-control' "$tmp/operator-secrets.yaml"
grep -q 'name: operator-litellm' "$tmp/operator-secrets.yaml"

# Global defaults are owned by magda-core only; the child chart declares an
# empty map and fails clearly when its parent omits a required global value.
grep -qx 'global: {}' "$helm_root/internal-charts/agent-services/values.yaml"
expect_failure 'agent-services: global.externalUrl is required' \
    helm template magda "$chart" --namespace test \
        --set global.agentWorkspace.enabled=true \
        --set global.llmServices.enabled=true \
        --set-string global.externalUrl=
expect_failure 'global.defaultAdminUserId is required' \
    helm template magda "$chart" --namespace test \
        --set global.agentWorkspace.enabled=true \
        --set global.llmServices.enabled=true \
        --set-string global.defaultAdminUserId=
expect_failure 'global.defaultDatasetBucket must be non-empty' \
    helm template magda "$chart" --namespace test \
        --set global.agentWorkspace.enabled=true \
        --set global.llmServices.enabled=true \
        --set-string global.defaultDatasetBucket=

expect_failure 'llm.model or global.defaultAgentModel.alias is required' \
    helm template agent "$helm_root/internal-charts/agent-services"
expect_failure 'global.defaultAgentModel.alias must be a non-empty string when allowedModels is empty' \
    helm template llm "$helm_root/internal-charts/llm-services" \
        --set litellm.enabled=false \
        --set backend.url=https://llm.example/v1 \
        --set backend.masterKeySecret.name=external-key \
        --set backend.masterKeySecret.key=key
expect_failure 'model.alias or global.defaultAgentModel.alias is required' \
    helm template litellm "$helm_root/internal-charts/litellm"

expect_failure 'litellm.enabled=false requires backend.url' \
    helm template magda "$chart" --namespace test \
        --set global.llmServices.enabled=true \
        --set llm-services.litellm.enabled=false
expect_failure 'backend.* must be empty when litellm.enabled=true' \
    helm template magda "$chart" --namespace test \
        --set global.llmServices.enabled=true \
        --set llm-services.backend.url=https://unused.example
expect_failure 'must not exceed contextWindow' \
    helm template magda "$chart" --namespace test \
        --set global.agentWorkspace.enabled=true \
        --set global.llmServices.enabled=true \
        --set global.defaultAgentModel.contextWindow=100 \
        --set global.defaultAgentModel.maxTokens=101
for invalid_reasoning_type in '1' 'true' '[]' '{}'; do
    expect_failure 'reasoningEffort must be one of empty string, off, low, medium, high, xhigh, or max' \
        helm template magda "$chart" --namespace test \
            --set global.llmServices.enabled=true \
            --set-json "global.defaultAgentModel.reasoningEffort=$invalid_reasoning_type"
done
expect_failure 'reasoningEffort must be one of empty string, off, low, medium, high, xhigh, or max' \
    helm template magda "$chart" --namespace test \
        --set global.llmServices.enabled=true \
        --set-string global.defaultAgentModel.reasoningEffort=turbo
expect_failure 'reasoningEffort must be one of empty string, off, low, medium, high, xhigh, or max' \
    helm template magda "$chart" --namespace test \
        --set global.llmServices.enabled=true \
        --set-string 'global.defaultAgentModel.reasoningEffort=   '
expect_failure 'providerSecret.name and providerSecret.key must either both be set or both be empty' \
    helm template magda "$chart" --namespace test \
        --set global.llmServices.enabled=true \
        --set llm-services.litellm.providerSecret.name=only-name \
        --set llm-services.litellm.providerSecret.key=
expect_failure 'must be included in llm-services.allowedModels' \
    helm template magda "$chart" --namespace test \
        --set global.agentWorkspace.enabled=true \
        --set global.llmServices.enabled=true \
        --set agent-services.llm.model=missing-agent
expect_failure 'must exactly match llm-services.allowedModels[0]' \
    helm template magda "$chart" --namespace test \
        --set global.llmServices.enabled=true \
        --set llm-services.litellm.model.alias=missing-router
expect_failure 'must contain exactly one model when bundled LiteLLM is enabled' \
    helm template magda "$chart" --namespace test \
        --set global.llmServices.enabled=true \
        --set-json 'llm-services.allowedModels=["magda-agent-default","another-model"]'
expect_failure 'must exactly match llm-services.allowedModels[0]' \
    helm template magda "$chart" --namespace test \
        --set global.agentWorkspace.enabled=true \
        --set global.llmServices.enabled=true \
        --set agent-services.llm.model=agent-alias \
        --set 'llm-services.allowedModels[0]=agent-alias' \
        --set llm-services.litellm.model.alias=router-alias
expect_failure 'allowedModels must be an array of non-empty strings' \
    helm template magda "$chart" --namespace test \
        --set global.llmServices.enabled=true \
        --set-string llm-services.allowedModels=not-an-array
expect_failure 'global.defaultAgentModel.alias must not have leading or trailing whitespace' \
    helm template magda "$chart" --namespace test \
        --set global.llmServices.enabled=true \
        --set-string 'global.defaultAgentModel.alias= padded-alias '
expect_failure 'allowedModels[0] must be a non-empty string' \
    helm template magda "$chart" --namespace test \
        --set global.llmServices.enabled=true \
        --set-json 'llm-services.allowedModels=[""]'
expect_failure 'allowedModels[0] must be a non-empty string' \
    helm template magda "$chart" --namespace test \
        --set global.llmServices.enabled=true \
        --set-json 'llm-services.allowedModels=["   "]'
expect_failure 'allowedModels[1] must be a non-empty string' \
    helm template magda "$chart" --namespace test \
        --set global.llmServices.enabled=true \
        --set-json 'llm-services.allowedModels=["model",true]'
expect_failure 'contains duplicate model ID "model"' \
    helm template magda "$chart" --namespace test \
        --set global.llmServices.enabled=true \
        --set-json 'llm-services.allowedModels=["model"," model "]'

render "$tmp/external-multi-model.yaml" magda test \
    --set global.agentWorkspace.enabled=true \
    --set global.llmServices.enabled=true \
    --set agent-services.llm.model=external-agent \
    --set-json 'llm-services.allowedModels=["external-agent","other-model"]' \
    --set llm-services.litellm.enabled=false \
    --set llm-services.backend.url=https://llm.example/v1 \
    --set llm-services.backend.masterKeySecret.name=external-key \
    --set llm-services.backend.masterKeySecret.key=key
if grep -q 'Source: magda-core/charts/llm-services/charts/litellm/' "$tmp/external-multi-model.yaml"; then refuted $LINENO; fi
grep -q 'name: MAGDA_LLM_MODEL, value: "external-agent"' "$tmp/external-multi-model.yaml"
grep -Fq 'name: ALLOWED_MODELS, value: "[\"external-agent\",\"other-model\"]"' "$tmp/external-multi-model.yaml"

render "$tmp/credentialless.yaml" magda test \
    --set global.llmServices.enabled=true \
    --set llm-services.litellm.providerSecret.name= \
    --set llm-services.litellm.providerSecret.key=
if grep -q 'LITELLM_PROVIDER_API_KEY' "$tmp/credentialless.yaml"; then refuted $LINENO; fi
if grep -q 'api_key:' "$tmp/credentialless.yaml"; then refuted $LINENO; fi

checksum_default="$(resource_document Deployment litellm "$tmp/model-default.yaml" | sed -n 's/.*checksum\/config: *"*\([0-9a-f]*\)"*.*/\1/p')"
checksum_reasoning="$(resource_document Deployment litellm "$tmp/reasoning.yaml" | sed -n 's/.*checksum\/config: *"*\([0-9a-f]*\)"*.*/\1/p')"
[[ -n "$checksum_default" && -n "$checksum_reasoning" && "$checksum_default" != "$checksum_reasoning" ]]

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
if grep -q 'iam.gke.io/gcp-service-account' <<<"$sa_doc_a"; then refuted $LINENO; fi
if grep -q 'iam.gke.io/gcp-service-account' <<<"$sa_doc_b"; then refuted $LINENO; fi
grep -q "^      serviceAccountName: $sandbox_sa_a$" "$tmp/release-a.yaml"
grep -q "^      serviceAccountName: $sandbox_sa_b$" "$tmp/release-b.yaml"
if resources_of_kind RoleBinding "$tmp/release-a.yaml" | grep -q "name: $sandbox_sa_a"; then refuted $LINENO; fi
if resources_of_kind RoleBinding "$tmp/release-b.yaml" | grep -q "name: $sandbox_sa_b"; then refuted $LINENO; fi
if resources_of_kind ClusterRoleBinding "$tmp/release-a.yaml" | grep -q "name: $sandbox_sa_a"; then refuted $LINENO; fi
if resources_of_kind ClusterRoleBinding "$tmp/release-b.yaml" | grep -q "name: $sandbox_sa_b"; then refuted $LINENO; fi

long_namespace="this-is-a-valid-but-deliberately-long-release-namespace-for-magda"
render "$tmp/long-namespace.yaml" magda "$long_namespace" \
    --set global.agentWorkspace.enabled=true \
    --set global.llmServices.enabled=true \
    --set agent-services.warmPool.type=runc
derived_namespace="$(awk '/^kind: SandboxTemplate$/{found=1} found && /^  namespace:/{print $2; exit}' "$tmp/long-namespace.yaml")"
[[ ${#derived_namespace} -le 63 ]]
[[ "$derived_namespace" =~ -[0-9a-f]{8}$ ]]

# #3846: the scoped DSH CSP in the rendered gateway-config ConfigMap must equal
# the fixture that magda-gateway/src/test/agentWorkspaceCsp.spec.ts runs
# through the real Gateway path matching. Regenerate the fixture from this
# render when the chart policy changes intentionally.
gateway_config_json() {
    node -e '
        const text = require("fs").readFileSync(process.argv[1], "utf8");
        const doc = text.split(/^---$/m).find((d) =>
            /^kind: ConfigMap$/m.test(d) && /^  name: "?gateway-config"?$/m.test(d));
        const data = {};
        for (const key of ["routes", "helmet", "helmetPerPath", "csp"]) {
            const m = doc.match(new RegExp(`^  ${key}\\.json: (".*")$`, "m"));
            data[key] = JSON.parse(JSON.parse(m[1]));
        }
        process.stdout.write(JSON.stringify(data));
    ' "$1"
}
gateway_fixture="$helm_root/../../magda-gateway/src/test/fixtures/agentWorkspaceGatewayConfig.json"
gateway_config_json "$tmp/model-default.yaml" >"$tmp/gateway-enabled.json"
node -e '
    const assert = require("assert");
    const fs = require("fs");
    const rendered = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const fixture = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
    assert.deepStrictEqual(
        {
            agentRoute: rendered.routes.agent,
            helmet: rendered.helmet,
            csp: rendered.csp,
            helmetPerPath: rendered.helmetPerPath
        },
        fixture,
        "rendered gateway-config differs from the Gateway CSP test fixture"
    );
' "$tmp/gateway-enabled.json" "$gateway_fixture"
for file in disabled llm-only; do
    gateway_config_json "$tmp/$file.yaml" >"$tmp/gateway-$file.json"
    node -e '
        const assert = require("assert");
        const config = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
        assert.strictEqual(config.routes.agent, undefined);
        assert.strictEqual(config.helmetPerPath["/api/v0/agent/runtime"], undefined);
        assert.ok(!Object.keys(config.helmetPerPath).some((path) => path.startsWith("/api/")));
    ' "$tmp/gateway-$file.json"
done
# The helmet mount and the Agent route share the same prefix, so Gateway path
# matching cannot relax a sibling of the proxied runtime mount.
node -e '
    const assert = require("assert");
    const config = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    assert.strictEqual(config.routes.agent.to, "http://agent-manager/v0");
    const relaxed = Object.keys(config.helmetPerPath).filter((path) =>
        path.startsWith("/api/") &&
        (config.helmetPerPath[path].contentSecurityPolicy.directives.scriptSrc || [])
            .includes("\x27unsafe-inline\x27"));
    assert.deepStrictEqual(relaxed, ["/api/v0/agent/runtime"]);
    assert.deepStrictEqual(config.helmet.contentSecurityPolicy.directives.scriptSrc, ["\x27self\x27"]);
' "$tmp/gateway-enabled.json"

# #3847: ingress-nginx WebSocket timeouts.
ingress_annotations() {
    resource_document Ingress ingress "$1" | sed -n '/^  annotations:$/,/^  [a-z]/p'
}
render "$tmp/ingress-disabled.yaml" magda test --set tags.ingress=true
render "$tmp/ingress-llm-only.yaml" magda test --set tags.ingress=true \
    --set global.llmServices.enabled=true
render "$tmp/ingress-enabled.yaml" magda test --set tags.ingress=true \
    --set global.agentWorkspace.enabled=true \
    --set global.llmServices.enabled=true
render "$tmp/ingress-override.yaml" magda test --set tags.ingress=true \
    --set global.agentWorkspace.enabled=true \
    --set global.llmServices.enabled=true \
    --set ingress.proxyReadTimeout=7200 \
    --set ingress.proxySendTimeout=1800
render "$tmp/ingress-disabled-explicit.yaml" magda test --set tags.ingress=true \
    --set ingress.proxyReadTimeout=120
for file in ingress-disabled ingress-llm-only; do
    [[ "$(count_kind Ingress "$tmp/$file.yaml")" == 1 ]]
    if ingress_annotations "$tmp/$file.yaml" | grep -q 'proxy-read-timeout'; then refuted $LINENO; fi
    if ingress_annotations "$tmp/$file.yaml" | grep -q 'proxy-send-timeout'; then refuted $LINENO; fi
done
ingress_annotations "$tmp/ingress-enabled.yaml" | grep -qx '    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"'
ingress_annotations "$tmp/ingress-enabled.yaml" | grep -qx '    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"'
ingress_annotations "$tmp/ingress-override.yaml" | grep -qx '    nginx.ingress.kubernetes.io/proxy-read-timeout: "7200"'
ingress_annotations "$tmp/ingress-override.yaml" | grep -qx '    nginx.ingress.kubernetes.io/proxy-send-timeout: "1800"'
ingress_annotations "$tmp/ingress-disabled-explicit.yaml" | grep -qx '    nginx.ingress.kubernetes.io/proxy-read-timeout: "120"'
if ingress_annotations "$tmp/ingress-disabled-explicit.yaml" | grep -q 'proxy-send-timeout'; then refuted $LINENO; fi
# Other annotations are unchanged by the Workspace flag.
diff <(ingress_annotations "$tmp/ingress-disabled.yaml") \
    <(ingress_annotations "$tmp/ingress-enabled.yaml" | grep -v 'proxy-read-timeout\|proxy-send-timeout')

printf 'Agent Services render matrix passed\n'
