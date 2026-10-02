/**
 * Typed model of the built-in `data-dictionary` distribution aspect.
 *
 * JSON Schema: `magda-registry-aspects/data-dictionary.schema.json`
 * Design: `docs/design/data-dictionary-design.md`
 *
 * The aspect is a compact, normalized logical projection of a distribution's
 * structure. Native schemas (JSON Schema, OpenAPI, ArcGIS, CF/netCDF, Parquet,
 * ...) stay authoritative for anything the normalized model does not carry.
 *
 * Within schema version 1 the contract only grows additively: consumers must
 * tolerate unknown properties and unknown values of the open vocabularies below.
 */

/** Registry aspect ID of the data dictionary aspect. */
export const DATA_DICTIONARY_ASPECT_ID = "data-dictionary";

/** Current (initial) normalized data dictionary contract version. */
export const DATA_DICTIONARY_SCHEMA_VERSION = "1.0";

/**
 * An open vocabulary: the listed values are documented, but any other string is
 * permitted. (`string & {}` keeps editor auto-completion for the known values.)
 */
export type OpenVocabulary<T extends string> = T | (string & {});

export type DataDictionaryProvenanceMethod = OpenVocabulary<
    | "authoritative-import"
    | "harvested"
    | "inferred"
    | "manual"
    | "agent-generated"
>;

export const DATA_DICTIONARY_PROVENANCE_METHODS = [
    "authoritative-import",
    "harvested",
    "inferred",
    "manual",
    "agent-generated"
] as const;

export type DataDictionaryReviewStatus = OpenVocabulary<
    "unreviewed" | "reviewed" | "custodian-approved" | "rejected"
>;

export const DATA_DICTIONARY_REVIEW_STATUSES = [
    "unreviewed",
    "reviewed",
    "custodian-approved",
    "rejected"
] as const;

export type DataDictionaryFieldType = OpenVocabulary<
    | "string"
    | "integer"
    | "number"
    | "boolean"
    | "date"
    | "datetime"
    | "time"
    | "object"
    | "array"
    | "geometry"
    | "binary"
    | "unknown"
>;

export const DATA_DICTIONARY_FIELD_TYPES = [
    "string",
    "integer",
    "number",
    "boolean",
    "date",
    "datetime",
    "time",
    "object",
    "array",
    "geometry",
    "binary",
    "unknown"
] as const;

export type DataDictionaryEntityRole = OpenVocabulary<
    | "table"
    | "sheet"
    | "response-record"
    | "response-envelope"
    | "request-body"
    | "feature"
    | "database-table"
    | "variable-set"
    | "other"
>;

export type DataDictionaryFieldRole = OpenVocabulary<
    | "identifier"
    | "reference"
    | "primary-geometry"
    | "primary-temporal"
    | "coordinate"
    | "data-variable"
>;

export type DataDictionarySourceType = OpenVocabulary<
    | "frictionless-table-schema"
    | "csvw"
    | "openapi"
    | "json-schema"
    | "arcgis-layer-definition"
    | "ogc-schema"
    | "stac"
    | "netcdf-metadata"
    | "parquet-schema"
    | "file-inspection"
    | "sample-inference"
    | "manual"
    | "agent-inspection"
>;

/** The schema/metadata source used to build the dictionary. */
export interface DataDictionarySource {
    type?: DataDictionarySourceType;
    /** URL of the native schema/specification/metadata document. */
    url?: string;
    /** URL of human-readable documentation of the source structure. */
    documentationUrl?: string;
    /** Native identifier of the source schema/document. */
    identifier?: string;
    /** Native version of the source schema/document. */
    version?: string;
    /** Schema language/profile identifier, e.g. `csvw`, `CF-1.8`. */
    profile?: string;
    /** ISO 8601 / RFC 3339 date-time. */
    retrievedAt?: string;
    /** Fingerprint of the native source structure, e.g. `sha256:<hex>`. */
    fingerprint?: string;
    [key: string]: unknown;
}

export interface DataDictionarySample {
    rows?: number;
    bytes?: number;
    strategy?: string;
    [key: string]: unknown;
}

/**
 * How metadata was produced/curated and its review state.
 *
 * Inheritance is "nearest wins" without merging: a property-level override
 * replaces the node's provenance for that property, a node's `provenance`
 * replaces its parent's, and the dictionary-level provenance is the default.
 */
export interface DataDictionaryProvenance {
    method?: DataDictionaryProvenanceMethod;
    reviewStatus?: DataDictionaryReviewStatus;
    generator?: string;
    /** ISO 8601 / RFC 3339 date-time. */
    generatedAt?: string;
    sourceType?: DataDictionarySourceType;
    /** Fingerprint of the native source this was generated from / reviewed against. */
    sourceFingerprint?: string;
    /** Sample extent. Required in practice for sample-based inference. */
    sample?: DataDictionarySample;
    reviewedBy?: string;
    /** ISO 8601 / RFC 3339 date-time. */
    reviewedAt?: string;
    note?: string;
    [key: string]: unknown;
}

