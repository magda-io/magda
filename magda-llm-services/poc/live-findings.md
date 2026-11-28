# #3934: live minikube / real installed DSH findings

Tested 20 November 2026 (Australia/Sydney). Disposable operator-authorized PoC; no product deployment/configuration changes. All recorded outputs were metadata only. No provider credentials, JWTs, actual request text, response bodies, or tool arguments are recorded here. Fixed synthetic inputs in the scripts are test fixtures, not captured traffic.

## Exact runtime and confidence boundary

- Kubernetes context: `minikube`; existing namespace `magda-demo`.
- Existing LiteLLM image: `ghcr.io/berriai/litellm:main-v1.81.12-stable`.
- Running container imageID digest: `sha256:bbe33922e37bb76a065f85b847cb34744e98b408df66c6c4b4425e48b9e8c573` (the actual selected architecture image, not a claimed manifest-list digest).
- Installed Python distribution: **LiteLLM 1.81.12**.
- Existing facade image: `localhost:5000/magda-llm-services:pr3916-demo-ddc173c26`; actual authorization API, OPA access check and untouched facade `/v0/v1/*` proxy exercised.
- Configured provider/model route: **`openai/gpt-6.1-sol`**, public alias **`magda-agent-default`**. No custom API base in the selected model configuration; no OpenAI/Azure/Anthropic/Bedrock override environment names or provider base-host overrides found. This establishes the configured OpenAI route, not independent attestation of the provider's internal model implementation. These were **live upstream requests, not mock/replayed responses**.
- Existing sandbox: namespace `magda-demo-agent`, image `localhost:5000/magda-agent-runtime:dsh-1.0.5-arm64`. Despite this image label, the actual installed DSH CLI and installed adapter package versions are **`0.2.1-alpha.1`**. Conclusions apply to that installed build, not every DSH version.
- Other providers (Anthropic, Bedrock, Azure, other OpenAI-compatible services) **not tested**. No alternative LiteLLM version deployed. No claim that this proves their compatibility.

The operator minted expiring JWTs **inside the existing facade pod** using its existing signing material and the repository's default-admin identity. Tokens existed only in memory/stdin; the signing key never left the pod and was never output. The facade still performed its real whoami and `agentWorkspace/access` authorization checks. No API-key, identity, policy, Registry, or database records were created.

## Real facade matrix

Unless stated otherwise: HTTP 200, actual provider; completed streams had one usage-bearing event, clean SSE EOF and no duplicated usage. Counts below are individual sample observations, not promised deterministic token counts.

| Case                                                            | Observation                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat nonstream                                                  | `usage.prompt_tokens=9`, `completion_tokens=5`, `total_tokens=14`. A finalized-observer rerun returned 9+4=13.                                                                                                                                                   |
| Responses nonstream                                             | `usage.input_tokens=9`, `output_tokens=5`, `total_tokens=14`. Finalized-observer rerun returned 9+6=15.                                                                                                                                                          |
| Chat stream, `stream_options` omitted                           | One usage event, 9+5=14; assistant role and content deltas preserved; `[DONE]`.                                                                                                                                                                                  |
| Chat stream, `include_usage:false`                              | **Zero usage events**, normal assistant/content stream and `[DONE]`.                                                                                                                                                                                             |
| Chat stream, `include_usage:true`                               | One usage event, 9+5=14; assistant role/content deltas and `[DONE]`.                                                                                                                                                                                             |
| Responses stream, `stream_options` omitted                      | Native events including `response.created`, `response.in_progress`, output-item/content boundaries, text deltas, **`response.completed` carrying usage**, then `[DONE]`. Sample 9+6=15; finalized-observer rerun 9+5=14.                                         |
| Responses stream, `stream_options:{include_usage:false}`        | **HTTP 400**. No usage.                                                                                                                                                                                                                                          |
| Responses stream, `stream_options:{include_usage:true}`         | **HTTP 400**. No usage. **Do not add Chat-specific `stream_options` to Responses.**                                                                                                                                                                              |
| Chat forced tool choice, streamed `include_usage:false/true`    | HTTP 400 `invalid_request_error`, irrespective of include_usage.                                                                                                                                                                                                 |
| Chat automatic tool choice, low/default/none reasoning attempts | HTTP 400, including nonstream requests. Safe boolean inspection of the provider error confirmed a direction to use Responses; no raw error message saved. This is an existing model/protocol restriction, **not evidence of a LiteLLM usage-option regression**. |
| Responses streamed synthetic function call                      | HTTP 200; 1 function-call boundary, **5 incremental argument deltas**, argument-done/output-item-done, `response.completed`; input51/output19/total70.                                                                                                           |
| Responses custom-caller tool continuation, cap64                | HTTP 200 terminal **`response.incomplete`**, input34/output64/total98; reasoning64 is a subset of output64, not additional usage.                                                                                                                                |
| Responses custom-caller tool continuation, cap512               | HTTP 200 terminal **`response.incomplete`**, input34/output512/total546; reasoning446 is a subset of output512. The isolated actual-DSH continuation below successfully completed; the small capped synthetic caller is not equivalent to a full DSH request.    |
| Provider parameter error                                        | Chat `max_tokens` rejected HTTP400 `invalid_request_error`; `max_completion_tokens` accepted. Error bodies/messages not recorded.                                                                                                                                |
| Facade denied model                                             | HTTP403 before provider; no usage.                                                                                                                                                                                                                               |
| Client cancellation                                             | Abort after first actual Chat content delta: HTTP200 had started, **no terminal usage**, no `[DONE]` observed. This does not prove the provider stopped computation/billing.                                                                                     |
| Client 1ms deadline                                             | `AbortError`, no status/usage/terminal observed. This tests client timeout, **not** the facade's 120-second upstream timeout.                                                                                                                                    |

