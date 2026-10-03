import {
    DistributionContractAspect,
    DistributionContractAuthentication,
    DistributionContractOperation,
    DistributionContractParameter
} from "./model.js";

/**
 * RFC 6901 JSON Pointer syntax (as in the schema's `jsonPointer` definition):
 * empty (the whole document) or `/`-prefixed reference tokens in which `~` only
 * appears as the escapes `~0` / `~1`.
 */
export const JSON_POINTER_REGEX = /^(\/([^~/]|~[01])*)*$/;

/** Whether a value is a syntactically valid RFC 6901 JSON Pointer. */
export function isValidJsonPointer(value: unknown): value is string {
    return typeof value === "string" && JSON_POINTER_REGEX.test(value);
}

/**
 * HTTP headers that always carry credentials. They must be described in
 * `authentication`, never as operation parameters (the schema rejects them as
 * `header` parameters).
 */
export const CREDENTIAL_HEADER_NAMES = ["authorization", "proxy-authorization"];

/** Whether a `header` parameter with this name always carries credentials. */
export function isCredentialHeaderName(name: unknown): boolean {
    return (
        typeof name === "string" &&
        CREDENTIAL_HEADER_NAMES.indexOf(name.toLowerCase()) !== -1
    );
}

/**
 * Parameter names that commonly carry credentials (API keys, tokens,
 * passwords, session cookies). Matching is a heuristic used for warnings only.
 */
const CREDENTIAL_LIKE_NAME_REGEX = /^(key|token)$|(^|[-_.])(api[-_.]?key|(access|auth|id|refresh|bearer)[-_.]?token|(client[-_.]?)?secret|password|passwd|session[-_.]?id|auth)($|[-_.])/i;

/** Whether a parameter name looks like it carries a credential (heuristic). */
export function isCredentialLikeParameterName(name: unknown): boolean {
    return (
        typeof name === "string" &&
        (isCredentialHeaderName(name) || CREDENTIAL_LIKE_NAME_REGEX.test(name))
    );
}

/** Header names are case-insensitive; other locations are case-sensitive. */
function normalizeParameterName(location: string, name: string): string {
    return location === "header" ? name.toLowerCase() : name;
}

/**
 * The `location` + `name` key of a parameter: unique within an operation.
 * Header names are compared case-insensitively.
 */
export function getParameterLocationKey(
    parameter: Pick<DistributionContractParameter, "location" | "name">
): string {
    return `${parameter.location}:${normalizeParameterName(
        parameter.location,
        parameter.name
    )}`;
}

/**
 * Stable identity of a parameter within its operation, for matching it across
 * re-harvesting / refresh: its native `sourceIdentifier` when present,
 * otherwise its `location` + `name`.
 */
export function getParameterIdentity(
    parameter: Pick<
        DistributionContractParameter,
        "location" | "name" | "sourceIdentifier"
    >
): string {
    return parameter.sourceIdentifier
        ? `sourceIdentifier:${parameter.sourceIdentifier}`
        : `location:${getParameterLocationKey(parameter)}`;
}

/**
 * The authentication description that applies to an operation: its own
 * `authentication` override, otherwise the contract-level default (nearest
 * wins, no merging). Descriptive only: never credentials or authority.
 */
export function getEffectiveAuthentication(
    contract: Pick<DistributionContractAspect, "authentication"> | undefined,
    operation?: Pick<DistributionContractOperation, "authentication">
): DistributionContractAuthentication | undefined {
    return operation?.authentication ?? contract?.authentication;
}

/**
 * Whether a parameter is the credential input described by an `api-key`
 * style authentication (same location and name), i.e. a credential that must
 * not be represented as an ordinary parameter.
 */
export function isAuthenticationParameter(
    parameter: Pick<DistributionContractParameter, "location" | "name">,
    authentication: DistributionContractAuthentication | undefined
): boolean {
    if (
        !authentication ||
        typeof authentication.location !== "string" ||
        typeof authentication.name !== "string" ||
        !authentication.name
    ) {
        return false;
    }
    return (
        getParameterLocationKey(parameter) ===
        getParameterLocationKey({
            location: authentication.location,
            name: authentication.name
        })
    );
}