/** Property-level provenance overrides keyed by direct property name. */
export type DataDictionaryPropertyProvenance = {
    [propertyName: string]: DataDictionaryProvenance;
};

/**
 * A change a producer could not apply safely (e.g. it would overwrite manual or
 * reviewed metadata after source drift, or the mapping is ambiguous).
 */
export interface DataDictionaryConflict {
    /** Affected direct property; omitted when the whole node is affected. */
    property?: string;
    reason?: OpenVocabulary<
        | "source-changed"
        | "source-removed"
        | "ambiguous-mapping"
        | "type-changed"
    >;
    candidateValue?: unknown;
    detectedAt?: string;
    generator?: string;
    sourceFingerprint?: string;
    note?: string;
    [key: string]: unknown;
}

/** Properties shared by every node that can carry its own provenance. */
export interface DataDictionaryProvenanceAware {
    provenance?: DataDictionaryProvenance;
    propertyProvenance?: DataDictionaryPropertyProvenance;
}

export type DataDictionaryScalar = string | number | boolean;

export interface DataDictionaryValueDomainValue {
    value: DataDictionaryScalar;
    label?: string;
    description?: string;
    uri?: string;
    [key: string]: unknown;
}

export interface DataDictionaryValueDomain {
    type?: OpenVocabulary<"codelist" | "range">;
    name?: string;
    /** URI of an authoritative external code list/vocabulary. */
    uri?: string;
    values?: DataDictionaryValueDomainValue[];
    minimum?: number | string;
    maximum?: number | string;
    [key: string]: unknown;
}

export interface DataDictionaryGeometry {
    type?: string;
    crs?: string;
    spatialDimension?: number;
    fieldPath?: string;
    [key: string]: unknown;
}

export interface DataDictionaryDimension extends DataDictionaryProvenanceAware {
    /** Unique within the entity; referenced by `DataDictionaryField.dimensions`. */
    id: string;
    name?: string;
    description?: string;
    size?: number;
    unlimited?: boolean;
    semanticConcept?: string;
    unit?: string;
    /** Path of the coordinate variable describing this axis. */
    fieldPath?: string;
    [key: string]: unknown;
}

export interface DataDictionaryField extends DataDictionaryProvenanceAware {
    /** Stable normalized path, unique within the entity. See `fieldPath.ts`. */
    path: string;
    /** Display/source name (exact column name for flat tabular sources). */
    name: string;
    type: DataDictionaryFieldType;
    title?: string;
    sourcePath?: string;
    sourceIdentifier?: string;
    roles?: DataDictionaryFieldRole[];
    format?: string;
    sourceType?: string;
    description?: string;
    semanticConcept?: string;
    aliases?: string[];
    unit?: string;
    unitConcept?: string;
    unitSystem?: string;
    enum?: unknown[];
    valueDomain?: DataDictionaryValueDomain;
    missingValues?: unknown[];
    default?: unknown;
    example?: unknown;
    minimum?: number | string;
    maximum?: number | string;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    required?: boolean;
    nullable?: boolean;
    unique?: boolean;
    constraints?: { [key: string]: unknown };
    /** Ordered IDs of the entity's `dimensions`. */
    dimensions?: string[];
    conflicts?: DataDictionaryConflict[];
    [key: string]: unknown;
}

export interface DataDictionaryEntity extends DataDictionaryProvenanceAware {
    /** Unique and stable within the dictionary. */
    id: string;
    name: string;
    description?: string;
    role?: DataDictionaryEntityRole;
    sourceIdentifier?: string;
    fields: DataDictionaryField[];
    /** Ordered field paths of a single or composite primary key. */
    primaryKey?: string[];
    geometry?: DataDictionaryGeometry;
    dimensions?: DataDictionaryDimension[];
    constraints?: { [key: string]: unknown };
    conflicts?: DataDictionaryConflict[];
    [key: string]: unknown;
}

export interface DataDictionaryRelationshipEndpoint {
    /** ID of an entity in the same dictionary. */
    entity: string;
    /** Ordered field paths (same order on both sides for composite references). */
    fields: string[];
    [key: string]: unknown;
}

export interface DataDictionaryRelationship
    extends DataDictionaryProvenanceAware {
    id: string;
    /** Defaults to `foreign-key` when omitted. */
    type?: OpenVocabulary<"foreign-key" | "reference">;
    name?: string;
    description?: string;
    source: DataDictionaryRelationshipEndpoint;
    target: DataDictionaryRelationshipEndpoint;
    conflicts?: DataDictionaryConflict[];
    [key: string]: unknown;
}

/** Payload of the `data-dictionary` aspect. */
export interface DataDictionaryAspect {
    /** `1.0` initially; any `1.x` is compatible. */
    schemaVersion: string;
    source?: DataDictionarySource;
    provenance?: DataDictionaryProvenance;
    entities: DataDictionaryEntity[];
    relationships?: DataDictionaryRelationship[];
    [key: string]: unknown;
}
