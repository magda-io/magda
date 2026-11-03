import {
    DistributionContractAspect,
    DistributionContractOperation,
    PAGINATION_PARAMETER_PROPERTIES,
    PAGINATION_PATH_PROPERTIES
} from "./model.js";
import {
    getEffectiveAuthentication,
    getParameterLocationKey,
    isAuthenticationParameter,
    isCredentialHeaderName,
    isCredentialLikeParameterName,
    isValidJsonPointer
} from "./contract.js";
import { isSupportedSchemaVersion } from "./normalize.js";
import {
    isNonEmptyString,
    isObject,
    jsonPointer as pointer
} from "../data-understanding/json.js";

export type DistributionContractIssueSeverity = "error" | "warning";

export interface DistributionContractIssue {
    severity: DistributionContractIssueSeverity;
    /** Machine-readable issue code, e.g. `duplicate-operation-id`. */
    code: string;
    message: string;
    /** JSON Pointer (RFC 6901) to the offending location in the aspect. */
    location: string;
}

/** IDs of the entities of a (raw or normalized) `data-dictionary` aspect. */
function getDictionaryEntityIds(dataDictionary: unknown): Set<string> {
    const ids = new Set<string>();
    if (isObject(dataDictionary) && Array.isArray(dataDictionary.entities)) {
        dataDictionary.entities.forEach((entity: unknown) => {
            if (isObject(entity) && isNonEmptyString(entity.id)) {
                ids.add(entity.id);
            }
        });
    }
    return ids;
}

/**
 * Check the cross-reference and identity integrity of a
 * `distribution-contract` aspect: the rules a JSON Schema cannot express. Run
 * it in addition to (not instead of) JSON Schema validation against
 * `distribution-contract.schema.json`.
 *
 * `dataDictionary` is the same distribution's `data-dictionary` aspect (raw or
 * normalized). Request/response `dictionaryEntity` references are only checked
 * when it is supplied.
 *
 * Errors:
 * - unsupported `schemaVersion` major version;
 * - operations without an `id`, duplicate operation `id`s or
 *   `sourceIdentifier`s;
 * - parameters without a `name`/`location`, duplicate parameters within an
 *   operation (same `location` + `name`, header names compared
 *   case-insensitively, or same `sourceIdentifier`);
 * - credential-bearing parameters: `Authorization` / `Proxy-Authorization`
 *   headers, or the input the operation's effective `api-key` style
 *   `authentication` describes (credentials belong in `authentication` only);
 * - request/response `dictionaryEntity` references that are empty, or not an
 *   entity of the supplied data dictionary;
 * - pagination `*Parameter` references that do not name a `query` parameter
 *   of the same operation;
 * - response `recordsPath` / pagination `*Path` values that are not RFC 6901
 *   JSON Pointers.
 *
 * Warnings:
 * - parameters whose name suggests a credential (e.g. `api_key`, `password`).
 *
 * Returns an empty array when no issue is found.
 */
