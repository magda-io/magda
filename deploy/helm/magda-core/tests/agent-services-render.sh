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

# The Workspace model config JSON (MAGDA_LLM_MODEL_CONFIG) in a render. The
# Agent Manager and the SandboxTemplate must carry the same value. Node, not
# jq: the CI builder image has no jq.
model_config_of() {
    sed -n 's/.*name: MAGDA_LLM_MODEL_CONFIG, value: \(".*"\)}$/\1/p' |
        node -e 'const t = require("fs").readFileSync(0, "utf8").trim(); if (t) process.stdout.write(JSON.parse(t))'
}
model_config() {
    local file="$1" manager runtime
    manager="$(resource_document Deployment agent-manager "$file" | model_config_of)"
    runtime="$(resources_of_kind SandboxTemplate "$file" | model_config_of)"
    if [[ -z "$manager" || "$manager" != "$runtime" ]]; then
        echo "Model config differs: manager=$manager runtime=$runtime" >&2
        exit 1
    fi
    printf '%s' "$manager"
}

# Assert a JavaScript expression on a render's model config, `m`; `eq(a, b)`
# compares deeply.
expect_model() {
    local file="$1" expression="$2"
    if ! model_config "$file" | EXPRESSION="$expression" node -e '
        const { isDeepStrictEqual: eq } = require("util");
        const m = JSON.parse(require("fs").readFileSync(0, "utf8"));
        process.exit(new Function("m", "eq", `return (${process.env.EXPRESSION})`)(m, eq) ? 0 : 1);
    '; then
        echo "Model config $(model_config "$file") fails: $expression" >&2
        exit 1
    fi
}

# LiteLLM's reasoning_effort line, or nothing.
litellm_effort() {
    resource_document ConfigMap litellm-config "$1" | sed -n 's/^ *reasoning_effort: //p'
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

# One model entry, global.llmServices.defaultModel, drives Agent Manager, the Sandbox
# Pods (DSH), LLM Services and nested LiteLLM (#3965).
render "$tmp/model-default.yaml" magda test \
    --set global.agentWorkspace.enabled=true \
    --set global.llmServices.enabled=true
expect_model "$tmp/model-default.yaml" 'eq(m, {
    alias: "magda-agent-default",
    displayName: "Magda Agent Default",
    contextWindow: 1050000,
    maxTokens: 128000,
    imageInput: false,
    reasoningEfforts: {low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max"},
    reasoningEffort: "medium",
    auxiliaryReasoningEffort: "medium"
})'
for expected in \
    'name: ALLOWED_MODELS, value: "[\"magda-agent-default\"]"' \
    'model_name: "magda-agent-default"' \
    'model: "openai/gpt-6.1-sol"' \
    'api_key: "os.environ/LITELLM_PROVIDER_API_KEY"' \
    'name: LITELLM_PROVIDER_API_KEY'; do
    grep -Fq "$expected" "$tmp/model-default.yaml"
done
[[ "$(litellm_effort "$tmp/model-default.yaml")" == '"medium"' ]]
# The model reaches the Workspace only as MAGDA_LLM_MODEL_CONFIG, and the
# provider model stays out of it.
if grep -Eq 'MAGDA_LLM_(MODEL|CONTEXT_WINDOW|MAX_TOKENS|IMAGE_INPUT|REASONING_EFFORT),' "$tmp/model-default.yaml"; then refuted $LINENO; fi
if model_config "$tmp/model-default.yaml" | grep -q 'gpt-6.1-sol'; then refuted $LINENO; fi
# A template change replaces unclaimed warm Sandboxes at once.
resources_of_kind SandboxWarmPool "$tmp/model-default.yaml" | grep -A1 'updateStrategy:' | grep -q 'type: Recreate'
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
    'name: SKILL_ARCHIVE_MAX_MARKDOWN_BYTES, value: "1048576"' \
    'name: RUNTIME_MAX_BODY_BYTES, value: "16777216"' \
    'name: RUNTIME_MAX_UPLOAD_BYTES, value: "1073741824"'; do
    grep -Fq "$expected" "$tmp/model-default.yaml"
done
if resource_document Deployment agent-manager "$tmp/model-default.yaml" | grep -q 'MINIO_'; then refuted $LINENO; fi
if grep -R -q 'apiKeyEnv' "$helm_root/internal-charts/litellm"; then refuted $LINENO; fi

render "$tmp/provider-model.yaml" magda test \
    --set global.llmServices.enabled=true \
    --set global.llmServices.defaultModel.providerModel=openai/another-model
