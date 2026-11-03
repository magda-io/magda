import {
    DistributionContractAspect,
    DistributionContractAuthentication,
    DistributionContractOperation,
    DistributionContractPagination,
    DistributionContractParameter,
    DistributionContractPropertyProvenance,
    DistributionContractProvenance,
    DistributionContractRequest,
    DistributionContractResponse,
    DistributionContractSourceCapabilities,
    DistributionContractSpecification
} from "./model.js";
import { hasProvenanceStatement } from "./provenance.js";
import {
    isAuthenticationParameter,
    isCredentialHeaderName,
    isValidJsonPointer
} from "./contract.js";
import {
    JsonObject,
    SUPPORTED_SCHEMA_VERSION_REGEX,
    bool,
    compact,
    isObject,
    jsonArray,
    jsonValue,
    nonEmptyStr,
    num,
    numOrStr,
    str
} from "../data-understanding/json.js";

/**
 * Whether `schemaVersion` is a distribution contract version this code
 * understands (any `1.x`). A different major version may change the meaning of
 * existing properties, so it must not be interpreted with v1 semantics.
 */
export function isSupportedSchemaVersion(
    schemaVersion: unknown
): schemaVersion is string {
    return (
        typeof schemaVersion === "string" &&
        SUPPORTED_SCHEMA_VERSION_REGEX.test(schemaVersion)
    );
}

/** String list: non-string items are dropped; an (even empty) array stays an array. */
function strList(value: unknown): string[] | undefined {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : undefined;
}

function nonNegativeInt(value: unknown): number | undefined {
    const n = num(value);
    return n !== undefined && Number.isInteger(n) && n >= 0 ? n : undefined;
}

function jsonPointer(value: unknown): string | undefined {
    return isValidJsonPointer(value) ? value : undefined;
}

/** Nodes of a list without a usable identity are skipped, never repaired. */
function nodeList<T>(
    value: unknown,
    normalizeItem: (item: unknown) => T | undefined
): T[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }
    return value
        .map((item) => normalizeItem(item))
        .filter((item): item is T => item !== undefined);
}

/**
 * Keys of open maps (`propertyProvenance`, `sourceCapabilities`). `__proto__`
 * would set the prototype of the normalized object rather than add a key.
 */
function mapKeys(value: JsonObject): string[] {
    return Object.keys(value).filter((key) => key !== "__proto__");
}

function normalizeProvenance(
    value: unknown
): DistributionContractProvenance | undefined {
    if (!isObject(value)) {
        return undefined;
    }
    const provenance = compact({
        method: str(value.method),
        reviewStatus: str(value.reviewStatus),
        generator: str(value.generator),
        generatedAt: str(value.generatedAt),
        sourceType: str(value.sourceType),
        sourceFingerprint: str(value.sourceFingerprint),
        reviewedBy: str(value.reviewedBy),
        reviewedAt: str(value.reviewedAt),
        note: str(value.note)
    });
    // a provenance object that states neither `method` nor `reviewStatus`
    // (e.g. `{}`) must not mask the provenance inherited from a parent node
    return hasProvenanceStatement(provenance) ? provenance : undefined;
}

function normalizePropertyProvenance(
    value: unknown
): DistributionContractPropertyProvenance | undefined {
    if (!isObject(value)) {
        return undefined;
    }
    const result: DistributionContractPropertyProvenance = {};
    mapKeys(value).forEach((property) => {
        const provenance = normalizeProvenance(value[property]);
        if (provenance) {
            result[property] = provenance;
        }
    });
    return Object.keys(result).length ? result : undefined;
}

function normalizeSpecification(
    value: unknown
): DistributionContractSpecification | undefined {
    if (!isObject(value)) {
        return undefined;
    }
    return compact({
        type: str(value.type),
        url: str(value.url),
        version: str(value.version),
        fingerprint: str(value.fingerprint),
        retrievedAt: str(value.retrievedAt)
    });
}

function normalizeAuthentication(
    value: unknown
): DistributionContractAuthentication | undefined {
    // an object that doesn't state its mechanism (e.g. `{}`) must not mask
    // the contract-level authentication (the schema requires `type`)
    if (!isObject(value) || !nonEmptyStr(value.type)) {
        return undefined;
    }
    // only documented, descriptive properties are carried over: anything else
    // (which must never be a credential, but might be) is not exposed
    return compact({
        type: value.type as string,
        description: str(value.description),
        documentationUrl: str(value.documentationUrl),
        scheme: str(value.scheme),
        location: nonEmptyStr(value.location),
        name: nonEmptyStr(value.name),
        scopes: strList(value.scopes)
    });
}

