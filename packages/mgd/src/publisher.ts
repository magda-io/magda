import { randomUUID } from "node:crypto";
import { MagdaClient } from "./client.js";
import { REGISTRY_RECORDS, recordAspect, registryRecord } from "./endpoints.js";
import { MgdApiError, UsageError } from "./errors.js";
import { deriveSiteUrl } from "./recordBuilders.js";

export interface ResolvedPublisher {
    id: string;
    name: string;
}

interface OrganisationRecord {
    id: string;
    name?: string;
    aspects?: {
        "organization-details"?: {
            name?: string;
            title?: string;
        };
    };
}

function organisationName(record: OrganisationRecord): string {
    const details = record.aspects?.["organization-details"];
    return (
        [details?.title, details?.name, record.name, record.id].find(
            (value) => typeof value === "string" && value.trim()
        ) ?? record.id
    );
}

async function fetchOrganisation(
    client: MagdaClient,
    id: string
): Promise<ResolvedPublisher | undefined> {
    try {
        const record = await client.json<OrganisationRecord>(
            "GET",
            registryRecord(id),
            { query: [["aspect", "organization-details"]] }
        );
        if (!record.aspects?.["organization-details"]) {
            throw new UsageError(
                `Record ${record.id} is not an organisation: it has no organization-details aspect.`
            );
        }
        return { id: record.id, name: organisationName(record) };
    } catch (e) {
        if (e instanceof MgdApiError && e.status === 404) return undefined;
        throw e;
    }
}

async function findPublisherByName(
    client: MagdaClient,
    name: string
): Promise<ResolvedPublisher | undefined> {
    const result = await client.json<{
        options?: { identifier?: string; value?: string }[];
    }>("GET", "/v0/search/facets/publisher/options", {
        query: {
            generalQuery: "*",
            start: 0,
            limit: 10,
            facetQuery: name
        }
    });
    const normalized = name.toLowerCase().trim();
    const match = result.options?.find(
        (option) =>
            typeof option.identifier === "string" &&
            option.identifier.length > 0 &&
            typeof option.value === "string" &&
            option.value.toLowerCase().trim() === normalized
    );
    return match ? { id: match.identifier!, name: match.value! } : undefined;
}

async function createPublisher(
    client: MagdaClient,
    name: string
): Promise<ResolvedPublisher> {
    const id = randomUUID();
    await client.request("POST", REGISTRY_RECORDS, {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            id,
            name,
            aspects: {
                "organization-details": {
                    name,
                    title: name,
                    imageUrl: "",
                    description: "Added manually during dataset creation"
                }
            }
        })
    });
    return { id, name };
}

/**
 * Read the public web-server config. Some API-only deployments do not expose a
 * web server at the profile's site URL; in that case there is no default to use.
 */
export async function fetchDefaultOrganizationId(
    client: MagdaClient
): Promise<string | undefined> {
    const url = new URL("server-config.js", deriveSiteUrl(client.opts.baseUrl));
    let response: Response;
    try {
        response = await fetch(url);
    } catch {
        return undefined;
    }
    if (!response.ok) return undefined;

    const script = await response.text();
    const match = /window\.magda_server_config\s*=\s*([\s\S]*?)\s*;\s*$/.exec(
        script
    );
    if (!match) {
        throw new Error(`Could not parse MAGDA site config from ${url}`);
    }
    const config = JSON.parse(match[1]) as { defaultOrganizationId?: unknown };
    return typeof config.defaultOrganizationId === "string" &&
        config.defaultOrganizationId.trim()
        ? config.defaultOrganizationId.trim()
        : undefined;
}

function looksLikeOrganisationId(value: string): boolean {
    return (
        /^org-/i.test(value) ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            value
        )
    );
}

/** Resolve an explicit publisher as an existing record id or an exact name. */
export async function resolvePublisher(
    client: MagdaClient,
    value: string
): Promise<ResolvedPublisher> {
    const input = value.trim();
    if (!input) throw new UsageError("--publisher must not be empty.");
    const byId = await fetchOrganisation(client, input);
    if (byId) return byId;
    if (looksLikeOrganisationId(input)) {
        throw new MgdApiError(
            `Publishing organisation record not found: ${input}`,
            404,
            "not-found",
            "Check the organisation record ID or pass its name instead."
        );
    }

    const byName = await findPublisherByName(client, input);
    return byName ?? createPublisher(client, input);
}

/** Resolve the site's configured default publisher, when one is available. */
export async function resolveDefaultPublisher(
    client: MagdaClient
): Promise<ResolvedPublisher | undefined> {
    const id = await fetchDefaultOrganizationId(client);
    if (!id) return undefined;
    const publisher = await fetchOrganisation(client, id);
    if (!publisher) {
        throw new MgdApiError(
            `Default organisation record not found: ${id}`,
            404,
            "not-found",
            "Fix the site's defaultOrganizationId or pass --publisher explicitly."
        );
    }
    return publisher;
}

/** Return the existing publisher reference without dereferencing it. */
export async function getDatasetPublisherId(
    client: MagdaClient,
    datasetId: string
): Promise<string | undefined> {
    let aspect: { publisher?: unknown };
    try {
        aspect = await client.json(
            "GET",
            recordAspect(datasetId, "dataset-publisher")
        );
    } catch (e) {
        if (e instanceof MgdApiError && e.status === 404) return undefined;
        throw e;
    }
    return typeof aspect.publisher === "string" && aspect.publisher
        ? aspect.publisher
        : undefined;
}