grep -q 'model_name: "magda-agent-default"' "$tmp/provider-model.yaml"
grep -q 'model: "openai/another-model"' "$tmp/provider-model.yaml"
grep -Fq 'name: ALLOWED_MODELS, value: "[\"magda-agent-default\"]"' "$tmp/provider-model.yaml"

# Each kind of model in the deployment guide's behaviour table.
model_args=(--set global.agentWorkspace.enabled=true --set global.llmServices.enabled=true)
# Cheaper, faster titles and compaction.
render "$tmp/aux-low.yaml" magda test "${model_args[@]}" \
    --set global.llmServices.defaultModel.auxiliaryReasoningEffort=low
expect_model "$tmp/aux-low.yaml" 'm.reasoningEffort === "medium" && m.auxiliaryReasoningEffort === "low"'
[[ "$(litellm_effort "$tmp/aux-low.yaml")" == '"medium"' ]]
# A model that can turn reasoning off, with off chosen to save cost.
render "$tmp/reasoning-off.yaml" magda test "${model_args[@]}" \
    --set-json 'global.llmServices.defaultModel.reasoningEfforts={"off":"none","low":"low","medium":"medium","high":"high","xhigh":"xhigh","max":"max"}' \
    --set global.llmServices.defaultModel.reasoningEffort=off
expect_model "$tmp/reasoning-off.yaml" 'm.reasoningEfforts.off === "none" && m.reasoningEffort === "off" && m.auxiliaryReasoningEffort === "off"'
[[ "$(litellm_effort "$tmp/reasoning-off.yaml")" == '"none"' ]]
# ...or with off for titles and compaction only.
render "$tmp/aux-off.yaml" magda test "${model_args[@]}" \
    --set-json 'global.llmServices.defaultModel.reasoningEfforts={"off":"none","low":"low","high":"high"}' \
    --set global.llmServices.defaultModel.reasoningEffort=high \
    --set global.llmServices.defaultModel.auxiliaryReasoningEffort=off
expect_model "$tmp/aux-off.yaml" 'eq(m.reasoningEfforts, {off: "none", low: "low", high: "high"}) && m.reasoningEffort === "high" && m.auxiliaryReasoningEffort === "off"'
[[ "$(litellm_effort "$tmp/aux-off.yaml")" == '"high"' ]]
# LiteLLM gets the value sent to the API, not the level name.
render "$tmp/mapped.yaml" magda test "${model_args[@]}" \
    --set-json 'global.llmServices.defaultModel.reasoningEfforts={"low":"minimal","high":"high"}' \
    --set global.llmServices.defaultModel.reasoningEffort=low
expect_model "$tmp/mapped.yaml" 'm.reasoningEffort === "low" && m.auxiliaryReasoningEffort === "low"'
[[ "$(litellm_effort "$tmp/mapped.yaml")" == '"minimal"' ]]
# Efforts left to the provider.
render "$tmp/no-reasoning.yaml" magda test "${model_args[@]}" \
    --set-string global.llmServices.defaultModel.reasoningEffort=
expect_model "$tmp/no-reasoning.yaml" 'm.reasoningEffort === "" && m.auxiliaryReasoningEffort === ""'
[[ -z "$(litellm_effort "$tmp/no-reasoning.yaml")" ]]
# A model that doesn't reason.
render "$tmp/non-reasoning.yaml" magda test "${model_args[@]}" \
    --set global.llmServices.defaultModel.reasoningEfforts=false \
    --set-string global.llmServices.defaultModel.reasoningEffort=
expect_model "$tmp/non-reasoning.yaml" 'm.reasoningEfforts === false && m.reasoningEffort === "" && m.auxiliaryReasoningEffort === ""'
[[ -z "$(litellm_effort "$tmp/non-reasoning.yaml")" ]]

render "$tmp/capabilities.yaml" magda test "${model_args[@]}" \
    --set global.llmServices.defaultModel.contextWindow=200000 \
    --set global.llmServices.defaultModel.maxTokens=50000 \
    --set global.llmServices.defaultModel.imageInput=true \
    --set global.llmServices.defaultModel.displayName=Vision
expect_model "$tmp/capabilities.yaml" 'm.contextWindow === 200000 && m.maxTokens === 50000 && m.imageInput === true && m.displayName === "Vision"'
render "$tmp/display-name.yaml" magda test "${model_args[@]}" \
    --set-string global.llmServices.defaultModel.displayName=
expect_model "$tmp/display-name.yaml" 'm.displayName === "magda-agent-default"'

render "$tmp/alias.yaml" magda test "${model_args[@]}" \
    --set global.llmServices.defaultModel.alias=private-alias \
    --set global.llmServices.defaultModel.providerModel=openai/private-model
