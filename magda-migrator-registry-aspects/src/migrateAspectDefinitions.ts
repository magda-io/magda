import ServerError from "magda-typescript-common/src/ServerError.js";

export type AspectDefItem = {
    id: string;
    name: string;
    jsonSchema: { [key: string]: any };
};

/** The Registry calls the migrator needs (AuthorizedRegistryClient satisfies it). */
export interface AspectDefinitionRegistry {
    /** Throws a `ServerError` (404 when the definition does not exist). */
    getAspectDefinition(aspectId: string): Promise<AspectDefItem>;
    /** Resolves to an `Error` instead of rejecting once retries are exhausted. */
    putAspectDefinition(
        aspectDef: AspectDefItem
    ): Promise<AspectDefItem | Error>;
}

export type MigrationLogger = Pick<Console, "log">;

/**
 * Built-in definitions are normally created once and never overwritten, so a
 * deployment's own changes to them survive upgrades. A definition listed here
 * is owned by this release: an existing copy whose schema differs from the
 * bundled one is replaced. Keep the list to schemas that services depend on.
 *
 * - `access-group-details`: #3861 Agent Skill share groups need the widened
 *   `resourceUri` enum; Registry validates aspects against this schema.
 */
export const RELEASE_OWNED_ASPECT_IDS: ReadonlySet<string> = new Set([
    "access-group-details"
]);

/** JSON with object keys sorted, so stored (jsonb) and bundled schemas compare. */
export function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (value && typeof value === "object")
        return `{${Object.keys(value)
            .sort()
            .map(
                (key) =>
                    `${JSON.stringify(key)}:${canonicalJson(
                        (value as Record<string, unknown>)[key]
                    )}`
            )
            .join(",")}}`;
    return JSON.stringify(value);
}

function errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

async function putOrThrow(
    registry: AspectDefinitionRegistry,
    aspectDef: AspectDefItem,
    action: "create" | "update"
): Promise<void> {
    const result = await registry.putAspectDefinition(aspectDef);
    if (result instanceof Error) {
        throw new Error(
            `Failed to ${action} aspect definition '${
                aspectDef.id
            }': ${errorMessage(result)}`,
            { cause: result }
        );
    }
}

/**
 * Creates missing built-in aspect definitions and replaces outdated
 * release-owned ones. Rejects on the first failure (anything other than a 404
 * lookup, or a failed create / update), so the migration Job fails and is
 * retried instead of reporting success with a schema that was never applied.
 */
export async function migrateAspectDefinitions(
    registry: AspectDefinitionRegistry,
    aspectDefs: AspectDefItem[],
    {
        releaseOwnedAspectIds = RELEASE_OWNED_ASPECT_IDS,
        logger = console
    }: {
        releaseOwnedAspectIds?: ReadonlySet<string>;
        logger?: MigrationLogger;
    } = {}
): Promise<void> {
    if (!aspectDefs?.length) {
        throw new Error(
            "Cannot locate built-in registry aspect definition files"
        );
    }
    for (const bundled of aspectDefs) {
        if (bundled?.id?.length > 100) {
            logger.log(
                `Aspect '${bundled?.id}' has a ID over 100 characters. Skipped processing this aspect definition.`
            );
            continue;
        }
        let existing: AspectDefItem | undefined;
        try {
            existing = await registry.getAspectDefinition(bundled.id);
        } catch (e) {
            if (!(e instanceof ServerError && e.statusCode === 404)) {
                throw new Error(
                    `Failed to look up aspect definition '${
                        bundled.id
                    }': ${errorMessage(e)}`,
                    { cause: e }
                );
            }
        }
        if (!existing) {
            logger.log(`AspectDef '${bundled.id}' not present.`);
            logger.log(`Creating aspect definition for '${bundled.id}'...`);
            const aspectDef = { ...bundled };
            if (aspectDef?.name?.length > 100) {
                logger.log(
                    `Aspect '${aspectDef.id}' has a name over 100 characters. Use aspect ID as name instead.`
                );
                aspectDef.name = aspectDef.id;
            }
            await putOrThrow(registry, aspectDef, "create");
            logger.log(`Created aspect definition for '${bundled.id}'.`);
            continue;
        }
        if (
            releaseOwnedAspectIds.has(existing.id) &&
            canonicalJson(existing.jsonSchema) !==
                canonicalJson(bundled.jsonSchema)
        ) {
            logger.log(
                `AspectDef '${existing.id}' exists with an older schema. Updating it to the bundled schema...`
            );
            await putOrThrow(
                registry,
                { ...bundled, name: existing.name },
                "update"
            );
            logger.log(`Updated aspect definition for '${existing.id}'.`);
            continue;
        }
        logger.log(
            `AspectDef '${existing.id}' exists in registry. Skip definition creation.`
        );
    }
}
