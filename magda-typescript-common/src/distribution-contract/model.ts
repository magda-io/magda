/**
 * Typed model of the built-in `distribution-contract` distribution aspect.
 *
 * JSON Schema: `magda-registry-aspects/distribution-contract.schema.json`
 * Design: `docs/design/distribution-contract-design.md`
 *
 * The aspect is a compact, normalized description of how a distribution can be
 * accessed or queried. Native specifications (OpenAPI, ArcGIS service
 * definitions, OGC capabilities, STAC, ...) stay authoritative for anything the
 * normalized model does not carry.
 *
 * The contract is descriptive metadata, not execution authority: an operation
 * being described (or marked `interactiveExampleCandidate`) never authorizes
 * executing it. It never contains credentials, API keys, tokens, cookies or
 * other secret material.
 *
 * Within schema version 1 the contract only grows additively: consumers must
 * tolerate unknown properties and unknown values of the open vocabularies below.
 */

import {
    OpenVocabulary,
    ProvenanceMethod,
    ProvenanceReviewStatus
} from "../data-understanding/provenance.js";

export type { OpenVocabulary } from "../data-understanding/provenance.js";

/** Registry aspect ID of the distribution contract aspect. */
export const DISTRIBUTION_CONTRACT_ASPECT_ID = "distribution-contract";

/** Current (initial) normalized distribution contract version. */
export const DISTRIBUTION_CONTRACT_SCHEMA_VERSION = "1.0";

export type DistributionContractResourceRole = OpenVocabulary<
    | "download"
    | "data-service"
    | "metadata-service"
    | "query-service"
    | "stream"
    | "other"
>;

export type DistributionContractAccessMode = OpenVocabulary<
    | "public-download"
    | "public-query"
    | "authenticated-query"
    | "query-only"
    | "restricted"
    | "manual-request"
>;

export type DistributionContractProtocol = OpenVocabulary<
    | "HTTP"
    | "REST"
    | "ArcGIS Feature Service"
    | "ArcGIS Map Service"
    | "OGC API Features"
    | "WFS"
    | "WMS"
    | "STAC"
    | "GraphQL"
    | "SQL"
    | "other"
>;

export type DistributionContractProvenanceMethod = ProvenanceMethod;

export const DISTRIBUTION_CONTRACT_PROVENANCE_METHODS = [
    "authoritative-import",
    "harvested",
    "manual",
    "agent-generated",
    "inferred"
] as const;

export type DistributionContractReviewStatus = ProvenanceReviewStatus;

export const DISTRIBUTION_CONTRACT_REVIEW_STATUSES = [
    "unreviewed",
    "reviewed",
    "custodian-approved",
    "rejected"
] as const;

export type DistributionContractInteractionType = OpenVocabulary<
    | "query"
    | "download"
    | "read"
    | "create"
    | "update"
    | "delete"
    | "action"
    | "unknown"
>;

export type DistributionContractParameterLocation = OpenVocabulary<
    "path" | "query" | "header" | "cookie"
>;

export const DISTRIBUTION_CONTRACT_PARAMETER_LOCATIONS = [
    "path",
    "query",
    "header",
    "cookie"
] as const;

/** Normalized logical parameter types, aligned with `data-dictionary` field types. */
export type DistributionContractParameterType = OpenVocabulary<
    | "string"
    | "integer"
    | "number"
    | "boolean"
    | "date"
    | "datetime"
    | "time"
    | "unknown"
>;

export type DistributionContractAuthenticationType = OpenVocabulary<
    | "none"
    | "api-key"
    | "http-basic"
    | "http-bearer"
    | "oauth2"
    | "openid-connect"
    | "mutual-tls"
    | "custodian-approval"
    | "other"
>;

export type DistributionContractPaginationType = OpenVocabulary<
    "offset-limit" | "page" | "cursor" | "next-link" | "none"
>;

export type DistributionContractSpecificationType = OpenVocabulary<
    | "openapi"
    | "json-schema"
    | "arcgis-service-definition"
    | "ogc-capabilities"
    | "ogc-api"
    | "stac"
    | "other"
>;

/**
 * How metadata was produced/curated and its review state.
 *
 * Inheritance is "nearest wins" without merging: a property-level override
 * replaces the node's provenance for that property, a parameter's `provenance`
 * replaces its operation's, an operation's replaces the contract's, and the
 * contract-level provenance is the default.
 *
 * The schema requires `method` and/or `reviewStatus`: only such objects
 * override inherited provenance.
 */
export interface DistributionContractProvenance {
    method?: DistributionContractProvenanceMethod;
    reviewStatus?: DistributionContractReviewStatus;
    generator?: string;
    /** ISO 8601 / RFC 3339 date-time. */
    generatedAt?: string;
    sourceType?: string;
    /** Fingerprint of the native source this was generated from / reviewed against. */
    sourceFingerprint?: string;
    reviewedBy?: string;
    /** ISO 8601 / RFC 3339 date-time. */
    reviewedAt?: string;
    note?: string;
    [key: string]: unknown;
}

/** Property-level provenance overrides keyed by direct property name. */
export type DistributionContractPropertyProvenance = {
    [propertyName: string]: DistributionContractProvenance;
};

/** Properties shared by every node that can carry its own provenance. */
export interface DistributionContractProvenanceAware {
    provenance?: DistributionContractProvenance;
    propertyProvenance?: DistributionContractPropertyProvenance;
}

/** Pointer to the authoritative native specification. */
export interface DistributionContractSpecification {
    type?: DistributionContractSpecificationType;
    url?: string;
    version?: string;
    /** Fingerprint of the retrieved specification, e.g. `sha256:<hex>`. */
    fingerprint?: string;
    /** ISO 8601 / RFC 3339 date-time. */
    retrievedAt?: string;
    [key: string]: unknown;
}