expect_model "$tmp/alias.yaml" 'm.alias === "private-alias"'
grep -Fq 'name: ALLOWED_MODELS, value: "[\"private-alias\"]"' "$tmp/alias.yaml"
grep -q 'model_name: "private-alias"' "$tmp/alias.yaml"
grep -q 'model: "openai/private-model"' "$tmp/alias.yaml"

# Prove global propagation through the released top-level magda chart.
helm template magda "$helm_root/magda" --namespace test \
    --set global.agentWorkspace.enabled=true \
    --set global.llmServices.enabled=true \
    --set global.llmServices.defaultModel.alias=top-level-alias \
    --set global.llmServices.defaultModel.providerModel=openai/top-level-model \
    --set global.llmServices.defaultModel.auxiliaryReasoningEffort=low \
    >"$tmp/top-level.yaml"
expect_model "$tmp/top-level.yaml" 'm.alias === "top-level-alias" && m.reasoningEffort === "medium" && m.auxiliaryReasoningEffort === "low"'
grep -Fq 'name: ALLOWED_MODELS, value: "[\"top-level-alias\"]"' "$tmp/top-level.yaml"
grep -q 'model_name: "top-level-alias"' "$tmp/top-level.yaml"
grep -q 'model: "openai/top-level-model"' "$tmp/top-level.yaml"
[[ "$(litellm_effort "$tmp/top-level.yaml")" == '"medium"' ]]

helm template magda "$helm_root/magda" --namespace test \
    --set global.agentWorkspace.enabled=true \
    --set global.llmServices.enabled=true \
    --set-string global.llmServices.defaultModel.reasoningEffort= \
    >"$tmp/top-level-no-reasoning.yaml"
expect_model "$tmp/top-level-no-reasoning.yaml" 'm.reasoningEffort === "" && m.auxiliaryReasoningEffort === ""'
[[ -z "$(litellm_effort "$tmp/top-level-no-reasoning.yaml")" ]]

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
    sandbox_template="$(resources_of_kind SandboxTemplate "$tmp/$runtime.yaml")"
    grep -q 'fsGroupChangePolicy: OnRootMismatch' <<<"$sandbox_template"
    grep -q 'storage: 10Gi' <<<"$sandbox_template"
    for resource in \
        'cpu: 100m' 'memory: 384Mi' 'ephemeral-storage: 256Mi' \
        'cpu: "1"' 'memory: 2560Mi' 'ephemeral-storage: 1Gi'; do
        grep -q "$resource" <<<"$sandbox_template"
    done
    for resource_env in \
        'MAGDA_WORKSPACE_CPU_LIMIT|value: "1"' \
        'MAGDA_WORKSPACE_MEMORY_LIMIT|value: "2560Mi"' \
        'MAGDA_WORKSPACE_STORAGE_SIZE|value: "10Gi"'; do
        env_name="${resource_env%%|*}"
        env_value="${resource_env#*|}"
        grep -A1 "name: $env_name" <<<"$sandbox_template" | grep -q "$env_value"
    done
    grep -q 'Kubernetes Agent Sandbox v1beta1 extension APIs are unavailable' "$tmp/$runtime.yaml"
    grep -q '^    type: Recreate$' "$tmp/$runtime.yaml"
    if [[ "$runtime" == runc ]]; then
        if grep -q 'runtimeClassName:' "$tmp/$runtime.yaml"; then refuted $LINENO; fi
    else
        grep -q "runtimeClassName: \"$runtime\"" "$tmp/$runtime.yaml"
    fi
done

# Human-readable Workspace metadata must stay wired to the same Helm values as
# the Pod limits and volumeClaimTemplate request, including non-default units.
render "$tmp/custom-workspace-resources.yaml" magda test \
    --set global.agentWorkspace.enabled=true \
    --set global.llmServices.enabled=true \
    --set-string agent-services.runtime.resources.limits.cpu=750m \
    --set-string agent-services.runtime.resources.limits.memory=2Gi \
    --set-string agent-services.runtime.storage.size=12Gi
