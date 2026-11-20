# #3934: disposable LiteLLM usage-observation PoC

This directory is an experiment, **not a production quota implementation**. No production source, Helm defaults, dependencies, authorization policy or storage schema is changed. The pinned LiteLLM version is not upgraded. Keep [#3838](https://github.com/magda-io/magda/issues/3838) open; this does not implement the documentation proposal in [#3932](https://github.com/magda-io/magda/pull/3932).

## Reproduce offline

From the repository root, using the existing workspace dependencies (Node 22):

```sh
cd magda-llm-services
node --import tsx ../node_modules/mocha/bin/mocha.js --timeout 15000 'poc/*.spec.ts'
node ../node_modules/typescript/bin/tsc -p poc/tsconfig.json
```

Validation: **50 passing tests** (30 observer, 8 transport/facade experiments, 12 existing facade regressions), strict PoC typecheck, and unchanged production service compilation. Mocha also includes the package's existing facade tests. All offline response/tool fixtures are synthetic and **do not establish real-provider or DSH compatibility**.

- [usage-observer.ts](./usage-observer.ts): bounded, read-only parser for either API's JSON or SSE usage. Incremental frame parsing handles fragmented UTF-8 and CR/LF boundaries; oversized events are skipped, not buffered indefinitely. The metadata sink never receives model output, tool arguments, IDs, arbitrary event names, or error messages.
- [usage-tap.ts](./usage-tap.ts): disposable loopback transport tap. It observes the same source that Node pipes to its destination, leaving `pipe()` responsible for backpressure. It forwards original bytes rather than reconstructing SSE. Compressed/unknown content types are forwarded but not parsed. Each request reports once, including cancellation, transport error or idle timeout. The outcome describes the upstream lifecycle, not proof that the caller received every byte: upstream EOF can precede a downstream cancellation while buffered bytes drain. The timeout is an idle socket timeout, which prolonged downstream backpressure can also trigger.
- [facade-experiment.spec.ts](./facade-experiment.spec.ts): the **unchanged actual MAGDA facade**, with real local auth-service HTTP calls and synthetic upstream fixtures, compared with and without the tap. Tests verify response byte equality, status/headers, provider-credential replacement, tool argument preservation, cancellation and cleanup.
- [usage-observer.spec.ts](./usage-observer.spec.ts): parser, bounds, malformed/incomplete streams and duplicate usage tests.

The tap sits immediately upstream of the facade rather than changing its implementation:

```text
local caller -> actual createApp -> loopback tap -> LiteLLM
                                     | metadata only
```

This placement demonstrates observation on the actual proxy path without adding a production feature switch. It adds one local HTTP hop; the test is not a latency benchmark and cannot prove equivalence for every network failure race.

## Optional local observed facade

[run-facade.ts](./run-facade.ts) starts the existing application using the normal environment contract, pointed at the disposable tap. Supply `JWT_SECRET`, `LITELLM_MASTER_KEY`, `ALLOWED_MODELS` (JSON array), `AUTH_API_URL` and `LITELLM_URL` through a secure environment. **Do not paste credentials into scripts, command arguments, issue comments or committed artifacts.** Services can be reached using private port forwards; this launcher does not change the cluster deployment.

```sh
# Only after securely supplying the environment. Loopback only, default port 61394.
node --import tsx magda-llm-services/poc/run-facade.ts
```

Send authenticated synthetic requests to `/v0/v1/chat/completions` or `/v0/v1/responses`. The launcher prints only usage metadata and a listening address. It does not insert `include_usage` or alter request bodies. To compare with raw forwarding, use the existing facade normally; two independent real generations are **not** expected to yield identical bytes. Exact byte equality is checked against deterministic replay in the offline tests. Stop with Ctrl-C; no database or persistent usage records are created.

## Live evidence and decision

See [live-findings.md](./live-findings.md) for the exact running image, real provider/API matrix, DSH verification and limitations. Live scripts emit only redacted metadata; never save raw provider output or JWTs as test artifacts.

With `kubectl` already pointing at the authorized local minikube deployment, run from the repository root:

```sh
# Makes real, billable model requests, with the observer compiled only in memory.
node magda-llm-services/poc/cluster-observed.cjs
# A smaller optional repeat (namespace, then comma-separated case labels).
node magda-llm-services/poc/cluster-observed.cjs magda-demo chat-nonstream,responses-nonstream,chat-stream-true,responses-stream-undefined,client-cancel
# Actual installed DSH baseline and observed Responses tool-loop experiments.
node magda-llm-services/poc/cluster-dsh.cjs
node magda-llm-services/poc/cluster-dsh.cjs --observed
```

This launcher refuses a non-minikube context and does not change deployments. It sends the standalone observer plus the synthetic caller over stdin to the existing LLM Services pod. The script mints a short-lived JWT in memory using the deployment's JWT secret; this requires cluster-operator privileges and is **not** an example of authentication for an ordinary MAGDA user. The real facade still checks that session and the authorization decision. Provider credentials remain inside the deployment. The output includes `observerBytesUnchanged` (before/after observation of the same buffers); deterministic offline replay separately tests raw-versus-observed transport equality. Re-running generations can yield different usage counts.

## Soft-quota interpretation (not enforcement)

Use one final validated **input + output** snapshot per upstream request, not the sum of usage events. Only `usageFinal: true` marks final observed usage. Before terminal, newer validated snapshots replace interim values; at the first terminal the snapshot freezes, so repeated/conflicting later frames cannot overwrite it. Exact repeats increment a duplicate counter rather than adding tokens. A Responses terminal with no valid usage can retain an earlier snapshot as explicitly provisional (`usageFinal: false`); `terminalSeen` alone does not establish final accounting. Cached input and reasoning output are subsets, not additional tokens. A multi-step tool turn has multiple model requests; count each request once, including the continuation's repeated context. No claim of invoice-level accuracy is made.

Missing final usage is **unknown, not zero**. A feasible later soft-limit design can reserve an estimate before a request (using a model-appropriate prompt estimate and an output allowance), reconcile with observed final usage, and retain a clearly marked estimate if cancelled or incomplete. Visible-output character counts alone miss hidden reasoning, cached accounting, tool context and work performed after cancellation. Do not silently use such a count as an exact replacement; report estimated versus observed usage separately. This PoC does not collect prompts or implement tokenizers, estimates, identity association, global counters, quota reset/cutoff, or durable deduplication.

The parser retains only bounded transient response frames (64 KiB/event; 1 MiB/nonstream JSON by default), discards incomplete frames at EOF, and emits allowlisted metadata. Oversized nonstream responses and oversized usage-bearing terminal events can therefore lose usage; that is an explicit fallback case. This is bounded transient parsing, **not** unlimited whole-response buffering. This disposable experiment buffers a nonstream JSON body only within its cap; a future production implementation could use an incremental JSON parser if that distinction matters operationally.
