import {} from "mocha";
import sinon from "sinon";
import express from "express";
import { expect } from "chai";
import nock from "nock";
import supertest from "supertest";
import { parseString } from "xml2js";
import buildSitemapRouter from "../buildSitemapRouter.js";
import { promisify } from "typed-promisify";
import Registry from "magda-typescript-common/src/registry/RegistryClient.js";
import delay from "magda-typescript-common/src/delay.js";

const noOptionsParseString = (
    string: string,
    callback: (err: any, result: any) => void
) => parseString(string, callback);
const parsePromise = promisify(noOptionsParseString);

describe("sitemap router", () => {
    const baseExternalUrl = "http://example.com";
    const registryUrl = "http://registry.example.com";
    const registry = new Registry({
        baseUrl: registryUrl,
        maxRetries: 0,
        tenantId: 1
    });

    let router: express.Router;
    let registryScope: nock.Scope;

    beforeEach(() => {
        nock.disableNetConnect();
        // Allow localhost connections so we can test local routes and mock servers.
        nock.enableNetConnect("127.0.0.1");
        router = buildSitemapRouter({
            baseExternalUrl,
            registry,
            cacheSeconds: 10,
            uiBaseUrl: "/"
        });
        registryScope = nock(registryUrl);
    });

    afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
        if ((<sinon.SinonStub>console.error).restore) {
            (<sinon.SinonStub>console.error).restore();
        }
    });

    describe("/sitemap.xml", () => {
        it("should only query registry for once within cacheSeconds", async () => {
            const tokens = [0, 100, 200];
            let requestTimes = 0;

            registryScope
                .get("/records/pagetokens?aspect=dcat-dataset-strings")
                .reply(() => {
                    requestTimes++;
                    return [
                        200,
                        JSON.stringify(tokens),
                        {
                            "Content-Type": "application/json"
                        }
                    ];
                })
                .persist();
            await supertest(router).get("/sitemap.xml").expect(200);
            await supertest(router).get("/sitemap.xml").expect(200);

            expect(requestTimes).to.equal(1);
        });

        it("should query registry twice with two requests beyond cacheSeconds time window", async function (this) {
            this.timeout(5000);
            const tokens = [0, 100, 200];
            let requestTimes = 0;

            registryScope
                .get("/records/pagetokens?aspect=dcat-dataset-strings")
                .reply(() => {
                    requestTimes++;
                    return [
                        200,
                        JSON.stringify(tokens),
                        {
                            "Content-Type": "application/json"
                        }
                    ];
                })
                .persist();

            const app = buildSitemapRouter({
                baseExternalUrl,
                registry,
                uiBaseUrl: "/",
                cacheSeconds: 1 //-- set cache time to 1s
            });

            await supertest(app).get("/sitemap.xml").expect(200);
            // --- delay 2s
            await delay(1500);
            await supertest(app).get("/sitemap.xml").expect(200);
            await supertest(app).get("/sitemap.xml").expect(200);

            expect(requestTimes).to.equal(2);
        });

        it("should reflect page tokens from registry", () => {
            const tokens = [0, 100, 200];

            registryScope
                .get("/records/pagetokens?aspect=dcat-dataset-strings")
                .reply(200, tokens);

            return supertest(router)
                .get("/sitemap.xml")
                .expect(200)
                .expect(checkRequestMetadata)
                .then((res) => parsePromise(res.text))
                .then((xmlObj) => {
                    const urls = xmlObj.sitemapindex.sitemap.map(
                        (mapEntry: any) => mapEntry.loc[0]
                    );

                    const expected = tokens.map(
                        (token) =>
                            baseExternalUrl +
                            "/sitemap/dataset/afterToken/" +
                            token +
                            ".xml"
                    );

                    expect(urls).to.eql(
                        [baseExternalUrl + "/sitemap/main.xml"].concat(expected)
                    );
                });
        });

        it("should handle registry failure as 500", () => {
            silenceConsoleError();

            registryScope
                .get("/records/pagetokens?aspect=dcat-dataset-strings")
                .reply(500);

            return supertest(router).get("/sitemap.xml").expect(500);
        });
    });

    describe("/sitemap/main.xml", () => {
        it("should return the home page", () => {
            return supertest(router)
                .get("/sitemap/main.xml")
                .expect(200)
                .expect(checkRequestMetadata)
                .then((res) => parsePromise(res.text))
                .then((xmlObj) => {
                    expect(xmlObj.urlset.url[0].loc[0]).to.equal(
                        baseExternalUrl + "/"
                    );
                });
        });
    });

    describe("/sitemap/dataset/afterToken/:afterToken", () => {
        const token = "1234";

        it("should return the datasets pages for the corresponding datasets page with that token", () => {
            const recordIds = ["a", "b", "c"];

            registryScope
                .get(
                    `/records?aspect=dcat-dataset-strings&optionalAspect=&pageToken=${token}&dereference=false`
                )
                .reply(200, {
                    records: recordIds.map((id) => ({
                        id
                    }))
                });

            return supertest(router)
                .get(`/sitemap/dataset/afterToken/${token}.xml`)
                .expect(200)
                .expect(checkRequestMetadata)
                .then((res) => parsePromise(res.text))
                .then((xmlObj) => {
                    const urls = xmlObj.urlset.url.map(
                        (url: any) => url.loc[0]
                    );

                    const expectedUrls = recordIds.map(
                        (id) =>
                            `${baseExternalUrl}/dataset/${encodeURIComponent(
                                id
                            )}`
                    );

                    expect(urls).to.eql(expectedUrls);
                });
        });

        it("should handle registry failure as 500", () => {
            silenceConsoleError();

            registryScope
                .get(
                    "/records?aspect=dcat-dataset-strings&optionalAspect=&pageToken=${token}&dereference=false"
                )
                .reply(500);

            return supertest(router)
                .get(`/sitemap/dataset/afterToken/${token}.xml`)
                .expect(500);
        });
    });

    function silenceConsoleError() {
        sinon.stub(console, "error");
    }

    /**
     * Make sure that encoding is UTF-8 and content-type is application/xml.
     */
    function checkRequestMetadata(res: supertest.Response) {
        expect(res.charset).to.equal("utf-8");
        expect(res.header["content-type"]).to.contain("application/xml");
    }
});
