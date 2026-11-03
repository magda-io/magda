/**
 * Helpers for defensively normalizing unvalidated Data Understanding aspect
 * data (the registry may not have validated it against the JSON schema).
 */

export type JsonObject = { [key: string]: unknown };

/**
 * Accepted `schemaVersion` values of a version 1 contract: `1` or `1.x`
 * (`1.0`, `1.1`, `1.0.2`, ...). Every built-in Data Understanding schema uses
 * this pattern for `schemaVersion`.
 */
export const SUPPORTED_SCHEMA_VERSION_REGEX = /^1(\.[0-9]+)*$/;

export function isObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.length > 0;
}

export function str(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

export function nonEmptyStr(value: unknown): string | undefined {
    return isNonEmptyString(value) ? value : undefined;
}

export function num(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value)
        ? value
        : undefined;
}

export function bool(value: unknown): boolean | undefined {
    return typeof value === "boolean" ? value : undefined;
}

export function numOrStr(value: unknown): number | string | undefined {
    return num(value) ?? str(value);
}

const MAX_JSON_DEPTH = 64;

/** Whether a value is plain JSON data (as parsed from a registry response). */
export function isJsonValue(value: unknown, depth = 0): boolean {
    if (depth > MAX_JSON_DEPTH) {
        return false;
    }
    if (
        value === null ||
        typeof value === "string" ||
        typeof value === "boolean"
    ) {
        return true;
    }
    if (typeof value === "number") {
        return Number.isFinite(value);
    }
    if (Array.isArray(value)) {
        return value.every((item) => isJsonValue(item, depth + 1));
    }
    if (isObject(value)) {
        return Object.keys(value).every((key) =>
            isJsonValue(value[key], depth + 1)
        );
    }
    return false;
}

/**
 * Arbitrary JSON values (e.g. `default`, `example`), including `null`, objects
 * and arrays: where the schema allows any JSON value, none may be lost.
 */
export function jsonValue(value: unknown): unknown {
    return isJsonValue(value) ? value : undefined;
}

/** Arrays of arbitrary JSON values (e.g. `enum`), kept whole. */
export function jsonArray(value: unknown): unknown[] | undefined {
    return Array.isArray(value) && isJsonValue(value) ? value : undefined;
}

export function plainObject(value: unknown): JsonObject | undefined {
    return isObject(value) ? value : undefined;
}

/** Drop `undefined` values so the result only has meaningful keys. */
export function compact<T extends object>(value: T): T {
    Object.keys(value).forEach((key) => {
        if ((value as any)[key] === undefined) {
            delete (value as any)[key];
        }
    });
    return value;
}

/** Escape one RFC 6901 JSON Pointer reference token. */
export function escapeJsonPointerToken(token: string | number): string {
    return String(token).replace(/~/g, "~0").replace(/\//g, "~1");
}

/** Build an RFC 6901 JSON Pointer from reference tokens. */
export function jsonPointer(...tokens: Array<string | number>): string {
    return tokens.map((token) => "/" + escapeJsonPointerToken(token)).join("");
}