custom_sandbox="$(resources_of_kind SandboxTemplate "$tmp/custom-workspace-resources.yaml")"
grep -q 'storage: 12Gi' <<<"$custom_sandbox"
grep -q 'cpu: 750m' <<<"$custom_sandbox"
grep -q 'memory: 2Gi' <<<"$custom_sandbox"
for resource_env in \
    'MAGDA_WORKSPACE_CPU_LIMIT|value: "750m"' \
    'MAGDA_WORKSPACE_MEMORY_LIMIT|value: "2Gi"' \
    'MAGDA_WORKSPACE_STORAGE_SIZE|value: "12Gi"'; do
    env_name="${resource_env%%|*}"
    env_value="${resource_env#*|}"
    grep -A1 "name: $env_name" <<<"$custom_sandbox" | grep -q "$env_value"
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
# #3963: the default model can't turn reasoning off, so `off` is refused
# unless the model declares it.
expect_failure 'global.llmServices.defaultModel.reasoningEffort must be "" or a level declared in reasoningEfforts (low, medium, high, xhigh, max); got "off"' \
    helm template magda "$chart" --namespace test \
        --set global.agentWorkspace.enabled=true \
        --set global.llmServices.enabled=true \
        --set global.llmServices.defaultModel.reasoningEffort=off
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

# Each invalid model entry fails the render, naming the field (#3965).
expect_model_failure() {
    local expected="$1"
    shift
    expect_failure "$expected" \
        helm template magda "$chart" --namespace test \
            --set global.agentWorkspace.enabled=true \
            --set global.llmServices.enabled=true "$@"
}
expect_model_failure 'global.llmServices.defaultModel.alias must be a non-empty string' \
    --set-string global.llmServices.defaultModel.alias=
expect_model_failure 'global.llmServices.defaultModel.providerModel is required when bundled LiteLLM is enabled' \
    --set-string global.llmServices.defaultModel.providerModel=
expect_model_failure 'global.llmServices.defaultModel has an unknown field "auxReasoningEffort"' \
    --set global.llmServices.defaultModel.auxReasoningEffort=low
expect_model_failure 'global.llmServices.defaultModel.displayName must be a string; got int64' \
    --set global.llmServices.defaultModel.displayName=1
expect_model_failure 'global.llmServices.defaultModel.reasoningEfforts has an unknown level "turbo"' \
    --set global.llmServices.defaultModel.reasoningEfforts.turbo=turbo
expect_model_failure 'global.llmServices.defaultModel.reasoningEfforts.off must be a non-empty string: the value sent to the API (for example off: none)' \
    --set-json 'global.llmServices.defaultModel.reasoningEfforts={"off":"","low":"low"}'
expect_model_failure 'global.llmServices.defaultModel.reasoningEfforts.off must be a non-empty string' \
    --set-json 'global.llmServices.defaultModel.reasoningEfforts={"off":null,"low":"low"}'
expect_model_failure 'global.llmServices.defaultModel.reasoningEfforts.low must be a non-empty string' \
    --set-json 'global.llmServices.defaultModel.reasoningEfforts={"low":1}'
expect_model_failure 'global.llmServices.defaultModel.reasoningEfforts must declare at least one level other than off' \
    --set-json 'global.llmServices.defaultModel.reasoningEfforts={"off":"none"}' \
    --set-string global.llmServices.defaultModel.reasoningEffort=
expect_model_failure 'global.llmServices.defaultModel.reasoningEfforts must declare at least one level other than off' \
    --set-json 'global.llmServices.defaultModel.reasoningEfforts={}'
for invalid_efforts in 'true' '"low"' '["low"]'; do
    expect_model_failure 'global.llmServices.defaultModel.reasoningEfforts must be false (a model that doesn'"'"'t reason) or a map' \
        --set-json "global.llmServices.defaultModel.reasoningEfforts=$invalid_efforts"
done
# An effort the model doesn't declare.
expect_model_failure 'global.llmServices.defaultModel.reasoningEffort must be "" or a level declared in reasoningEfforts (low, high); got "medium"' \
    --set-json 'global.llmServices.defaultModel.reasoningEfforts={"low":"low","high":"high"}'
expect_model_failure 'global.llmServices.defaultModel.auxiliaryReasoningEffort must be "" or a level declared in reasoningEfforts (low, medium, high, xhigh, max); got "minimal"' \
    --set global.llmServices.defaultModel.auxiliaryReasoningEffort=minimal
for invalid_effort in 'turbo' '   ' 'Medium'; do
    expect_model_failure "global.llmServices.defaultModel.reasoningEffort must be \"\" or a level declared in reasoningEfforts" \
        --set-string "global.llmServices.defaultModel.reasoningEffort=$invalid_effort"
done
for invalid_effort_type in '1' 'true' '[]' '{}'; do
    expect_model_failure 'global.llmServices.defaultModel.reasoningEffort must be a string' \
        --set-json "global.llmServices.defaultModel.reasoningEffort=$invalid_effort_type"
    expect_model_failure 'global.llmServices.defaultModel.auxiliaryReasoningEffort must be a string' \
        --set-json "global.llmServices.defaultModel.auxiliaryReasoningEffort=$invalid_effort_type"
