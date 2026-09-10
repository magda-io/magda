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
                path: "/v0/registry/records",
                body: {
                    hasMore: false,
                    records: [
                        {
                            id: "org-1",
                            name: "data-agency",
                            aspects: {
                                "organization-details": {
                                    title: "Data Agency"
                                }
                            }
                        }
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
                r.url.startsWith("/v0/registry/records?")
            )!;
            const query = new URL(search.url, server.url).searchParams;
            expect(query.get("aspect")).to.equal("organization-details");
            expect(query.get("limit")).to.equal("100");
            expect(query.getAll("aspectOrQuery")).to.have.length(2);
            expect(query.getAll("aspectOrQuery")[0]).to.contain(
                "organization-details.title:?"
            );
            expect(server.requests.some((r) => r.method === "POST")).to.equal(
                false
            );
        } finally {
            await server.close();
        }
    });

    it("escapes special characters in registry name queries", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: /\/v0\/registry\/records\//,
                status: 404,
                body: { message: "not found" }
            },
            {
                method: "GET",
                path: "/v0/registry/records",
                body: { hasMore: false, records: [] }
            },
            { method: "POST", path: "/v0/registry/records", body: {} }
        ]);
        try {
            await resolvePublisher(
                new MagdaClient({ baseUrl: server.url }),
                "100%_\\ Agency"
            );
            const request = server.requests.find((r) =>
                r.url.startsWith("/v0/registry/records?")
            )!;
            const encodedQuery = new URL(
                request.url,
                server.url
            ).searchParams.getAll("aspectOrQuery")[0];
            expect(encodedQuery).to.contain("%25");
            expect(decodeURIComponent(encodedQuery)).to.equal(
                "organization-details.title:?%100\\%\\_\\\\ Agency%"
            );
        } finally {
            await server.close();
        }
    });

    it("continues registry name lookup across pages", async () => {
        let page = 0;
        const server = await startMockServer([
            {
                method: "GET",
                path: /\/v0\/registry\/records\//,
                status: 404,
                body: { message: "not found" }
            },
            {
                method: "GET",
                path: "/v0/registry/records",
                handler: (_req, res) => {
                    page++;
                    res.writeHead(200, { "content-type": "application/json" });
                    res.end(
                        JSON.stringify(
                            page === 1
                                ? {
                                      hasMore: true,
                                      nextPageToken: "101",
                                      records: []
                                  }
                                : {
                                      hasMore: false,
                                      records: [
                                          {
                                              id: "org-page-2",
                                              aspects: {
                                                  "organization-details": {
                                                      title: "Paged Agency"
                                                  }
                                              }
                                          }
                                      ]
                                  }
                        )
                    );
                }
            }
        ]);
        try {
            const result = await resolvePublisher(
                new MagdaClient({ baseUrl: server.url }),
                "Paged Agency"
            );
            expect(result).to.deep.equal({
                id: "org-page-2",
                name: "Paged Agency"
            });
            const registryQueries = server.requests.filter((r) =>
                r.url.startsWith("/v0/registry/records?")
            );
            expect(registryQueries).to.have.length(2);
            expect(
                new URL(registryQueries[1].url, server.url).searchParams.get(
                    "pageToken"
                )
            ).to.equal("101");
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
                path: "/v0/registry/records",
                body: { hasMore: false, records: [] }
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

    it("ignores an unparseable 200 response from server-config.js", async () => {
        const server = await startMockServer([
            {
                method: "GET",
                path: "/server-config.js",
                body: "<!doctype html><title>SPA fallback</title>"
            }
        ]);
        try {
            const result = await fetchDefaultOrganizationId(
                new MagdaClient({ baseUrl: server.url })
            );
            expect(result).to.equal(undefined);
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