/**
 * Descriptive authentication metadata. Never contains credential values: it
 * names the mechanism (and, for API keys, where the key is sent), and a
 * separate execution/delegation system resolves actual credentials.
 */
export interface DistributionContractAuthentication {
    type?: DistributionContractAuthenticationType;
    description?: string;
    documentationUrl?: string;
    /** e.g. the HTTP `Authorization` scheme `Bearer` / `Basic`. */
    scheme?: string;
    /** Where an API key is sent: `header`, `query` or `cookie`. */
    location?: DistributionContractParameterLocation;
    /** Name (never the value) of the header/query parameter/cookie carrying the credential. */
    name?: string;
    /** Non-secret scopes, e.g. OAuth scopes. */
    scopes?: string[];
    [key: string]: unknown;
}

/**
 * What the remote source reports it supports/restricts. Facts about the
 * source, not Magda execution policy. Additional capability properties (any
 * JSON value) are allowed and preserved.
 */
export interface DistributionContractSourceCapabilities {
    allowedMethods?: string[];
    maximumRecordsPerRequest?: number;
    bulkExportAvailable?: boolean;
    supportsPagination?: boolean;
    supportsSpatialFilter?: boolean;
    supportsTemporalFilter?: boolean;
    supportsAttributeFilter?: boolean;
    outputFormats?: string[];
    rateLimit?: string;
    [key: string]: unknown;
}

/**
 * A scalar invocation parameter. Identified by `sourceIdentifier` where
 * available, otherwise by `location` + `name` (see `getParameterIdentity`).
 * Credential-bearing inputs are never parameters: see `authentication`.
 */
export interface DistributionContractParameter
    extends DistributionContractProvenanceAware {
    name: string;
    sourceIdentifier?: string;
    location: DistributionContractParameterLocation;
    type: DistributionContractParameterType;
    format?: string;
    description?: string;
    required?: boolean;
    default?: unknown;
    example?: unknown;
    enum?: unknown[];
    minimum?: number | string;
    maximum?: number | string;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    unit?: string;
    [key: string]: unknown;
}

/**
 * Descriptive pagination hints. `*Parameter` properties name a `query`
 * parameter of the same operation; `*Path` properties are RFC 6901 JSON
 * Pointers into the JSON response.
 */
export interface DistributionContractPagination {
    type?: DistributionContractPaginationType;
    limitParameter?: string;
    offsetParameter?: string;
    pageParameter?: string;
    cursorParameter?: string;
    nextCursorPath?: string;
    nextLinkPath?: string;
    /** Link relation (e.g. `next`) of the next-page entry in a response `links` array. */
    nextLinkRelation?: string;
    totalPath?: string;
    [key: string]: unknown;
}

export const PAGINATION_PARAMETER_PROPERTIES = [
    "limitParameter",
    "offsetParameter",
    "pageParameter",
    "cursorParameter"
] as const;

export const PAGINATION_PATH_PROPERTIES = [
    "nextCursorPath",
    "nextLinkPath",
    "totalPath"
] as const;

export interface DistributionContractRequest {
    required?: boolean;
    mediaTypes?: string[];
    /** ID of an entity in the same distribution's `data-dictionary`. */
    dictionaryEntity?: string;
    description?: string;
    [key: string]: unknown;
}

export interface DistributionContractResponse {
    mediaTypes?: string[];
    /** e.g. `200` or an OpenAPI range such as `2XX`. */
    statusCodes?: Array<number | string>;
    /** RFC 6901 JSON Pointer to the records in a JSON response. */
    recordsPath?: string;
    /** ID of an entity in the same distribution's `data-dictionary`. */
    dictionaryEntity?: string;
    pagination?: DistributionContractPagination;
    description?: string;
    [key: string]: unknown;
}

export interface DistributionContractOperation
    extends DistributionContractProvenanceAware {
    /** Unique and stable within the contract. */
    id: string;
    /** Stable native operation identifier, e.g. an OpenAPI `operationId`. */
    sourceIdentifier?: string;
    label?: string;
    purpose?: string;
    /** Descriptive only; never execution authority. */
    interactionType?: DistributionContractInteractionType;
    method?: string;
    /**
     * Native operation path. Only a protocol-aware adapter may combine it with
     * the contract `endpointUrl`: never concatenate them generically.
     */
    path?: string;
    /** Fully resolved operation URL, when known. */
    endpointUrl?: string;
    parameters?: DistributionContractParameter[];
    /** Overrides the contract-level `authentication` for this operation. */
    authentication?: DistributionContractAuthentication;
    request?: DistributionContractRequest;
    response?: DistributionContractResponse;
    sourceCapabilities?: DistributionContractSourceCapabilities;
    /** Advisory hint only; never execution authority. */
    interactiveExampleCandidate?: boolean;
    [key: string]: unknown;
}

/** Payload of the `distribution-contract` aspect. */
export interface DistributionContractAspect {
    /** `1.0` initially; any `1.x` is compatible. */
    schemaVersion: string;
    resourceRole?: DistributionContractResourceRole;
    accessMode?: DistributionContractAccessMode;
    protocol?: DistributionContractProtocol;
    endpointUrl?: string;
    documentationUrl?: string;
    specification?: DistributionContractSpecification;
    authentication?: DistributionContractAuthentication;
    operations?: DistributionContractOperation[];
    sourceCapabilities?: DistributionContractSourceCapabilities;
    provenance?: DistributionContractProvenance;
    /** ISO 8601 / RFC 3339 date-time of the last successful check. */
    lastVerified?: string;
    [key: string]: unknown;
}