export function validateDistributionContract(
    aspect: unknown,
    dataDictionary?: unknown
): DistributionContractIssue[] {
    const issues: DistributionContractIssue[] = [];
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
    } else if (!isSupportedSchemaVersion(aspect.schemaVersion)) {
        error(
            "unsupported-schema-version",
            `Unsupported schemaVersion \`${aspect.schemaVersion}\`: expected 1.x`,
            pointer("schemaVersion")
        );
    }

    if (aspect.operations === undefined) {
        return issues;
    }
    if (!Array.isArray(aspect.operations)) {
        error(
            "invalid-operations",
            "`operations` must be an array",
            pointer("operations")
        );
        return issues;
    }

    const checkDictionaryEntities =
        dataDictionary !== undefined && dataDictionary !== null;
    const dictionaryEntityIds = getDictionaryEntityIds(dataDictionary);

    const operationIds = new Set<string>();
    const operationSourceIds = new Set<string>();

    aspect.operations.forEach((operation: unknown, opIdx: number) => {
        const opLoc = pointer("operations", opIdx);
        if (!isObject(operation)) {
            error("invalid-operation", "An operation must be an object", opLoc);
            return;
        }
        if (!isNonEmptyString(operation.id)) {
            error(
                "missing-operation-id",
                "An operation requires a non-empty `id`",
                opLoc + pointer("id")
            );
        } else if (operationIds.has(operation.id)) {
            error(
                "duplicate-operation-id",
                `Duplicate operation id \`${operation.id}\``,
                opLoc + pointer("id")
            );
        } else {
            operationIds.add(operation.id);
        }
        if (isNonEmptyString(operation.sourceIdentifier)) {
            if (operationSourceIds.has(operation.sourceIdentifier)) {
                error(
                    "duplicate-operation-source-identifier",
                    `Duplicate operation sourceIdentifier \`${operation.sourceIdentifier}\``,
                    opLoc + pointer("sourceIdentifier")
                );
            } else {
                operationSourceIds.add(operation.sourceIdentifier);
            }
        }
        const opName = isNonEmptyString(operation.id)
            ? `\`${operation.id}\``
            : `#${opIdx}`;
        const authentication = getEffectiveAuthentication(
            aspect as DistributionContractAspect,
            operation as DistributionContractOperation
        );

        // parameters
        const queryParameterNames = new Set<string>();
        if (
            operation.parameters !== undefined &&
            !Array.isArray(operation.parameters)
        ) {
            error(
                "invalid-parameters",
                "`parameters` must be an array",
                opLoc + pointer("parameters")
            );
        } else if (Array.isArray(operation.parameters)) {
            const locationKeys = new Set<string>();
            const sourceIds = new Set<string>();
            operation.parameters.forEach((param: unknown, paramIdx: number) => {
                const paramLoc = opLoc + pointer("parameters", paramIdx);
                if (!isObject(param)) {
                    error(
                        "invalid-parameter",
                        "A parameter must be an object",
                        paramLoc
                    );
                    return;
                }
                const { name, location } = param;
                if (!isNonEmptyString(name)) {
                    error(
                        "missing-parameter-name",
                        "A parameter requires a non-empty `name`",
                        paramLoc + pointer("name")
                    );
                }
                if (!isNonEmptyString(location)) {
                    error(
                        "missing-parameter-location",
                        "A parameter requires a non-empty `location`",
                        paramLoc + pointer("location")
                    );
                }
                if (isNonEmptyString(param.sourceIdentifier)) {
                    if (sourceIds.has(param.sourceIdentifier)) {
                        error(
                            "duplicate-parameter-source-identifier",
                            `Duplicate parameter sourceIdentifier \`${param.sourceIdentifier}\` in operation ${opName}`,
                            paramLoc + pointer("sourceIdentifier")
                        );
                    } else {
                        sourceIds.add(param.sourceIdentifier);
                    }
                }
                if (!isNonEmptyString(name) || !isNonEmptyString(location)) {
                    return;
                }
                if (location === "query") {
                    queryParameterNames.add(name);
                }
                const key = getParameterLocationKey({ name, location });
                if (locationKeys.has(key)) {
                    error(
                        "duplicate-parameter",
                        `Duplicate ${location} parameter \`${name}\` in operation ${opName}`,
                        paramLoc
                    );
                } else {
                    locationKeys.add(key);
                }
                if (location === "header" && isCredentialHeaderName(name)) {
                    error(
                        "credential-parameter",
                        `\`${name}\` carries credentials: describe it in \`authentication\`, not as a parameter`,
                        paramLoc
                    );
                } else if (
                    isAuthenticationParameter(
                        { name, location },
                        authentication
                    )
                ) {
                    error(
                        "credential-parameter",
                        `${location} parameter \`${name}\` is the credential described by \`authentication\`: it must not be an ordinary parameter`,
                        paramLoc
                    );
                } else if (isCredentialLikeParameterName(name)) {
                    warning(
                        "possible-credential-parameter",
                        `Parameter \`${name}\` looks like a credential: credentials belong in \`authentication\`, never in parameters`,
                        paramLoc + pointer("name")
                    );
                }
            });
        }

        // request/response data dictionary references
        (["request", "response"] as const).forEach((part) => {
            const body = operation[part];
            if (!isObject(body) || body.dictionaryEntity === undefined) {
                return;
            }
            const entityLoc = opLoc + pointer(part, "dictionaryEntity");
            if (!isNonEmptyString(body.dictionaryEntity)) {
                error(
                    "invalid-dictionary-entity",
                    `\`${part}.dictionaryEntity\` must be a non-empty data dictionary entity id`,
                    entityLoc
                );
            } else if (
                checkDictionaryEntities &&
                !dictionaryEntityIds.has(body.dictionaryEntity)
            ) {
                error(
                    "unknown-dictionary-entity",
                    `Operation ${opName} ${part} references \`${body.dictionaryEntity}\`, which is not an entity of the distribution's data dictionary`,
                    entityLoc
                );
            }
        });

        // response record path & pagination
        const response = operation.response;
        if (!isObject(response)) {
            return;
        }
        if (
            response.recordsPath !== undefined &&
            !isValidJsonPointer(response.recordsPath)
        ) {
            error(
                "invalid-json-pointer",
                `\`recordsPath\` must be an RFC 6901 JSON Pointer, e.g. \`/records\`; got \`${response.recordsPath}\``,
                opLoc + pointer("response", "recordsPath")
            );
        }
        const pagination = response.pagination;
        if (!isObject(pagination)) {
            return;
        }
        const paginationLoc = opLoc + pointer("response", "pagination");
        PAGINATION_PARAMETER_PROPERTIES.forEach((property) => {
            const ref = pagination[property];
            if (ref === undefined) {
                return;
            }
            if (!isNonEmptyString(ref) || !queryParameterNames.has(ref)) {
                error(
                    "unknown-pagination-parameter",
                    `Pagination \`${property}\` \`${ref}\` is not a query parameter of operation ${opName}`,
                    paginationLoc + pointer(property)
                );
            }
        });
        PAGINATION_PATH_PROPERTIES.forEach((property) => {
            const path = pagination[property];
            if (path !== undefined && !isValidJsonPointer(path)) {
                error(
                    "invalid-json-pointer",
                    `Pagination \`${property}\` must be an RFC 6901 JSON Pointer; got \`${path}\``,
                    paginationLoc + pointer(property)
                );
            }
        });
    });

    return issues;
}