For every observed usage object, **total = input + output**. Cached-input details were zero in the small custom-caller samples, but the actual observed DSH continuation below returned cachedInput4223 within input4312. Reasoning and cached tokens are subsets; provider-specific cache-hit billing behavior is not established. Real capped Responses continuations establish nonzero reasoning-token subset behavior. Repeated ordinary requests and multi-request tool workflows were exercised. No successful response carried multiple usage snapshots in the observed samples.

### Pinned automatic usage configuration check

The live configuration did not set `always_include_stream_usage`. A recursive literal search of all installed `litellm/**/*.py` files found **zero** occurrences of that name in 1.81.12. Therefore this PoC does **not** recommend setting that option on the pinned version; support was not established. Live behavior is more useful than assuming a setting: omitted Chat option returned usage, explicit false suppressed it, explicit true returned it. Do not infer all providers behave identically.

## Actual installed DSH verification

The existing user profile was read only for nonsecret shape/path/version discovery. Tests ran the **actual installed `/usr/local/bin/dsh` headless launcher and installed pi-ai adapter**, not a replacement client or mock. Each experiment created an isolated `/tmp/magda3934-*` home/workspace in the existing sandbox, with temporary provider selection only there. A loopback HTTP tap forwarded to the actual MAGDA facade and attached the ephemeral session; it did not modify deployment configuration or the existing running web session.

Raw-proxy baseline:

| Installed DSH profile protocol                  | Actual request / result                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI Chat Completions, ordinary task          | Actual adapter sent `stream:true`, `stream_options.include_usage:true`, 24 tool definitions. Provider HTTP400; DSH exited1 with `INVALID_REQUEST`, no UI/stream hang. A separate title-generation request had no tools.                                                                                                   |
| OpenAI Chat Completions, tool task              | Same existing provider restriction; HTTP400 / exit1. An ordinary task still advertises tools, so “ordinary Chat works” at the custom-caller level is insufficient for DSH compatibility.                                                                                                                                  |
| OpenAI Responses, ordinary task                 | Actual adapter sent `stream:true`, **no `stream_options`**, 24 tool definitions. Main and title-generation requests HTTP200; DSH **exit0**, zero stderr bytes.                                                                                                                                                            |
| OpenAI Responses, real bash tool + continuation | Main request HTTP200, DSH emitted exactly **1 `tool_call` and 1 `tool_result`**; actual follow-up request contained **1 `function_call_output`** among 6 input items and again 24 tool definitions; continuation HTTP200; DSH **exit0**, zero stderr bytes. Harmless synthetic tool ran in the disposable workspace only. |

This is a real headless-agent/tool-loop test, **not a browser UI rendering test**. Existing DSH web sessions were not changed or used; browser role rendering and UI hang checks remain unverified. Initial experimental launcher mistakes (unsupported disposable retry mode) produced `NO_ADAPTER` before any provider traffic; they were corrected to supported normal/maxRetries0 before the successful baseline, and those temporary homes were deleted.

## Actual observer over real provider bytes

The parent agent ran the real facade matrix with the PoC observer loaded in memory into the existing facade pod. No bundle, prompt, or response file was written there. The finalized representative rerun covered Chat/Responses JSON, both ordinary stream formats, and cancellation:

- Normal responses: observer selected the same usage totals, **`usageFinal:true`**, clean terminal/event parsing, no malformed/oversized/incomplete frames.
- Responses completed stream had both `response.completed` and `[DONE]` terminal markers; no double accounting of its one usage snapshot.
- Cancellation: **`missingTerminal:true`, `usageFinal:false`**, no fabricated zero/exact usage.
- Every observed buffer was hashed before and after the synchronous observer write; **byte equality true**. This proves no buffer mutation by the observer, not cross-request generated-text equality.
- Full earlier live matrix: all observed buffers unchanged, max observed event19897 bytes, no malformed/oversized/incomplete frames. Its custom Responses continuation ended `response.incomplete` with valid usage as above.

### Actual installed DSH with the finalized observer

A separate actual-DSH Responses ordinary/tool run loaded the finalized observer in memory into the loopback tap, called its synchronous `write` on the original provider bytes, and retained the independent `r.pipe(res)` forwarding path. Both tasks **exit0**, zero stderr bytes, no timeout. The tool task again emitted exactly one tool call/result and a real continuation request.

