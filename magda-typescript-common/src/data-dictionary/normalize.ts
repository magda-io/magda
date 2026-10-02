import {
    DataDictionaryAspect,
    DataDictionaryDimension,
    DataDictionaryEntity,
    DataDictionaryField,
    DataDictionaryGeometry,
    DataDictionaryPropertyProvenance,
    DataDictionaryProvenance,
    DataDictionaryRelationship,
    DataDictionaryRelationshipEndpoint,
    DataDictionaryScalar,
    DataDictionarySource,
    DataDictionaryValueDomain,
    DataDictionaryValueDomainValue
} from "./model.js";

const SUPPORTED_SCHEMA_VERSION_REGEX = /^1(\.[0-9]+)*$/;

/**
 * Whether `schemaVersion` is a data dictionary contract version this code
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

type JsonObject = { [key: string]: unknown };

function isObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

function nonEmptyStr(value: unknown): string | undefined {
    return typeof value === "string" && value.length ? value : undefined;
}

function num(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value)
        ? value
        : undefined;
}

function bool(value: unknown): boolean | undefined {
    return typeof value === "boolean" ? value : undefined;
}

function numOrStr(value: unknown): number | string | undefined {
    return num(value) ?? str(value);
}

function isScalar(value: unknown): value is DataDictionaryScalar {
    return (
        typeof value === "string" ||
        typeof value === "boolean" ||
        num(value) !== undefined
    );
}

function strArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }
    const items = value.filter((item) => typeof item === "string");
    return items.length ? items : undefined;
}

/**
 * Ordered references (key/relationship field paths, dimension IDs) where every
 * element matters: dropping one invalid element would silently change the
 * meaning (e.g. turn a composite key into a different single-field key), so
 * the whole list is dropped instead.
 */
function orderedRefArray(value: unknown): string[] | undefined {
    if (
        !Array.isArray(value) ||
        !value.length ||
        !value.every((item) => typeof item === "string" && item.length)
    ) {
        return undefined;
    }
    return value as string[];
}

function plainObject(value: unknown): JsonObject | undefined {
    return isObject(value) ? value : undefined;
}

/** Arrays of scalar values only (e.g. `enum`, `missingValues`). */
function scalarArray(value: unknown): DataDictionaryScalar[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }
    const items = value.filter(isScalar);
    return items.length ? items : undefined;
}

/** Drop `undefined` values so the result only has meaningful keys. */
function compact<T extends object>(value: T): T {
    Object.keys(value).forEach((key) => {
        if ((value as any)[key] === undefined) {
            delete (value as any)[key];
        }
    });
    return value;
}

function normalizeProvenance(
    value: unknown
): DataDictionaryProvenance | undefined {
    if (!isObject(value)) {
        return undefined;
    }
    const sample = isObject(value.sample)
        ? compact({
              rows: num(value.sample.rows),
              bytes: num(value.sample.bytes),
              strategy: str(value.sample.strategy)
          })
        : undefined;
    return compact({
        method: str(value.method),
        reviewStatus: str(value.reviewStatus),
        generator: str(value.generator),
        generatedAt: str(value.generatedAt),
        sourceType: str(value.sourceType),
        sourceFingerprint: str(value.sourceFingerprint),
        sample,
        reviewedBy: str(value.reviewedBy),
        reviewedAt: str(value.reviewedAt),
        note: str(value.note)
    });
}

function normalizePropertyProvenance(
    value: unknown
): DataDictionaryPropertyProvenance | undefined {
    if (!isObject(value)) {
        return undefined;
    }
    const result: DataDictionaryPropertyProvenance = {};
    Object.keys(value).forEach((property) => {
        const provenance = normalizeProvenance(value[property]);
        if (provenance) {
            result[property] = provenance;
        }
    });
    return Object.keys(result).length ? result : undefined;
}

