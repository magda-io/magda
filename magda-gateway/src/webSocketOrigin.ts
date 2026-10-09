import { IncomingHttpHeaders } from "http";

// an origin serialisation: scheme "://" host [":" port], nothing else
const ORIGIN_PATTERN = /^https?:\/\/[^/?#\s,@\\]+$/i;

function isHttpUrl(url: URL) {
    return url.protocol === "http:" || url.protocol === "https:";
}

/**
 * Validate & normalise one configured `websocketAllowedOrigins` entry.
 * Accepts `http(s)://host[:port]` with an optional trailing `/`; returns the normalised origin
 * (lowercase scheme & host, default port omitted). Throws on anything else (paths, query,
 * fragment, credentials, wildcards, other schemes).
 */
export function parseConfiguredOrigin(value: unknown, label: string): string {
    if (typeof value !== "string") {
        throw new Error(
            `${label}: allowed origin must be a string, got ${JSON.stringify(
                value
            )}`
        );
    }
    const candidate = value.endsWith("/") ? value.slice(0, -1) : value;
    let url: URL;
    try {
        if (!ORIGIN_PATTERN.test(candidate)) {
            throw new Error();
        }
        url = new URL(candidate);
    } catch (e) {
        throw new Error(
            `${label}: invalid allowed origin ${JSON.stringify(
                value
            )}. Expected \`http(s)://host[:port]\` without path, query, fragment or credentials.`
        );
    }
    if (!isHttpUrl(url) || url.hostname.includes("*")) {
        throw new Error(
            `${label}: invalid allowed origin ${JSON.stringify(
                value
            )}. Only http(s) origins without wildcards are supported.`
        );
    }
    return url.origin;
}

/**
 * The origin of the gateway's `externalUrl` (its path, query & fragment are ignored).
 * Returns `undefined` when no `externalUrl` is configured. Throws when it isn't a valid
 * http(s) URL.
 */
export function getExternalUrlOrigin(externalUrl?: string): string | undefined {
    if (typeof externalUrl !== "string" || !externalUrl.trim()) {
        return undefined;
    }
    let url: URL;
    try {
        url = new URL(externalUrl.trim());
    } catch (e) {
        throw new Error(
            `Invalid externalUrl ${JSON.stringify(
                externalUrl
            )}: can't derive the default WebSocket allowed origin.`
        );
    }
    if (!isHttpUrl(url)) {
        throw new Error(
            `Invalid externalUrl ${JSON.stringify(
                externalUrl
            )}: can't derive the default WebSocket allowed origin from a non-http(s) URL.`
        );
    }
    return url.origin;
}

/**
 * Resolve the effective WebSocket Origin allowlist of a route.
 * - `websocketAllowedOrigins` omitted: the origin of `externalUrl`, or no validation when
 *   `externalUrl` isn't configured.
 * - `websocketAllowedOrigins: []`: validation explicitly disabled.
 * - otherwise: exactly the listed origins.
 * Returns `undefined` when Origin validation is disabled.
 */
export function resolveWebSocketAllowedOrigins(
    configured: unknown,
    externalUrl: string | undefined,
    routeKey: string
): string[] | undefined {
    const label = `Route "${routeKey}" websocketAllowedOrigins`;
    if (configured === undefined) {
        const origin = getExternalUrlOrigin(externalUrl);
        return origin ? [origin] : undefined;
    }
    if (!Array.isArray(configured)) {
        throw new Error(`${label} must be an array of origins.`);
    }
    if (!configured.length) {
        return undefined;
    }
    return Array.from(
        new Set(configured.map((item) => parseConfiguredOrigin(item, label)))
    );
}

/**
 * Parse the `Origin` header of a request. Returns the normalised origin, or `undefined` when the
 * header is missing, `null`, repeated or anything other than a single http(s) origin.
 */
export function parseRequestOrigin(
    headers: IncomingHttpHeaders
): string | undefined {
    const value = headers.origin;
    if (typeof value !== "string" || !ORIGIN_PATTERN.test(value)) {
        return undefined;
    }
    try {
        const url = new URL(value);
        return isHttpUrl(url) ? url.origin : undefined;
    } catch (e) {
        return undefined;
    }
}