done
# An effort on a model that doesn't reason.
expect_model_failure 'global.llmServices.defaultModel.reasoningEffort must be "" or unset when reasoningEfforts is false (a model that doesn'"'"'t reason); got "medium"' \
    --set global.llmServices.defaultModel.reasoningEfforts=false
expect_model_failure 'global.llmServices.defaultModel.auxiliaryReasoningEffort must be "" or unset when reasoningEfforts is false (a model that doesn'"'"'t reason); got "low"' \
    --set global.llmServices.defaultModel.reasoningEfforts=false \
    --set-string global.llmServices.defaultModel.reasoningEffort= \
    --set global.llmServices.defaultModel.auxiliaryReasoningEffort=low

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
        --set global.llmServices.defaultModel.contextWindow=100 \
        --set global.llmServices.defaultModel.maxTokens=101
for invalid_image_input in '"true"' '1' '[]'; do
    expect_failure 'imageInput must be true or false' \
        helm template magda "$chart" --namespace test \
            --set global.agentWorkspace.enabled=true \
            --set global.llmServices.enabled=true \
            --set-json "global.llmServices.defaultModel.imageInput=$invalid_image_input"
done
expect_failure 'providerSecret.name and providerSecret.key must either both be set or both be empty' \
    helm template magda "$chart" --namespace test \
        --set global.llmServices.enabled=true \
        --set llm-services.litellm.providerSecret.name=only-name \
        --set llm-services.litellm.providerSecret.key=
expect_failure 'global.llmServices.defaultModel.alias must not have leading or trailing whitespace' \
    helm template magda "$chart" --namespace test \
        --set global.llmServices.enabled=true \
        --set-string 'global.llmServices.defaultModel.alias= padded-alias '

# More than one model (#3965): every alias is allowed, bundled LiteLLM routes
# each, and the Workspace uses the one agent-services.model selects.
coder='{"alias":"magda-coder","providerModel":"anthropic/claude-coder","displayName":"Magda Coder","contextWindow":400000,"maxTokens":64000,"imageInput":true,"reasoningEfforts":{"low":"low","medium":"medium","high":"high"},"reasoningEffort":"medium"}'
render "$tmp/additional.yaml" magda test "${model_args[@]}" \
    --set-json "global.llmServices.additionalModels=[$coder]"
grep -Fq 'name: ALLOWED_MODELS, value: "[\"magda-agent-default\",\"magda-coder\"]"' "$tmp/additional.yaml"
resource_document ConfigMap litellm-config "$tmp/additional.yaml" | grep -A2 'model_name: "magda-agent-default"' | grep -q 'model: "openai/gpt-6.1-sol"'
resource_document ConfigMap litellm-config "$tmp/additional.yaml" | grep -A2 'model_name: "magda-coder"' | grep -q 'model: "anthropic/claude-coder"'
[[ "$(litellm_effort "$tmp/additional.yaml" | tr '\n' ' ')" == '"medium" "medium" ' ]]
# Unselected, the Workspace keeps the default model.
expect_model "$tmp/additional.yaml" 'm.alias === "magda-agent-default"'
render "$tmp/selected.yaml" magda test "${model_args[@]}" \
    --set-json "global.llmServices.additionalModels=[$coder]" \
    --set agent-services.model.alias=magda-coder
expect_model "$tmp/selected.yaml" 'eq(m, {
    alias: "magda-coder",
    displayName: "Magda Coder",
    contextWindow: 400000,
    maxTokens: 64000,
    imageInput: true,
    reasoningEfforts: {low: "low", medium: "medium", high: "high"},
    reasoningEffort: "medium",
    auxiliaryReasoningEffort: "medium"
})'
if model_config "$tmp/selected.yaml" | grep -q 'claude-coder'; then refuted $LINENO; fi
# The Workspace's own efforts; titles and compaction follow its main-turn
# effort unless one of them sets an auxiliary effort.
render "$tmp/selected-efforts.yaml" magda test "${model_args[@]}" \
    --set-json "global.llmServices.additionalModels=[$coder]" \
    --set agent-services.model.alias=magda-coder \
    --set agent-services.model.reasoningEffort=high
expect_model "$tmp/selected-efforts.yaml" 'm.reasoningEffort === "high" && m.auxiliaryReasoningEffort === "high"'
[[ "$(litellm_effort "$tmp/selected-efforts.yaml" | tr '\n' ' ')" == '"medium" "medium" ' ]]
render "$tmp/selected-aux.yaml" magda test "${model_args[@]}" \
    --set global.llmServices.defaultModel.auxiliaryReasoningEffort=low \
    --set agent-services.model.reasoningEffort=high