function normalizeSource(value: unknown): DataDictionarySource | undefined {
    if (!isObject(value)) {
        return undefined;
    }
    return compact({
        type: str(value.type),
        url: str(value.url),
        documentationUrl: str(value.documentationUrl),
        identifier: str(value.identifier),
        version: str(value.version),
        profile: str(value.profile),
        retrievedAt: str(value.retrievedAt),
        fingerprint: str(value.fingerprint)
    });
}

function normalizeValueDomain(
    value: unknown
): DataDictionaryValueDomain | undefined {
    if (!isObject(value)) {
        return undefined;
    }
    const values = Array.isArray(value.values)
        ? value.values
              .filter(
                  (item): item is JsonObject =>
                      isObject(item) && isScalar(item.value)
              )
              .map(
                  (item) =>
                      compact({
                          value: item.value as DataDictionaryScalar,
                          label: str(item.label),
                          description: str(item.description),
                          uri: str(item.uri)
                      }) as DataDictionaryValueDomainValue
              )
        : undefined;
    return compact({
        type: str(value.type),
        name: str(value.name),
        uri: str(value.uri),
        values: values?.length ? values : undefined,
        minimum: numOrStr(value.minimum),
        maximum: numOrStr(value.maximum)
    });
}

function normalizeGeometry(value: unknown): DataDictionaryGeometry | undefined {
    if (!isObject(value)) {
        return undefined;
    }
    return compact({
        type: str(value.type),
        crs: str(value.crs),
        spatialDimension: num(value.spatialDimension),
        fieldPath: nonEmptyStr(value.fieldPath)
    });
}

function normalizeDimension(
    value: unknown
): DataDictionaryDimension | undefined {
    if (!isObject(value) || !nonEmptyStr(value.id)) {
        return undefined;
    }
    return compact({
        id: value.id as string,
        name: str(value.name),
        description: str(value.description),
        size: num(value.size),
        unlimited: bool(value.unlimited),
        semanticConcept: str(value.semanticConcept),
        unit: str(value.unit),
        fieldPath: nonEmptyStr(value.fieldPath),
        provenance: normalizeProvenance(value.provenance),
        propertyProvenance: normalizePropertyProvenance(
            value.propertyProvenance
        )
    });
}

function normalizeField(value: unknown): DataDictionaryField | undefined {
    if (!isObject(value)) {
        return undefined;
    }
    const path = nonEmptyStr(value.path) ?? nonEmptyStr(value.name);
    if (!path) {
        return undefined;
    }
    return compact({
        path,
        name: nonEmptyStr(value.name) ?? path,
        type: nonEmptyStr(value.type) ?? "unknown",
        title: str(value.title),
        sourcePath: str(value.sourcePath),
        sourceIdentifier: str(value.sourceIdentifier),
        roles: strArray(value.roles),
        format: str(value.format),
        sourceType: str(value.sourceType),
        description: str(value.description),
        semanticConcept: str(value.semanticConcept),
        aliases: strArray(value.aliases),
        unit: str(value.unit),
        unitConcept: str(value.unitConcept),
        unitSystem: str(value.unitSystem),
        enum: scalarArray(value.enum),
        valueDomain: normalizeValueDomain(value.valueDomain),
        missingValues: scalarArray(value.missingValues),
        default: isScalar(value.default) ? value.default : undefined,
        example: isScalar(value.example) ? value.example : undefined,
        minimum: numOrStr(value.minimum),
        maximum: numOrStr(value.maximum),
        minLength: num(value.minLength),
        maxLength: num(value.maxLength),
        pattern: str(value.pattern),
        required: bool(value.required),
        nullable: bool(value.nullable),
        unique: bool(value.unique),
        constraints: plainObject(value.constraints),
        dimensions: orderedRefArray(value.dimensions),
        provenance: normalizeProvenance(value.provenance),
        propertyProvenance: normalizePropertyProvenance(
            value.propertyProvenance
        )
    });
}

