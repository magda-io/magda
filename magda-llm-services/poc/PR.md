## Disposable PoC for #3934

Based on latest `next` (`5aa529fc8e` at branch creation), separate from documentation-only #3932. No production source/Helm/dependency changes and no quota enforcement, profile API, Registry records, PostgreSQL or Redis deployment.

### Experiment

- Bounded metadata-only Chat Completions / Responses JSON and incremental SSE observer.
- Disposable loopback observer tap upstream of the **unchanged actual MAGDA facade**; original bytes and normal Node pipe backpressure are preserved.
- Synthetic tests for fragmented frames/UTF-8/CRLF, repeated and conflicting usage snapshots, tool argument chunks, oversize/malformed/incomplete events, missing usage, cancellation, idle timeout, status/header preservation, credential replacement and exact byte equality.
- Reproducible minikube caller and redacted real-provider/DSH findings in the PoC directory.

### Findings

- Exact bundled image `main-v1.81.12-stable`, installed LiteLLM `1.81.12`, architecture image digest `sha256:bbe33922e37bb76a065f85b847cb34744e98b408df66c6c4b4425e48b9e8c573` tested against the real configured OpenAI route.
- Actual installed DSH `0.2.1-alpha.1` Responses ordinary streaming and real tool execution/continuation passed both baseline and finalized-observer runs. Captured streams retained identical bytes and final input/output/total metadata, including cached-input and reasoning subsets.
- Chat streams emit usage by default / with `include_usage:true`; explicit false suppresses it. Responses rejects `stream_options` with HTTP400: **do not inject Chat-specific options globally**.
- This provider rejects tool-bearing Chat requests irrespective of usage options; actual DSH advertises tools even for ordinary tasks. Responses is the verified working DSH route, not a claim of universal Chat compatibility.
- Cancellation/deadline and an unfinished auxiliary title request lacked final usage. Preserve unknown/provisional usage and use an explicit estimated fallback for future soft limits, never an exact zero.
- No version upgrade needed for the tested Responses route. Other providers and browser UI rendering remain unverified; see the full confidence limits in the findings.

### Validation

**50 automated tests passed** (30 observer, 8 transport/facade experiments, 12 existing facade regressions); standalone strict typecheck and unchanged production service compilation passed.

```sh
cd magda-llm-services
node --import tsx ../node_modules/mocha/bin/mocha.js --timeout 15000 'poc/*.spec.ts'
node ../node_modules/typescript/bin/tsc -p poc/tsconfig.json
yarn compile
```

See the [PoC README](https://github.com/magda-io/magda/blob/poc/3934-litellm-usage-observer/magda-llm-services/poc/README.md) and [live findings](https://github.com/magda-io/magda/blob/poc/3934-litellm-usage-observer/magda-llm-services/poc/live-findings.md) for the matrix, exact image digest, recommendation and confidence limits. Offline replay equality is not a claim that two independent real generations return identical bytes.

This is **draft/disposable technical evidence**, not a production metering guarantee. Missing usage remains unknown and would need a marked estimate for future soft quotas. Reasoning/cached tokens are subsets and are never added to input+output. Keep #3838 open.
