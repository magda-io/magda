/**
 * Result of parsing a `Range` request header against a known object size.
 * - `{start, end}`: a satisfiable single byte range (inclusive).
 * - `"invalid"`: a syntactically valid but unsatisfiable range → caller responds 416.
 * - `null`: no range / malformed range / unknown size → caller serves the full object (200).
 */
export type ParsedRange = { start: number; end: number } | "invalid" | null;

/**
 * Parse a single-range HTTP `Range` header (`bytes=start-end`, `bytes=start-`,
 * `bytes=-suffix`). Multi-range headers are treated as "no range" (null).
 *
 * @param rangeHeader raw `Range` header value (may be undefined)
 * @param totalSize   total object size in bytes (NaN if unknown)
 */
export function parseRangeHeader(
    rangeHeader: string | undefined,
    totalSize: number
): ParsedRange {
    if (!rangeHeader || isNaN(totalSize)) {
        return null;
    }
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (!match) {
        // malformed or multi-range → fall back to full response
        return null;
    }
    const startStr = match[1];
    const endStr = match[2];
    if (startStr === "" && endStr === "") {
        return null;
    }

    let start: number;
    let end: number;

    if (startStr === "") {
        // suffix range: last N bytes
        const suffix = parseInt(endStr, 10);
        if (suffix <= 0) {
            return "invalid";
        }
        start = Math.max(totalSize - suffix, 0);
        end = totalSize - 1;
    } else {
        start = parseInt(startStr, 10);
        end = endStr === "" ? totalSize - 1 : parseInt(endStr, 10);
    }

    if (start > end || start >= totalSize) {
        return "invalid";
    }
    if (end >= totalSize) {
        end = totalSize - 1;
    }
    return { start, end };
}
