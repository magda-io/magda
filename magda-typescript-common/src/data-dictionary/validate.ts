import {
    DataDictionaryAspect,
    DataDictionaryEntity,
    DataDictionaryField
} from "./model.js";
import { isValidFieldPath } from "./fieldPath.js";

export type DataDictionaryIssueSeverity = "error" | "warning";

export interface DataDictionaryIssue {
    severity: DataDictionaryIssueSeverity;
    /** Machine-readable issue code, e.g. `duplicate-entity-id`. */
    code: string;
    message: string;
    /** JSON Pointer (RFC 6901) to the offending location in the aspect. */
    location: string;
}

function isObject(value: unknown): value is { [key: string]: any } {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.length > 0;
}

function pointerToken(token: string | number): string {
    return String(token).replace(/~/g, "~0").replace(/\//g, "~1");
}

function pointer(...tokens: Array<string | number>): string {
    return tokens.map((token) => "/" + pointerToken(token)).join("");
}

/**
 * Check the cross-reference integrity of a `data-dictionary` aspect: the rules
 * a JSON Schema cannot express. Run it in addition to (not instead of) JSON
 * Schema validation against `data-dictionary.schema.json`.
 *
 * Errors:
 * - unsupported `schemaVersion` major version;
 * - invalid field paths;
 * - duplicate entity IDs, duplicate field paths within an entity, duplicate
 *   dimension IDs within an entity or duplicate relationship IDs;
 * - `primaryKey` paths that are not fields of the entity;
 * - field `dimensions` that are not dimensions of the entity;
 * - relationships referencing unknown entities/fields, or with source/target
 *   field lists of different lengths.
 *
 * Warnings:
 * - `geometry.fieldPath` / `dimensions[].fieldPath` that are not fields of the
 *   entity.
 *
 * Returns an empty array when no issue is found.
 */
export function validateDataDictionary(aspect: unknown): DataDictionaryIssue[] {
    const issues: DataDictionaryIssue[] = [];
    const error = (code: string, message: string, location: string) =>
        issues.push({ severity: "error", code, message, location });
    const warning = (code: string, message: string, location: string) =>
        issues.push({ severity: "warning", code, message, location });

    if (!isObject(aspect)) {
        error("invalid-aspect", "The aspect must be a JSON object", "");
        return issues;
    }

    if (!isNonEmptyString(aspect.schemaVersion)) {
        error(
            "missing-schema-version",
            "`schemaVersion` is required",
            pointer("schemaVersion")
        );
    } else if (!/^1(\.[0-9]+)*$/.test(aspect.schemaVersion)) {
        error(
            "unsupported-schema-version",
            `Unsupported schemaVersion \`${aspect.schemaVersion}\`: expected 1.x`,
            pointer("schemaVersion")
        );
    }

    if (!Array.isArray(aspect.entities)) {
        error(
            "missing-entities",
            "`entities` must be an array",
            pointer("entities")
        );
        return issues;
    }

    const entitiesById = new Map<string, DataDictionaryEntity>();
    const fieldPathsByEntity = new Map<string, Set<string>>();

    aspect.entities.forEach((entity: unknown, entityIdx: number) => {
        const entityLoc = pointer("entities", entityIdx);
        if (!isObject(entity)) {
            error("invalid-entity", "An entity must be an object", entityLoc);
            return;
        }
        if (!isNonEmptyString(entity.id)) {
            error(
                "missing-entity-id",
                "An entity requires a non-empty `id`",
                entityLoc + pointer("id")
            );
        } else if (entitiesById.has(entity.id)) {
            error(
                "duplicate-entity-id",
                `Duplicate entity id \`${entity.id}\``,
                entityLoc + pointer("id")
            );
        } else {
            entitiesById.set(entity.id, entity as DataDictionaryEntity);
        }

        const fieldPaths = new Set<string>();
        if (isNonEmptyString(entity.id) && !fieldPathsByEntity.has(entity.id)) {
            fieldPathsByEntity.set(entity.id, fieldPaths);
        }

        if (!Array.isArray(entity.fields)) {
            error(
                "missing-fields",
                "An entity requires a `fields` array",
                entityLoc + pointer("fields")
            );
        } else {
            entity.fields.forEach((field: unknown, fieldIdx: number) => {
                const fieldLoc = entityLoc + pointer("fields", fieldIdx);
                if (!isObject(field)) {
                    error(
                        "invalid-field",
                        "A field must be an object",
                        fieldLoc
                    );
                    return;
                }
                const path = (field as DataDictionaryField).path;
                if (!isValidFieldPath(path)) {
                    error(
                        "invalid-field-path",
                        `Invalid normalized field path \`${path}\``,
                        fieldLoc + pointer("path")
                    );
                } else if (fieldPaths.has(path)) {
                    error(
                        "duplicate-field-path",
                        `Duplicate field path \`${path}\` in entity \`${entity.id}\``,
                        fieldLoc + pointer("path")
                    );
                } else {
                    fieldPaths.add(path);
                }
            });
        }

        const dimensionIds = new Set<string>();
        if (Array.isArray(entity.dimensions)) {
            entity.dimensions.forEach((dimension: unknown, dimIdx: number) => {
                const dimLoc = entityLoc + pointer("dimensions", dimIdx);
                if (!isObject(dimension) || !isNonEmptyString(dimension.id)) {
                    error(
                        "missing-dimension-id",
                        "A dimension requires a non-empty `id`",
                        dimLoc
                    );
                    return;
                }
                if (dimensionIds.has(dimension.id)) {
                    error(
                        "duplicate-dimension-id",
                        `Duplicate dimension id \`${dimension.id}\``,
                        dimLoc + pointer("id")
                    );
                }
                dimensionIds.add(dimension.id);
                if (
                    dimension.fieldPath !== undefined &&
                    !fieldPaths.has(dimension.fieldPath)
                ) {
                    warning(
                        "unknown-dimension-field",
                        `Dimension \`${dimension.id}\` references field path \`${dimension.fieldPath}\` that is not a field of the entity`,
                        dimLoc + pointer("fieldPath")
                    );
                }
            });
        }

        if (Array.isArray(entity.fields)) {
            entity.fields.forEach((field: unknown, fieldIdx: number) => {
                if (!isObject(field) || !Array.isArray(field.dimensions)) {
                    return;
                }
                field.dimensions.forEach((dimId: unknown, idx: number) => {
                    if (typeof dimId !== "string" || !dimensionIds.has(dimId)) {
                        error(
                            "unknown-dimension",
                            `Field \`${field.path}\` references unknown dimension \`${dimId}\``,
                            entityLoc +
                                pointer("fields", fieldIdx, "dimensions", idx)
                        );
                    }
                });
            });
        }

        if (entity.primaryKey !== undefined) {
            if (
                !Array.isArray(entity.primaryKey) ||
                !entity.primaryKey.length
            ) {
                error(
                    "invalid-primary-key",
                    "`primaryKey` must be a non-empty array of field paths",
                    entityLoc + pointer("primaryKey")
                );
            } else {
                entity.primaryKey.forEach((keyPath: unknown, idx: number) => {
                    if (
                        typeof keyPath !== "string" ||
                        !fieldPaths.has(keyPath)
                    ) {
                        error(
                            "unknown-primary-key-field",
                            `Primary key field \`${keyPath}\` is not a field of entity \`${entity.id}\``,
                            entityLoc + pointer("primaryKey", idx)
                        );
                    }
                });
            }
        }

        if (
            isObject(entity.geometry) &&
            entity.geometry.fieldPath !== undefined &&
            !fieldPaths.has(entity.geometry.fieldPath)
        ) {
            warning(
                "unknown-geometry-field",
                `Geometry field path \`${entity.geometry.fieldPath}\` is not a field of entity \`${entity.id}\``,
                entityLoc + pointer("geometry", "fieldPath")
            );
        }
    });

    if (aspect.relationships !== undefined) {
        if (!Array.isArray(aspect.relationships)) {
            error(
                "invalid-relationships",
                "`relationships` must be an array",
                pointer("relationships")
            );
            return issues;
        }
        const relationshipIds = new Set<string>();
        aspect.relationships.forEach((rel: unknown, relIdx: number) => {
            const relLoc = pointer("relationships", relIdx);
            if (!isObject(rel)) {
                error(
                    "invalid-relationship",
                    "A relationship must be an object",
                    relLoc
                );
                return;
            }
            if (!isNonEmptyString(rel.id)) {
                error(
                    "missing-relationship-id",
                    "A relationship requires a non-empty `id`",
                    relLoc + pointer("id")
                );
            } else if (relationshipIds.has(rel.id)) {
                error(
                    "duplicate-relationship-id",
                    `Duplicate relationship id \`${rel.id}\``,
                    relLoc + pointer("id")
                );
            } else {
                relationshipIds.add(rel.id);
            }

            const endpointLengths: number[] = [];
            (["source", "target"] as const).forEach((side) => {
                const endpoint = rel[side];
                const endpointLoc = relLoc + pointer(side);
                if (!isObject(endpoint)) {
                    error(
                        "invalid-relationship-endpoint",
                        `Relationship \`${side}\` must be an object`,
                        endpointLoc
                    );
                    return;
                }
                const knownFields = fieldPathsByEntity.get(endpoint.entity);
                if (
                    !isNonEmptyString(endpoint.entity) ||
                    !entitiesById.has(endpoint.entity)
                ) {
                    error(
                        "unknown-relationship-entity",
                        `Relationship ${side} references unknown entity \`${endpoint.entity}\``,
                        endpointLoc + pointer("entity")
                    );
                }
                if (
                    !Array.isArray(endpoint.fields) ||
                    !endpoint.fields.length
                ) {
                    error(
                        "invalid-relationship-fields",
                        `Relationship ${side} requires a non-empty \`fields\` array`,
                        endpointLoc + pointer("fields")
                    );
                    return;
                }
                endpointLengths.push(endpoint.fields.length);
                if (!knownFields) {
                    return;
                }
                endpoint.fields.forEach((path: unknown, idx: number) => {
                    if (typeof path !== "string" || !knownFields.has(path)) {
                        error(
                            "unknown-relationship-field",
                            `Relationship ${side} field \`${path}\` is not a field of entity \`${endpoint.entity}\``,
                            endpointLoc + pointer("fields", idx)
                        );
                    }
                });
            });
            if (
                endpointLengths.length === 2 &&
                endpointLengths[0] !== endpointLengths[1]
            ) {
                error(
                    "relationship-field-count-mismatch",
                    "Relationship source and target must list the same number of fields",
                    relLoc
                );
            }
        });
    }

    return issues;
}

/**
 * Leniently coerce raw aspect data (which the registry may not have validated)
 * into a `DataDictionaryAspect` that is safe for display: non-object entities,
 * fields without a usable `path`/`name`, and non-array collections are dropped
 * or defaulted rather than throwing. Unknown properties are preserved.
 *
 * Returns `undefined` when the value is not usable as a data dictionary at all
 * (not an object, or without an `entities` array).
 */
export function normalizeDataDictionary(
    aspect: unknown
): DataDictionaryAspect | undefined {
    if (!isObject(aspect) || !Array.isArray(aspect.entities)) {
        return undefined;
    }
    const entities = aspect.entities
        .map((entity: unknown, idx: number) => {
            if (!isObject(entity)) {
                return undefined;
            }
            const id = isNonEmptyString(entity.id)
                ? entity.id
                : `entity-${idx}`;
            const fields = (Array.isArray(entity.fields) ? entity.fields : [])
                .filter(
                    (field: unknown) =>
                        isObject(field) &&
                        (isNonEmptyString(field.path) ||
                            isNonEmptyString(field.name))
                )
                .map((field: { [key: string]: any }) => ({
                    ...field,
                    path: isNonEmptyString(field.path)
                        ? field.path
                        : field.name,
                    name: isNonEmptyString(field.name)
                        ? field.name
                        : field.path,
                    type: isNonEmptyString(field.type) ? field.type : "unknown",
                    roles: Array.isArray(field.roles) ? field.roles : undefined,
                    aliases: Array.isArray(field.aliases)
                        ? field.aliases
                        : undefined,
                    dimensions: Array.isArray(field.dimensions)
                        ? field.dimensions
                        : undefined,
                    propertyProvenance: isObject(field.propertyProvenance)
                        ? field.propertyProvenance
                        : undefined,
                    provenance: isObject(field.provenance)
                        ? field.provenance
                        : undefined,
                    conflicts: Array.isArray(field.conflicts)
                        ? field.conflicts
                        : undefined
                })) as DataDictionaryField[];
            return {
                ...entity,
                id,
                name: isNonEmptyString(entity.name) ? entity.name : id,
                fields,
                primaryKey: Array.isArray(entity.primaryKey)
                    ? entity.primaryKey
                    : undefined,
                dimensions: Array.isArray(entity.dimensions)
                    ? entity.dimensions.filter((dim: unknown) => isObject(dim))
                    : undefined,
                geometry: isObject(entity.geometry)
                    ? entity.geometry
                    : undefined,
                provenance: isObject(entity.provenance)
                    ? entity.provenance
                    : undefined,
                propertyProvenance: isObject(entity.propertyProvenance)
                    ? entity.propertyProvenance
                    : undefined,
                conflicts: Array.isArray(entity.conflicts)
                    ? entity.conflicts
                    : undefined
            } as DataDictionaryEntity;
        })
        .filter((entity) => !!entity);
    const relationships = Array.isArray(aspect.relationships)
        ? aspect.relationships.filter(
              (rel: unknown) =>
                  isObject(rel) &&
                  isObject(rel.source) &&
                  isObject(rel.target) &&
                  Array.isArray(rel.source.fields) &&
                  Array.isArray(rel.target.fields)
          )
        : undefined;
    return {
        ...aspect,
        schemaVersion: isNonEmptyString(aspect.schemaVersion)
            ? aspect.schemaVersion
            : "1.0",
        source: isObject(aspect.source) ? aspect.source : undefined,
        provenance: isObject(aspect.provenance) ? aspect.provenance : undefined,
        entities,
        relationships
    } as DataDictionaryAspect;
}
