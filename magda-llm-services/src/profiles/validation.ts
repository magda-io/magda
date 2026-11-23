import { ProfileFields } from "./types.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ALL_MODELS = "*";

/** A client input error: the API answers it with `422` (API-11). */
export class ProfileValidationError extends Error {
    readonly statusCode = 422;
    constructor(message: string) {
        super(message);
        this.name = "ProfileValidationError";
    }
}

export function isUuid(value: unknown): value is string {
    return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * DATA-2: either distinct, non-empty exact aliases without surrounding
 * whitespace, or exactly `["*"]`. `*` is a whole-element sentinel, never a
 * pattern. When `knownAliases` is given (the deployment allowlist, MODEL-1),
 * every explicit alias must be in it.
 */
export function validateAllowedModels(
    value: unknown,
    knownAliases?: ReadonlySet<string>
): string[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new ProfileValidationError(
            'allowedModels must be a non-empty array of model aliases, or ["*"]'
        );
    }
    const seen = new Set<string>();
    for (const [index, alias] of value.entries()) {
        if (typeof alias !== "string" || !alias.trim()) {
            throw new ProfileValidationError(
                `allowedModels[${index}] must be a non-empty string`
            );
        }
        if (alias !== alias.trim()) {
            throw new ProfileValidationError(
                `allowedModels[${index}] must not have surrounding whitespace`
            );
        }
        if (seen.has(alias)) {
            throw new ProfileValidationError(
                `allowedModels contains duplicate alias ${JSON.stringify(
                    alias
                )}`
            );
        }
        seen.add(alias);
    }
    if (seen.has(ALL_MODELS)) {
        if (value.length !== 1) {
            throw new ProfileValidationError(
                '"*" (all available models) can\'t be combined with other aliases'
            );
        }
        return [ALL_MODELS];
    }
    if (knownAliases) {
        for (const alias of value) {
            if (!knownAliases.has(alias)) {
                throw new ProfileValidationError(
                    `Model alias ${JSON.stringify(alias)} is not available`
                );
            }
        }
    }
    return [...value];
}

/** DATA-3: `null` (unlimited) or a non-negative safe integer number of tokens. */
export function validateTokenLimit(
    value: unknown,
    field: string
): number | null {
    if (value === null || value === undefined) {
        return null;
    }
    if (
        typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value < 0
    ) {
        throw new ProfileValidationError(
            `${field} must be null or a non-negative whole number of tokens`
        );
    }
    return value;
}

function validateName(value: unknown): string {
    if (typeof value !== "string" || !value.trim()) {
        throw new ProfileValidationError("name is required");
    }
    const name = value.trim();
    if (name.length > 200) {
        throw new ProfileValidationError("name must be at most 200 characters");
    }
    return name;
}

function validateDescription(value: unknown): string | null {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    if (typeof value !== "string" || value.length > 2000) {
        throw new ProfileValidationError(
            "description must be a string of at most 2000 characters"
        );
    }
    return value;
}

function validateBoolean(value: unknown, field: string, fallback: boolean) {
    if (value === undefined) {
        return fallback;
    }
    if (typeof value !== "boolean") {
        throw new ProfileValidationError(`${field} must be true or false`);
    }
    return value;
}

function validateOrgUnitId(value: unknown): string | null {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    if (!isUuid(value)) {
        throw new ProfileValidationError("orgUnitId must be a UUID or null");
    }
    return value.toLowerCase();
}

const PROFILE_FIELD_NAMES: (keyof ProfileFields)[] = [
    "name",
    "description",
    "allowedModels",
    "enabled",
    "orgUnitId",
    "constraintExemption",
    "allowedDailyTokens",
    "allowedWeeklyTokens",
    "allowedMonthlyTokens"
];

/**
 * Validate a full set of profile fields from a client (create, or a full `PUT`).
 * Unknown fields, including internal ones such as `state`, `usePermissionId` or
 * `revision`, are rejected: clients can't set them.
 */
export function validateProfileFields(
    input: unknown,
    knownAliases?: ReadonlySet<string>
): ProfileFields {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new ProfileValidationError("A profile object is required");
    }
    const data = input as Record<string, unknown>;
    for (const key of Object.keys(data)) {
        if (!PROFILE_FIELD_NAMES.includes(key as keyof ProfileFields)) {
            throw new ProfileValidationError(`Unsupported field: ${key}`);
        }
    }
    return {
        name: validateName(data.name),
        description: validateDescription(data.description),
        allowedModels: validateAllowedModels(data.allowedModels, knownAliases),
        enabled: validateBoolean(data.enabled, "enabled", true),
        orgUnitId: validateOrgUnitId(data.orgUnitId),
        constraintExemption: validateBoolean(
            data.constraintExemption,
            "constraintExemption",
            false
        ),
        allowedDailyTokens: validateTokenLimit(
            data.allowedDailyTokens,
            "allowedDailyTokens"
        ),
        allowedWeeklyTokens: validateTokenLimit(
            data.allowedWeeklyTokens,
            "allowedWeeklyTokens"
        ),
        allowedMonthlyTokens: validateTokenLimit(
            data.allowedMonthlyTokens,
            "allowedMonthlyTokens"
        )
    };
}
