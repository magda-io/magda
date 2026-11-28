#!/usr/bin/env bash
set -euo pipefail
chart="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

render() {
    helm template qualification "$chart" --namespace qualification \
        --set global.llmServices.enabled=true \
        --show-only charts/llm-services/templates/deployment.yaml "$@"
}
render >"$tmp/default.yaml"
render --set llm-services.usage.estimate.bytesPerToken=8 \
    --set llm-services.usage.estimate.outputTokens=0 \
    --set llm-services.usage.estimate.incompleteFactor=0 \
    --set llm-services.decisionCacheSeconds=0 >"$tmp/override.yaml"
node - "$tmp/default.yaml" "$tmp/override.yaml" <<'NODE'
const assert = require("assert/strict");
const fs = require("fs");
function env(file) {
    // Built-in Node only: the Helm CI image need not have npm dependencies.
    const entries = [...fs.readFileSync(file, "utf8").matchAll(/\{name: ([A-Z_]+), value: ("[^"]*")\}/g)];
    return Object.fromEntries(entries.map(([, name, value]) => [name, JSON.parse(value)]));
}
const defaults = env(process.argv[2]);
const overrides = env(process.argv[3]);
for (const [name, expected, override] of [
    ["USAGE_ESTIMATE_BYTES_PER_TOKEN", "5", "8"],
    ["USAGE_ESTIMATE_OUTPUT_TOKENS", "4096", "0"],
    ["USAGE_ESTIMATE_INCOMPLETE_FACTOR", "0.25", "0"],
    ["DECISION_CACHE_SECONDS", "30", "0"]
]) {
    assert.equal(defaults[name], expected, name);
    assert.equal(overrides[name], override, `${name} override`);
}
NODE
printf 'LLM metering defaults, fractional factor and zero overrides passed\n'
