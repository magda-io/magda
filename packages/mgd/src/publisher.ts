import { randomUUID } from "node:crypto";
import { MagdaClient } from "./client.js";
import { REGISTRY_RECORDS, recordAspect, registryRecord } from "./endpoints.js";
import { MgdApiError, UsageError } from "./errors.js";
import { deriveSiteUrl } from "./recordBuilders.js";

export interface ResolvedPublisher {
    id: string;
    name: string;
    created?: boolean;
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

function aspectPattern(path: string, value: string): string {
    const escaped = value.replace(/\\/g, "\\\\").replace(/[%_]/g, "\\$&");
    return `${encodeURIComponent(path)}:?${encodeURIComponent(`%${escaped}%`)}`;
}

async function findPublisherByName(
    client: MagdaClient,
    name: string
): Promise<ResolvedPublisher | undefined> {
    const normalized = name.toLowerCase().trim();
    let pageToken: string | undefined;

    do {
        const query: [string, string][] = [
            ["aspect", "organization-details"],
            [
                "aspectOrQuery",
                aspectPattern("organization-details.title", name)
            ],
            ["aspectOrQuery", aspectPattern("organization-details.name", name)],
            ["limit", "100"]
        ];
        if (pageToken) query.push(["pageToken", pageToken]);

        const page = await client.json<{
            hasMore?: boolean;
            nextPageToken?: string;
            records?: OrganisationRecord[];
        }>("GET", REGISTRY_RECORDS, { query });
        const match = page.records?.find((record) => {
            const details = record.aspects?.["organization-details"];
            return [details?.title, details?.name].some(
                (candidate) =>
                    typeof candidate === "string" &&
                    candidate.toLowerCase().trim() === normalized
            );
        });
        if (match) {
            return { id: match.id, name: organisationName(match) };
        }
        pageToken = page.hasMore ? page.nextPageToken : undefined;
    } while (pageToken);

    return undefined;
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
    return { id, name, created: true };
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

    try {
        const script = await response.text();
        const match =
            /window\.magda_server_config\s*=\s*([\s\S]*?)\s*;\s*$/.exec(script);
        if (!match) return undefined;
        const config = JSON.parse(match[1]) as {
            defaultOrganizationId?: unknown;
        };
        return typeof config.defaultOrganizationId === "string" &&
            config.defaultOrganizationId.trim()
            ? config.defaultOrganizationId.trim()
            : undefined;
    } catch {
        return undefined;
    }
}

export async function resolvePublisherId(
    client: MagdaClient,
    id: string
): Promise<ResolvedPublisher> {
    const publisher = await fetchOrganisation(client, id);
    if (!publisher) {
        throw new MgdApiError(
            `Publishing organisation record not found: ${id}`,
            404,
            "not-found",
            "Check the organisation record ID or pass its name instead."
        );
    }
    return publisher;
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

    const byName = await findPublisherByName(client, input);
    return byName ?? createPublisher(client, input);
}

export async function removeCreatedPublisher(
    client: MagdaClient,
    publisher: ResolvedPublisher | undefined
): Promise<boolean> {
    if (!publisher?.created) return false;
    try {
        await client.request("DELETE", registryRecord(publisher.id));
        return true;
    } catch {
        return false;
    }
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
