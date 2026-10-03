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
import { isValidFieldPath, parseFieldPath } from "./fieldPath.js";
import { hasProvenanceStatement } from "./provenance.js";
import {
    JsonObject,
    SUPPORTED_SCHEMA_VERSION_REGEX,
    bool,
    compact,
    isNonEmptyString,
    isObject,
    jsonArray,
    jsonValue,
    nonEmptyStr,
    num,
    numOrStr,
    plainObject,
    str
} from "../data-understanding/json.js";

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

function fieldPath(value: unknown): string | undefined {
    return isValidFieldPath(value) ? value : undefined;
}

/**
 * Ordered references (key/relationship field paths, dimension IDs) where every
 * element matters: dropping one invalid element would silently change the
 * meaning (e.g. turn a composite key into a different single-field key), so
 * the whole list is dropped instead.
 */
function orderedRefArray(
    value: unknown,
    isValidItem: (item: unknown) => boolean
): string[] | undefined {
    if (!Array.isArray(value) || !value.length || !value.every(isValidItem)) {
        return undefined;
    }
    return value as string[];
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
    const provenance = compact({
        method: str(value.method),
        reviewStatus: str(value.reviewStatus),
        generator: str(value.generator),
        generatedAt: str(value.generatedAt),
        sourceType: str(value.sourceType),
        sourceFingerprint: str(value.sourceFingerprint),
        sample: sample && Object.keys(sample).length ? sample : undefined,
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
        fieldPath: fieldPath(value.fieldPath)
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
        fieldPath: fieldPath(value.fieldPath),
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
    // `path` is the field's identity: never guess it (e.g. from `name`, which
    // may contain reserved characters such as a flat column named `a.b`)
    const path = fieldPath(value.path);
    if (!path) {
        return undefined;
    }
    const segments = parseFieldPath(path);
    return compact({
        path,
        // display/source name; default to the unescaped last path segment, as
        // in the design's examples (`location.latitude` → `latitude`)
        name: nonEmptyStr(value.name) ?? segments[segments.length - 1].name,
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
        enum: jsonArray(value.enum),
        valueDomain: normalizeValueDomain(value.valueDomain),
        missingValues: jsonArray(value.missingValues),
        default: jsonValue(value.default),
        example: jsonValue(value.example),
        minimum: numOrStr(value.minimum),
        maximum: numOrStr(value.maximum),
        minLength: num(value.minLength),
        maxLength: num(value.maxLength),
        pattern: str(value.pattern),
        required: bool(value.required),
        nullable: bool(value.nullable),
        unique: bool(value.unique),
        constraints: plainObject(value.constraints),
        dimensions: orderedRefArray(value.dimensions, isNonEmptyString),
        provenance: normalizeProvenance(value.provenance),
        propertyProvenance: normalizePropertyProvenance(
            value.propertyProvenance
        )
    });
}

function normalizeEntity(value: unknown): DataDictionaryEntity | undefined {
    if (!isObject(value)) {
        return undefined;
    }
    // `id` is the entity's identity (referenced by relationships and
    // `distribution-contract`): never invent one
    const id = nonEmptyStr(value.id);
    if (!id) {
        return undefined;
    }
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
        primaryKey: orderedRefArray(value.primaryKey, isValidFieldPath),
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
    const fields = orderedRefArray(value.fields, isValidFieldPath);
    if (!fields) {
        return undefined;
    }
    return { entity: value.entity as string, fields };
}

function normalizeRelationship(
    value: unknown
): DataDictionaryRelationship | undefined {
    if (!isObject(value) || !nonEmptyStr(value.id)) {
        return undefined;
    }
    const source = normalizeEndpoint(value.source);
    const target = normalizeEndpoint(value.target);
    if (!source || !target) {
        return undefined;
    }
    return compact({
        id: value.id as string,
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
 *   relationship endpoint without an entity/field list) and a missing field
 *   `type` becomes `unknown`. Properties the schema allows to hold any JSON
 *   value (`enum`, `missingValues`, `default`, `example`) are kept as-is.
 * - Never invents identities: entities and relationships without a non-empty
 *   `id`, and fields without a valid normalized `path`, are skipped. (Display
 *   labels are filled in: a missing entity `name` becomes its `id`, a missing
 *   field `name` the unescaped last path segment.)
 * - Provenance objects stating neither `method` nor `reviewStatus` are
 *   dropped, so they cannot mask inherited provenance.
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
        .map((entity) => normalizeEntity(entity))
        .filter((entity): entity is DataDictionaryEntity => !!entity);
    const relationships = Array.isArray(aspect.relationships)
        ? aspect.relationships
              .map((rel) => normalizeRelationship(rel))
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
