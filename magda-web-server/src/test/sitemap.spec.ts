import {} from "mocha";
// import * as sinon from "sinon";
// import * as express from "express";
import { expect } from "chai";
import * as nock from "nock";
import * as request from "supertest";
import { parseString } from "xml2js";
import buildSitemapRouter from "../buildSitemapRouter";
import { promisify } from "typed-promisify";

const noOptionsParseString = (
    string: string,
    callback: (err: any, result: any) => void
) => parseString(string, callback);
const parsePromise = promisify(noOptionsParseString);

describe("sitemap router", () => {
    const externalUrl = "http://example.com";
    const registryUrl = "http://registry.example.com";

    describe("/", () => {
        it("should reflect page tokens from registry", () => {
            const router = buildSitemapRouter(externalUrl, registryUrl);
            const registryScope = nock(registryUrl);
            const tokens = [0, 100, 200];

            registryScope
                .get("/records/pagetokens?aspect=dcat-dataset-strings")
                .reply(200, tokens);

            return request(router)
                .get("/")
                .expect(200)
                .then(res => parsePromise(res.text))
                .then(xmlObj => {
                    const urls = xmlObj.sitemapindex.sitemap.map(
                        (mapEntry: any) => mapEntry.loc[0]
                    );

                    const expected = tokens.map(
                        token =>
                            externalUrl + "/sitemap/dataset/afterToken/" + token
                    );

                    expect(urls).to.eql(
                        [externalUrl + "/sitemap/main"].concat(expected)
                    );
                });
        });
    });

    describe("/main", () => {
        it("should return the home page", () => {
            const router = buildSitemapRouter(externalUrl, registryUrl);

            return request(router)
                .get("/main")
                .expect(200)
                .then(res => parsePromise(res.text))
                .then(xmlObj => {
                    expect(xmlObj.urlset.url[0].loc[0]).to.equal(
                        externalUrl + "/"
                    );
                });
        });
    });

    describe("/dataset/afterToken/:afterToken", () => {
        it("should return the datasets pages for the corresponding datasets page with that token", () => {
            const token = "1234";
            const router = buildSitemapRouter(externalUrl, registryUrl);
            const registryScope = nock(registryUrl);
            const recordIds = ["a", "b", "c"];

            registryScope
                .get(
                    `/records?aspect=dcat-dataset-strings&optionalAspect=&pageToken=${token}&dereference=false`
                )
                .reply(200, {
                    records: recordIds.map(id => ({
                        id
                    }))
                });

            return request(router)
                .get(`/dataset/afterToken/${token}`)
                .expect(200)
                .then(res => parsePromise(res.text))
                .then(xmlObj => {
                    const urls = xmlObj.urlset.url.map(
                        (url: any) => url.loc[0]
                    );

                    const expectedUrls = recordIds.map(
                        id => `${externalUrl}/dataset/${encodeURIComponent(id)}`
                    );

                    expect(urls).to.eql(expectedUrls);
                });
        });
    });
});