expect_model "$tmp/selected-aux.yaml" 'm.reasoningEffort === "high" && m.auxiliaryReasoningEffort === "low"'
render "$tmp/selected-own-aux.yaml" magda test "${model_args[@]}" \
    --set global.llmServices.defaultModel.auxiliaryReasoningEffort=low \
    --set-string agent-services.model.auxiliaryReasoningEffort=
# An empty Workspace effort is the model entry's reasoningEffort.
expect_model "$tmp/selected-own-aux.yaml" 'm.reasoningEffort === "medium" && m.auxiliaryReasoningEffort === "medium"'
render "$tmp/selected-empty-main.yaml" magda test "${model_args[@]}" \
    --set global.llmServices.defaultModel.auxiliaryReasoningEffort=low \
    --set-string agent-services.model.reasoningEffort=
expect_model "$tmp/selected-empty-main.yaml" 'm.reasoningEffort === "medium" && m.auxiliaryReasoningEffort === "low"'
render "$tmp/entry-empty-aux.yaml" magda test "${model_args[@]}" \
    --set global.llmServices.defaultModel.reasoningEffort=high \
    --set-string global.llmServices.defaultModel.auxiliaryReasoningEffort=
expect_model "$tmp/entry-empty-aux.yaml" 'm.reasoningEffort === "high" && m.auxiliaryReasoningEffort === "high"'
# Main turns on the provider's default with a title effort can't be expressed
# (DSH applies the title effort to main turns that have none), so it fails;
# a main-turn level of the Workspace's own makes it valid.
for aux_args in \
    "--set global.llmServices.defaultModel.auxiliaryReasoningEffort=low" \
    "--set agent-services.model.auxiliaryReasoningEffort=low"; do
    # shellcheck disable=SC2086
    expect_model_failure 'agent-services: the Workspace'"'"'s main-turn effort is the provider'"'"'s default (model "magda-agent-default" has reasoningEffort ""), so its title and compaction effort can'"'"'t be "low"' \
        --set-string global.llmServices.defaultModel.reasoningEffort= $aux_args
done
render "$tmp/provider-main-own-level.yaml" magda test "${model_args[@]}" \
    --set-string global.llmServices.defaultModel.reasoningEffort= \
    --set global.llmServices.defaultModel.auxiliaryReasoningEffort=low \
    --set agent-services.model.reasoningEffort=high
expect_model "$tmp/provider-main-own-level.yaml" 'm.reasoningEffort === "high" && m.auxiliaryReasoningEffort === "low"'
expect_model_failure 'agent-services.model.alias "missing" isn'"'"'t a model LLM Services serves; the served aliases (global.llmServices.defaultModel and additionalModels) are magda-agent-default, magda-coder' \
    --set-json "global.llmServices.additionalModels=[$coder]" \
    --set agent-services.model.alias=missing
expect_model_failure 'agent-services.model.reasoningEffort must be "" or a level declared in reasoningEfforts (low, medium, high); got "max"' \
    --set-json "global.llmServices.additionalModels=[$coder]" \
    --set agent-services.model.alias=magda-coder \
    --set agent-services.model.reasoningEffort=max
expect_model_failure 'agent-services.model.auxiliaryReasoningEffort must be "" or unset when reasoningEfforts is false' \
    --set global.llmServices.defaultModel.reasoningEfforts=false \
    --set-string global.llmServices.defaultModel.reasoningEffort= \
    --set agent-services.model.auxiliaryReasoningEffort=low
expect_model_failure 'agent-services.model has an unknown field "contextWindow"' \
    --set agent-services.model.contextWindow=1000
expect_model_failure 'global.llmServices.additionalModels[0].alias "magda-agent-default" is already used by another model; aliases must be unique' \
    --set-json 'global.llmServices.additionalModels=[{"alias":"magda-agent-default","providerModel":"x","contextWindow":10,"maxTokens":1}]'
expect_model_failure 'global.llmServices.additionalModels[0].contextWindow must be a positive integer' \
    --set-json 'global.llmServices.additionalModels=[{"alias":"other","providerModel":"x"}]'
expect_model_failure 'global.llmServices.additionalModels[0].providerModel is required when bundled LiteLLM is enabled' \
    --set-json 'global.llmServices.additionalModels=[{"alias":"other","contextWindow":10,"maxTokens":1}]'