function normalizeEntity(
    value: unknown,
    idx: number
): DataDictionaryEntity | undefined {
    if (!isObject(value)) {
        return undefined;
    }
    const id = nonEmptyStr(value.id) ?? `entity-${idx}`;
    const fields = Array.isArray(value.fields)
        ? value.fields
              .map(normalizeField)
              .filter((field): field is DataDictionaryField => !!field)
        : [];
    const dimensions = Array.isArray(value.dimensions)
        ? value.dimensions
              .map(normalizeDimension)
              .filter((dim): dim is DataDictionaryDimension => !!dim)
        : [];
    return compact({
        id,
        name: nonEmptyStr(value.name) ?? id,
        description: str(value.description),
        role: str(value.role),
        sourceIdentifier: str(value.sourceIdentifier),
        fields,
        primaryKey: orderedRefArray(value.primaryKey),
        geometry: normalizeGeometry(value.geometry),
        dimensions: dimensions.length ? dimensions : undefined,
        constraints: plainObject(value.constraints),
        provenance: normalizeProvenance(value.provenance),
        propertyProvenance: normalizePropertyProvenance(
            value.propertyProvenance
        )
    });
}

function normalizeEndpoint(
    value: unknown
): DataDictionaryRelationshipEndpoint | undefined {
    if (!isObject(value) || !nonEmptyStr(value.entity)) {
        return undefined;
    }
    const fields = orderedRefArray(value.fields);
    if (!fields) {
        return undefined;
    }
    return { entity: value.entity as string, fields };
}

function normalizeRelationship(
    value: unknown,
    idx: number
): DataDictionaryRelationship | undefined {
    if (!isObject(value)) {
        return undefined;
    }
    const source = normalizeEndpoint(value.source);
    const target = normalizeEndpoint(value.target);
    if (!source || !target) {
        return undefined;
    }
    return compact({
        id: nonEmptyStr(value.id) ?? `relationship-${idx}`,
        type: str(value.type),
        name: str(value.name),
        description: str(value.description),
        source,
        target,
        provenance: normalizeProvenance(value.provenance),
        propertyProvenance: normalizePropertyProvenance(
            value.propertyProvenance
        )
    });
}

/**
 * Defensively convert raw `data-dictionary` aspect data, which the registry may
 * not have validated (schema validation can be disabled), into a value that is
 * safe for display and typed consumption.
 *
 * - Fails closed: returns `undefined` unless the value is an object with a
 *   supported 1.x `schemaVersion` and an `entities` array. A future major
 *   version is never interpreted with v1 semantics.
 * - Deeply sanitizes every documented property: values of the wrong type are
 *   dropped (e.g. a non-string role, a codelist value that is not a scalar, a
 *   relationship endpoint without an entity/field list), nodes without a
 *   usable identity are skipped, and a missing field `type` becomes `unknown`.
 * - Ordered reference lists (`primaryKey`, relationship endpoint `fields`,
 *   field `dimensions`) are kept whole or dropped whole, never shortened, so a
 *   malformed composite key/reference cannot turn into a different one.
 * - Undocumented (extension) properties are not carried over; read the raw
 *   aspect for those.
 *
 * Use `validateDataDictionary()` to report problems instead of hiding them.
 */
export function normalizeDataDictionary(
    aspect: unknown
): DataDictionaryAspect | undefined {
    if (
        !isObject(aspect) ||
        !isSupportedSchemaVersion(aspect.schemaVersion) ||
        !Array.isArray(aspect.entities)
    ) {
        return undefined;
    }
    const entities = aspect.entities
        .map(normalizeEntity)
        .filter((entity): entity is DataDictionaryEntity => !!entity);
    const relationships = Array.isArray(aspect.relationships)
        ? aspect.relationships
              .map(normalizeRelationship)
              .filter((rel): rel is DataDictionaryRelationship => !!rel)
        : [];
    return compact({
        schemaVersion: aspect.schemaVersion,
        source: normalizeSource(aspect.source),
        provenance: normalizeProvenance(aspect.provenance),
        entities,
        relationships: relationships.length ? relationships : undefined
    });
}
