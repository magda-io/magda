/**
 * Helpers for the normalized `data-dictionary` field path notation.
 *
 * A field path is a stable schema path used for identity/matching and display,
 * not an executable JSONPath/query expression:
 *
 * - object/nested property segments are separated by `.`;
 * - `[]` after a segment means traversal into array items (repeatable for
 *   nested arrays, e.g. `matrix[][]`);
 * - a backslash escapes the next reserved character, so literal `\`, `.`, `[`
 *   and `]` characters in source names must be escaped.
 *
 * Examples:
 *
 * ```text
 * scientificName                 # simple field
 * properties.location.latitude   # nested object
 * items[].measurements[].value   # nested arrays
 * a\.b                           # literal field named "a.b"
 * field\[\]                      # literal field named "field[]"
 * ```
 */

const RESERVED_CHARS = ["\\", ".", "[", "]"];

/**
 * Same grammar as the `fieldPath` definition in
 * `magda-registry-aspects/data-dictionary.schema.json`.
 */
export const FIELD_PATH_REGEX = /^(?:[^\\.\[\]]|\\[\\.\[\]])+(?:\[\])*(?:\.(?:[^\\.\[\]]|\\[\\.\[\]])+(?:\[\])*)*$/;

export interface FieldPathSegment {
    /** Unescaped property name. */
    name: string;
    /** Number of `[]` array traversals following the property. */
    arrayDepth: number;
}

export function isValidFieldPath(path: unknown): path is string {
    return typeof path === "string" && FIELD_PATH_REGEX.test(path);
}

/** Escape a literal source property name for use as one path segment. */
export function escapeFieldPathSegment(name: string): string {
    let result = "";
    for (const char of name) {
        result += RESERVED_CHARS.indexOf(char) !== -1 ? "\\" + char : char;
    }
    return result;
}

/**
 * Parse a normalized field path into unescaped segments.
 * Throws an `Error` when the path is not a valid normalized field path.
 */
export function parseFieldPath(path: string): FieldPathSegment[] {
    if (!isValidFieldPath(path)) {
        throw new Error(`Invalid data dictionary field path: \`${path}\``);
    }
    const segments: FieldPathSegment[] = [];
    let name = "";
    let arrayDepth = 0;
    for (let i = 0; i < path.length; i++) {
        const char = path[i];
        if (char === "\\") {
            name += path[++i];
        } else if (char === "[") {
            // the grammar guarantees `[` is immediately followed by `]`
            arrayDepth++;
            i++;
        } else if (char === ".") {
            segments.push({ name, arrayDepth });
            name = "";
            arrayDepth = 0;
        } else {
            name += char;
        }
    }
    segments.push({ name, arrayDepth });
    return segments;
}

/** Build a normalized field path from (unescaped) segments. */
export function formatFieldPath(
    segments: Array<FieldPathSegment | string>
): string {
    if (!segments?.length) {
        throw new Error("A field path requires at least one segment");
    }
    return segments
        .map((segment) => {
            const { name, arrayDepth } =
                typeof segment === "string"
                    ? { name: segment, arrayDepth: 0 }
                    : segment;
            if (!name) {
                throw new Error("Field path segment names cannot be empty");
            }
            return escapeFieldPathSegment(name) + "[]".repeat(arrayDepth);
        })
        .join(".");
}

/**
 * Normalized path of the parent (containing object) of a field, or `undefined`
 * for a top-level field. E.g. `items[].measurements[].value` →
 * `items[].measurements[]`.
 */
export function getParentFieldPath(path: string): string | undefined {
    const segments = parseFieldPath(path);
    if (segments.length < 2) {
        return undefined;
    }
    return formatFieldPath(segments.slice(0, -1));
}

/** Nesting depth of a field: 0 for top-level fields. */
export function getFieldPathDepth(path: string): number {
    return parseFieldPath(path).length - 1;
}