const DOCUMENTED_CAPABILITY_NORMALIZERS: {
    [key: string]: (value: unknown) => unknown;
} = {
    allowedMethods: strList,
    maximumRecordsPerRequest: nonNegativeInt,
    bulkExportAvailable: bool,
    supportsPagination: bool,
    supportsSpatialFilter: bool,
    supportsTemporalFilter: bool,
    supportsAttributeFilter: bool,
    outputFormats: strList,
    rateLimit: str
};

/**
 * Source capabilities are an open set: documented properties are type-checked
 * and additional capability properties are kept when they are plain JSON.
 */
function normalizeSourceCapabilities(
    value: unknown
): DistributionContractSourceCapabilities | undefined {
    if (!isObject(value)) {
        return undefined;
    }
    const result: JsonObject = {};
    mapKeys(value).forEach((key) => {
        const normalizer = Object.prototype.hasOwnProperty.call(
            DOCUMENTED_CAPABILITY_NORMALIZERS,
            key
        )
            ? DOCUMENTED_CAPABILITY_NORMALIZERS[key]
            : jsonValue;
        const normalized = normalizer(value[key]);
        if (normalized !== undefined) {
            result[key] = normalized;
        }
    });
    return result as DistributionContractSourceCapabilities;
}

function normalizeParameter(
    value: unknown
): DistributionContractParameter | undefined {
    if (!isObject(value)) {
        return undefined;
    }
    // `location` + `name` is the parameter's identity (unless it has a
    // `sourceIdentifier`) and is needed to invoke it: never guess either
    const name = nonEmptyStr(value.name);
    const location = nonEmptyStr(value.location);
    if (!name || !location) {
        return undefined;
    }
    // credential-bearing headers are not parameters (the schema rejects them)
    if (location === "header" && isCredentialHeaderName(name)) {
        return undefined;
    }
    return compact({
        name,
        sourceIdentifier: nonEmptyStr(value.sourceIdentifier),
        location,
        type: nonEmptyStr(value.type) ?? "unknown",
        format: str(value.format),
        description: str(value.description),
        required: bool(value.required),
        default: jsonValue(value.default),
        example: jsonValue(value.example),
        enum: jsonArray(value.enum),
        minimum: numOrStr(value.minimum),
        maximum: numOrStr(value.maximum),
        minLength: nonNegativeInt(value.minLength),
        maxLength: nonNegativeInt(value.maxLength),
        pattern: str(value.pattern),
        unit: str(value.unit),
        provenance: normalizeProvenance(value.provenance),
        propertyProvenance: normalizePropertyProvenance(
            value.propertyProvenance
        )
    });
}

function normalizePagination(
    value: unknown
): DistributionContractPagination | undefined {
    if (!isObject(value)) {
        return undefined;
    }
    return compact({
        type: str(value.type),
        limitParameter: nonEmptyStr(value.limitParameter),
        offsetParameter: nonEmptyStr(value.offsetParameter),
        pageParameter: nonEmptyStr(value.pageParameter),
        cursorParameter: nonEmptyStr(value.cursorParameter),
        nextCursorPath: jsonPointer(value.nextCursorPath),
        nextLinkPath: jsonPointer(value.nextLinkPath),
        nextLinkRelation: str(value.nextLinkRelation),
        totalPath: jsonPointer(value.totalPath)
    });
}

function normalizeRequest(
    value: unknown
): DistributionContractRequest | undefined {
    if (!isObject(value)) {
        return undefined;
    }
    return compact({
        required: bool(value.required),
        mediaTypes: strList(value.mediaTypes),
        dictionaryEntity: nonEmptyStr(value.dictionaryEntity),
        description: str(value.description)
    });
}

function normalizeResponse(
    value: unknown
): DistributionContractResponse | undefined {
    if (!isObject(value)) {
        return undefined;
    }
    const statusCodes = Array.isArray(value.statusCodes)
        ? value.statusCodes.filter(
              (code): code is number | string =>
                  typeof code === "string" ||
                  (num(code) !== undefined && Number.isInteger(code))
          )
        : undefined;
    return compact({
        mediaTypes: strList(value.mediaTypes),
        statusCodes,
        recordsPath: jsonPointer(value.recordsPath),
        dictionaryEntity: nonEmptyStr(value.dictionaryEntity),
        pagination: normalizePagination(value.pagination),
        description: str(value.description)
    });
}