expect_model_failure 'global.llmServices.additionalModels must be a list of model entries; got string' \
    --set-string global.llmServices.additionalModels=other

# An external backend serves several aliases, without provider models.
render "$tmp/external-multi-model.yaml" magda test \
    --set global.agentWorkspace.enabled=true \
    --set global.llmServices.enabled=true \
    --set global.llmServices.defaultModel.alias=external-agent \
    --set-string global.llmServices.defaultModel.providerModel= \
    --set-json 'global.llmServices.additionalModels=[{"alias":"other-model","contextWindow":10,"maxTokens":1}]' \
    --set llm-services.litellm.enabled=false \
    --set llm-services.backend.url=https://llm.example/v1 \
    --set llm-services.backend.masterKeySecret.name=external-key \
    --set llm-services.backend.masterKeySecret.key=key
if grep -q 'Source: magda-core/charts/llm-services/charts/litellm/' "$tmp/external-multi-model.yaml"; then refuted $LINENO; fi
expect_model "$tmp/external-multi-model.yaml" 'm.alias === "external-agent"'
grep -Fq 'name: ALLOWED_MODELS, value: "[\"external-agent\",\"other-model\"]"' "$tmp/external-multi-model.yaml"
# A minimal entry gets the defaults: text only, the default levels, and no
# effort for main turns, titles or compaction.
render "$tmp/minimal-entry.yaml" magda test "${model_args[@]}" \
    --set-json 'global.llmServices.additionalModels=[{"alias":"plain","providerModel":"openai/plain","contextWindow":10,"maxTokens":1}]' \
    --set agent-services.model.alias=plain
expect_model "$tmp/minimal-entry.yaml" 'eq(m, {
    alias: "plain",
    displayName: "plain",
    contextWindow: 10,
    maxTokens: 1,
    imageInput: false,
    reasoningEfforts: {low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max"},
    reasoningEffort: "",
    auxiliaryReasoningEffort: ""
})'

render "$tmp/credentialless.yaml" magda test \
    --set global.llmServices.enabled=true \
    --set llm-services.litellm.providerSecret.name= \
    --set llm-services.litellm.providerSecret.key=
if grep -q 'LITELLM_PROVIDER_API_KEY' "$tmp/credentialless.yaml"; then refuted $LINENO; fi
if grep -q 'api_key:' "$tmp/credentialless.yaml"; then refuted $LINENO; fi