| Observed real DSH stream               | Usage / boundaries                                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Ordinary agent                         | input4206 + output6 = total4212; `response.completed`.                                                                         |
| Tool-call agent request                | input4226 + output74 = total4300; **61 incremental function-argument deltas**, one tool-call boundary, `response.completed`.   |
| Tool-result continuation               | input4312 + output18 = total4330; **reasoning11 within output18**, **cachedInput4223 within input4312**; `response.completed`. |
| Concurrent background title generation | input134 + output64 = total198; reasoning64 within output64; terminal **`response.incomplete`** still supplied final usage.    |

All **four captured terminal streams** had `usageFinal:true`, one usage event, no duplicate/invalid usage, no malformed/oversized/incomplete frames or unknown event types, and **bytesUnchanged:true**. Maximum observed buffered event was25701 bytes. This establishes that the actual installed DSH agent and tool continuation work through the unchanged-byte observer, not merely that a custom client can consume SSE.

Five wire requests were seen in that run (ordinary2, tool workflow3, including concurrent title requests), but only four reached the tap's end-of-response report before process shutdown. **Do not claim a final figure was captured for every background request.** Shutdown/cancellation can leave an in-flight auxiliary request without final usage; it needs the same missing-terminal fallback. This does not contradict the successful main-agent/tool-loop completions.

## Redacted event-structure projections

These are allowlisted structural projections of the observed wire formats, **not raw provider payloads**. IDs, timestamps, content, tool names/arguments and error messages are omitted. Usage details remain numeric metadata only.

```jsonl
{"object":"chat.completion.chunk","choices":[],"usage":{"prompt_tokens":9,"completion_tokens":5,"total_tokens":14}}
{"type":"response.function_call_arguments.delta"}
{"type":"response.completed","response":{"usage":{"input_tokens":4226,"output_tokens":74,"total_tokens":4300}}}
{"type":"response.incomplete","response":{"usage":{"input_tokens":134,"output_tokens":64,"total_tokens":198,"output_tokens_details":{"reasoning_tokens":64}}}}
```

Chat normally finishes with `data: [DONE]`. The tested Responses route also sent `[DONE]` after its terminal event; it is another terminal marker, not another usage charge. The observer accepts the first terminal snapshot and does not sum repeated markers.

## Reproduction and safety

Run from the repository root with explicit operator authorization; these requests can incur provider cost. The in-pod caller requires the facade pod's existing dependencies/environment and never prints auth material:

```sh
kubectl --context minikube exec -i -n magda-demo <llm-services-pod> -- node < magda-llm-services/poc/cluster-facade.cjs
node magda-llm-services/poc/cluster-observed.cjs magda-demo
node magda-llm-services/poc/cluster-dsh.cjs
node magda-llm-services/poc/cluster-dsh.cjs --observed
```

See [facade caller](./cluster-facade.cjs), [observed caller launcher](./cluster-observed.cjs), and [installed DSH launcher](./cluster-dsh.cjs). Output permits fixed usage/event/error metadata only. Retained frame/body/tool material is bounded and never emitted. The DSH launcher refuses a non-minikube current context and adds explicit context arguments; its child tasks have bounded execution and cleanup of verified temporary paths.

### Cleanup and explicit remaining limits

No Deployments, ConfigMaps, Secrets, Services, namespace resources, existing sandbox profiles, or existing user workspaces were created/modified/deleted. Temporary DSH profiles/session artifacts were confined to verified `/tmp/magda3934-*` roots and removed in `finally`. Final independent inspection found **zero remaining experiment roots** and the existing `/data/workspace` remained empty. Existing facade and LiteLLM pods remained ready. All eleven delegated background jobs completed and their outputs were collected; none remain running. JWTs expire and were never persisted. No database/Redis/PostgreSQL additions. Publishing the PoC branch/PR is separate from these live-test operations.

Not established: other providers/credentials, model-internal billing accuracy, cache-hit billing behavior, production provider timeout, forced missing terminal upstream failure, Azure regression, tool compatibility on another LiteLLM version, browser UI rendering, or server/provider resource reclamation after a client disconnect. Local observer/integration fixtures elsewhere in the PoC cover synthetic fragmentation/truncation/failure cases; they are **mock/synthetic**, not live-provider evidence.

## Decision

**The exact pinned LiteLLM image is usable for metadata-only soft-quota observation on the tested real OpenAI route using Responses, without a version upgrade.** Preserve raw bytes and protocol shape. Do not globally insert `stream_options`. Treat input+output as total; reasoning/cached tokens are subsets. A terminal `response.incomplete` can still provide authoritative per-request usage. Cancellation/missing terminal requires an explicit provisional/estimated fallback or unknown-usage state, not a falsely exact zero. These observations support practical soft quotas, not billing-grade accounting.

**Existing Chat/tool-provider incompatibility must remain explicit:** simple Chat requests work, but this model rejects tool-bearing Chat requests; actual installed DSH advertises tools even for an ordinary task. Responses is the verified working DSH protocol for this route. No product configuration changes are part of this PoC.