function normalizeOperation(
    value: unknown,
    contractAuthentication: DistributionContractAuthentication | undefined
): DistributionContractOperation | undefined {
    if (!isObject(value)) {
        return undefined;
    }
    // `id` is the operation's stable identity (for refresh/merge and tool
    // derivation): never invent one
    const id = nonEmptyStr(value.id);
    if (!id) {
        return undefined;
    }
    const authentication = normalizeAuthentication(value.authentication);
    const effectiveAuthentication = authentication ?? contractAuthentication;
    // the credential input `authentication` describes (e.g. an API key
    // header) is never an ordinary parameter: tools/agents derived from the
    // normalized contract must not see it as one
    const parameters = nodeList(value.parameters, normalizeParameter)?.filter(
        (parameter) =>
            !isAuthenticationParameter(parameter, effectiveAuthentication)
    );
    return compact({
        id,
        sourceIdentifier: nonEmptyStr(value.sourceIdentifier),
        label: str(value.label),
        purpose: str(value.purpose),
        interactionType: str(value.interactionType),
        method: str(value.method),
        path: str(value.path),
        endpointUrl: str(value.endpointUrl),
        parameters,
        authentication,
        request: normalizeRequest(value.request),
        response: normalizeResponse(value.response),
        sourceCapabilities: normalizeSourceCapabilities(
            value.sourceCapabilities
        ),
        interactiveExampleCandidate: bool(value.interactiveExampleCandidate),
        provenance: normalizeProvenance(value.provenance),
        propertyProvenance: normalizePropertyProvenance(
            value.propertyProvenance
        )
    });
}

/**
 * Defensively convert raw `distribution-contract` aspect data, which the
 * registry may not have validated (schema validation can be disabled), into a
 * value that is safe for display and typed consumption.
 *
 * - Fails closed: returns `undefined` unless the value is an object with a
 *   supported 1.x `schemaVersion`. A future major version is never
 *   interpreted with v1 semantics.
 * - Deeply sanitizes every documented property: values of the wrong type are
 *   dropped (e.g. a non-string protocol, an invalid JSON Pointer, a
 *   non-boolean capability flag) and a missing parameter `type` becomes
 *   `unknown`. Properties the schema allows to hold any JSON value
 *   (parameter `default`, `example` and `enum`, additional
 *   `sourceCapabilities`) are kept as-is.
 * - Never invents identities: operations without a non-empty `id`, and
 *   parameters without a non-empty `name` and `location`, are skipped. Empty
 *   `sourceIdentifier`s (which the schema rejects) are dropped, so identity
 *   falls back to `location` + `name`.
 * - Never exposes credential inputs as parameters: drops `Authorization` /
 *   `Proxy-Authorization` header parameters (which the schema rejects) and
 *   parameters that are the input the operation's effective `authentication`
 *   describes (same `location` + `name`). The latter is the one schema-valid
 *   value it drops; `validateDistributionContract()` reports it.
 * - Authentication objects without a `type` are dropped, so they cannot mask
 *   the contract-level authentication; only documented, descriptive
 *   authentication properties are kept.
 * - Provenance objects stating neither `method` nor `reviewStatus` are
 *   dropped, so they cannot mask inherited provenance.
 * - Undocumented (extension) properties are not carried over, except in the
 *   open `sourceCapabilities` set; read the raw aspect for those.
 *
 * Use `validateDistributionContract()` to report problems instead of hiding
 * them.
 */
export function normalizeDistributionContract(
    aspect: unknown
): DistributionContractAspect | undefined {
    if (!isObject(aspect) || !isSupportedSchemaVersion(aspect.schemaVersion)) {
        return undefined;
    }
    const authentication = normalizeAuthentication(aspect.authentication);
    return compact({
        schemaVersion: aspect.schemaVersion,
        resourceRole: str(aspect.resourceRole),
        accessMode: str(aspect.accessMode),
        protocol: str(aspect.protocol),
        endpointUrl: str(aspect.endpointUrl),
        documentationUrl: str(aspect.documentationUrl),
        specification: normalizeSpecification(aspect.specification),
        authentication,
        operations: nodeList(aspect.operations, (operation) =>
            normalizeOperation(operation, authentication)
        ),
        sourceCapabilities: normalizeSourceCapabilities(
            aspect.sourceCapabilities
        ),
        provenance: normalizeProvenance(aspect.provenance),
        lastVerified: str(aspect.lastVerified)
    });
}