checksum_default="$(resource_document Deployment litellm "$tmp/model-default.yaml" | sed -n 's/.*checksum\/config: *"*\([0-9a-f]*\)"*.*/\1/p')"
checksum_reasoning="$(resource_document Deployment litellm "$tmp/aux-off.yaml" | sed -n 's/.*checksum\/config: *"*\([0-9a-f]*\)"*.*/\1/p')"
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
        for (const key of ["routes", "helmet", "helmetPerPath", "csp", "requestTimeoutPerPath"]) {
            const m = doc.match(new RegExp(`^  ${key}\\.json: (".*")$`, "m"));
            data[key] = JSON.parse(JSON.parse(m[1]));
        }
        process.stdout.write(JSON.stringify(data));
    ' "$1"
}
gateway_fixture="$helm_root/../../magda-gateway/src/test/fixtures/agentWorkspaceGatewayConfig.json"
gateway_config_json "$tmp/model-default.yaml" >"$tmp/gateway-enabled.json"
# Helm < 3.18 drops null-valued chart defaults (e.g. the default helmet's
# `defaultSrc: null`) while newer Helm keeps them, so null directives are
# normalised away on both sides; the Gateway spec covers both forms.
node -e '
    const assert = require("assert");
    const fs = require("fs");
    const dropNulls = (value) =>
        Array.isArray(value)
            ? value.map(dropNulls)
            : value && typeof value === "object"
            ? Object.fromEntries(
                  Object.entries(value)
                      .filter(([, v]) => v !== null)
                      .map(([k, v]) => [k, dropNulls(v)])
              )
            : value;
    const rendered = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const fixture = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
    assert.deepStrictEqual(
        dropNulls({
            agentRoute: rendered.routes.agent,
            helmet: rendered.helmet,
            csp: rendered.csp,
            helmetPerPath: rendered.helmetPerPath
        }),
        dropNulls(fixture),
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

# The gateway's request timeout, with an hour for Agent Workspace uploads only,
# and its early rejection limits.
request_timeouts() {
    node -e '
        const config = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
        process.stdout.write(JSON.stringify(config.requestTimeoutPerPath));
    ' "$1"
}
upload_path=/api/v0/agent/runtime/api/session/uploadFileBinary
[[ "$(request_timeouts "$tmp/gateway-enabled.json")" == "{\"$upload_path\":3600}" ]]
for file in disabled llm-only; do
    [[ "$(request_timeouts "$tmp/gateway-$file.json")" == '{}' ]]
done
gateway_deployment="$(resource_document Deployment gateway "$tmp/model-default.yaml")"
for expected in \
    '"--requestTimeout", "300",' \
    '"--requestTimeoutPerPathJson", "/etc/config/requestTimeoutPerPath.json",' \
    '"--earlyRejectionLingerSeconds", "5",' \
    '"--earlyRejectionMaxDiscardBytes", "16777216",'; do
    grep -Fq -- "$expected" <<<"$gateway_deployment"
done
cat >"$tmp/request-timeouts.yaml" <<EOF
gateway:
  requestTimeout: 0
  requestTimeoutPerPath:
    $upload_path: 7200
    /api/v0/storage: 900
  earlyRejectionLingerSeconds: 10
EOF
render "$tmp/request-timeouts-override.yaml" magda test \
    --set global.agentWorkspace.enabled=true \
    --set global.llmServices.enabled=true \
    -f "$tmp/request-timeouts.yaml"
gateway_config_json "$tmp/request-timeouts-override.yaml" >"$tmp/gateway-request-timeouts.json"
[[ "$(request_timeouts "$tmp/gateway-request-timeouts.json")" == "{\"$upload_path\":7200,\"/api/v0/storage\":900}" ]]
resource_document Deployment gateway "$tmp/request-timeouts-override.yaml" | grep -Fq '"--requestTimeout", "0",'
resource_document Deployment gateway "$tmp/request-timeouts-override.yaml" | grep -Fq '"--earlyRejectionLingerSeconds", "10",'

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
# #3928: the upload route streams up to global.agentWorkspace.maxUploadBytes.
upload_ingress() {
    resource_document Ingress ingress-agent-upload "$1"
}
for file in ingress-disabled ingress-llm-only; do
    if upload_ingress "$tmp/$file.yaml" | grep -q .; then refuted $LINENO; fi
done
[[ "$(count_kind Ingress "$tmp/ingress-enabled.yaml")" == 2 ]]
upload_ingress "$tmp/ingress-enabled.yaml" | grep -qx '    nginx.ingress.kubernetes.io/proxy-body-size: "1073741824"'
upload_ingress "$tmp/ingress-enabled.yaml" | grep -qx '    nginx.ingress.kubernetes.io/proxy-request-buffering: "off"'
upload_ingress "$tmp/ingress-enabled.yaml" | grep -qx '    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"'
upload_ingress "$tmp/ingress-enabled.yaml" | grep -qx '      - pathType: Exact'
upload_ingress "$tmp/ingress-enabled.yaml" | grep -qx '        path: /api/v0/agent/runtime/api/session/uploadFileBinary'
ingress_annotations "$tmp/ingress-enabled.yaml" | grep -qx '    nginx.ingress.kubernetes.io/proxy-body-size: "100M"'
render "$tmp/ingress-upload-500m.yaml" magda test --set tags.ingress=true \
    --set global.agentWorkspace.enabled=true \
    --set global.llmServices.enabled=true \
    --set global.agentWorkspace.maxUploadBytes=524288000
upload_ingress "$tmp/ingress-upload-500m.yaml" | grep -qx '    nginx.ingress.kubernetes.io/proxy-body-size: "524288000"'
grep -Fq 'name: RUNTIME_MAX_UPLOAD_BYTES, value: "524288000"' "$tmp/ingress-upload-500m.yaml"
render "$tmp/ingress-gce.yaml" magda test --set tags.ingress=true \
    --set global.agentWorkspace.enabled=true \
    --set global.llmServices.enabled=true \
    --set ingress.ingressClass=gce
[[ "$(count_kind Ingress "$tmp/ingress-gce.yaml")" == 1 ]]
for value in 0 -1 1.5 abc; do
    expect_failure "global.agentWorkspace.maxUploadBytes must be a positive integer" \
        render "$tmp/invalid-upload.yaml" magda test \
        --set global.agentWorkspace.enabled=true \
        --set global.llmServices.enabled=true \
        --set global.agentWorkspace.maxUploadBytes=$value
done

# Other annotations are unchanged by the Workspace flag.
diff <(ingress_annotations "$tmp/ingress-disabled.yaml") \
    <(ingress_annotations "$tmp/ingress-enabled.yaml" | grep -v 'proxy-read-timeout\|proxy-send-timeout')

printf 'Agent Services render matrix passed\n'
