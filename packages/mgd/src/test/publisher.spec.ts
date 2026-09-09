import { expect } from "chai";
import { MagdaClient } from "../client.js";
import {
    fetchDefaultOrganizationId,
    getDatasetPublisherId,
    resolveDefaultPublisher,
    resolvePublisher
} from "../publisher.js";
import { startMockServer } from "./mockServer.js";

describe("publisher resolution", () => {
    it("rejects an empty publisher", async () => {
        let error: unknown;
        try {
            await resolvePublisher(
                new MagdaClient({ baseUrl: "http://127.0.0.1:1" }),
                "   "
            );
        } catch (e) {
            error = e;
        }
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.equal(
            "--publisher must not be empty."
        );
    });

    it("uses an organisation record id directly and reads its canonical name", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: "/v0/registry/records/org-1",
                body: {
                    id: "org-1",
                    name: "Data Agency",
                    aspects: {
                        "organization-details": { title: "Data Agency" }
                    }
                }
            }
        ]);
        try {
            const result = await resolvePublisher(
                new MagdaClient({ baseUrl: server.url }),
                "org-1"
            );
            expect(result).to.deep.equal({ id: "org-1", name: "Data Agency" });
            expect(server.requests[0].url).to.contain(
                "aspect=organization-details"
            );
        } finally {
            await server.close();
        }
    });

    it("rejects a record without organization-details", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: "/v0/registry/records/ds-1",
                body: { id: "ds-1", name: "A dataset", aspects: {} }
            }
        ]);
        try {
            let error: unknown;
            try {
                await resolvePublisher(
                    new MagdaClient({ baseUrl: server.url }),
                    "ds-1"
                );
            } catch (e) {
                error = e;
            }
            expect((error as Error).message).to.contain(
                "is not an organisation"
            );
        } finally {
            await server.close();
        }
    });

    it("reuses an exact case-insensitive publisher name match", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: /\/v0\/registry\/records\//,
                status: 404,
                body: { message: "not found" }
            },
            {
                method: "GET",
                path: "/v0/search/facets/publisher/options",
                body: {
                    options: [
                        { identifier: "org-other", value: "Other" },
                        { identifier: "org-1", value: "Data Agency" }
                    ]
                }
            }
        ]);
        try {
            const result = await resolvePublisher(
                new MagdaClient({ baseUrl: server.url }),
                "  data agency  "
            );
            expect(result).to.deep.equal({ id: "org-1", name: "Data Agency" });
            const search = server.requests.find((r) =>
                r.url.startsWith("/v0/search/facets/publisher/options?")
            )!;
            const query = new URL(search.url, server.url).searchParams;
            expect(query.get("generalQuery")).to.equal("*");
            expect(query.get("start")).to.equal("0");
            expect(query.get("limit")).to.equal("10");
            expect(query.get("facetQuery")).to.equal("data agency");
            expect(server.requests.some((r) => r.method === "POST")).to.equal(
                false
            );
        } finally {
            await server.close();
        }
    });

    it("creates an organisation when no publisher name matches", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: /\/v0\/registry\/records\//,
                status: 404,
                body: { message: "not found" }
            },
            {
                method: "GET",
                path: "/v0/search/facets/publisher/options",
                body: { options: [] }
            },
            { method: "POST", path: "/v0/registry/records", body: {} }
        ]);
        try {
            const result = await resolvePublisher(
                new MagdaClient({ baseUrl: server.url }),
                "New Agency"
            );
            expect(result.id).to.match(/^[0-9a-f-]{36}$/);
            expect(result.name).to.equal("New Agency");
            const body = JSON.parse(
                server.requests
                    .find((r) => r.method === "POST")!
                    .body.toString()
            );
            expect(body).to.deep.equal({
                id: result.id,
                name: "New Agency",
                aspects: {
                    "organization-details": {
                        name: "New Agency",
                        title: "New Agency",
                        imageUrl: "",
                        description: "Added manually during dataset creation"
                    }
                }
            });
        } finally {
            await server.close();
        }
    });

    it("reads and resolves the site's default organisation", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: "/server-config.js",
                body: 'window.magda_server_config = {"defaultOrganizationId":"org-default"};'
            },
            {
                method: "GET",
                path: "/api/v0/registry/records/org-default",
                body: {
                    id: "org-default",
                    name: "Default Agency",
                    aspects: { "organization-details": {} }
                }
            }
        ]);
        try {
            const client = new MagdaClient({ baseUrl: `${server.url}/api` });
            expect(await fetchDefaultOrganizationId(client)).to.equal(
                "org-default"
            );
            expect(await resolveDefaultPublisher(client)).to.deep.equal({
                id: "org-default",
                name: "Default Agency"
            });
        } finally {
            await server.close();
        }
    });

    it("reads an attached publisher id without dereferencing it", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: "/v0/registry/records/ds-1/aspects/dataset-publisher",
                body: { publisher: "org-stale" }
            }
        ]);
        try {
            const result = await getDatasetPublisherId(
                new MagdaClient({ baseUrl: server.url }),
                "ds-1"
            );
            expect(result).to.equal("org-stale");
            expect(server.requests).to.have.length(1);
        } finally {
            await server.close();
        }
    });
});
