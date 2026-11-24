// METER-2: endpoint-specific request handling for metering (#3838).

export interface PreparedRequest {
    body: Buffer;
    /** Whether the body was changed to request usage. */
    usageRequested: boolean;
}

/**
 * Make sure a streaming Chat Completions request asks for usage, so a quota
 * bounded caller can't make a free call with `include_usage: false` (on the
 * tested LiteLLM 1.81.12 route, `false` suppressed usage). Every other request,
 * including every Responses request, is forwarded byte for byte: the tested
 * Responses route returned HTTP 400 for Chat `stream_options`.
 */
export function prepareRequestBody(
    endpoint: string,
    body: Buffer,
    parsed: Record<string, unknown>
): PreparedRequest {
    if (endpoint !== "/v1/chat/completions" || parsed.stream !== true) {
        return { body, usageRequested: false };
    }
    const options = parsed.stream_options;
    if (
        options &&
        typeof options === "object" &&
        !Array.isArray(options) &&
        (options as Record<string, unknown>).include_usage === true
    ) {
        return { body, usageRequested: false };
    }
    const streamOptions =
        options && typeof options === "object" && !Array.isArray(options)
            ? { ...(options as Record<string, unknown>), include_usage: true }
            : { include_usage: true };
    return {
        body: Buffer.from(
            JSON.stringify({ ...parsed, stream_options: streamOptions })
        ),
        usageRequested: true
    };
}
