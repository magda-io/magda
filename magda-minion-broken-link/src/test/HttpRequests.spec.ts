import {} from "mocha";
import * as nock from "nock";
import jsc from "@magda/typescript-common/dist/test/jsverify";
import { expect } from "chai";
import { headRequest, getRequest, BadHttpResponseError } from "../HttpRequests";
import RandomStream from "./RandomStream";

const onMatchFail = (req: any, interceptor: any) => {
    console.error(
        `Match failure: ${req.method ? req.method : interceptor.method} ${
            req.host ? req.host : interceptor.host
        }${req.path}`
    );
};

describe("Test HttpRequests.ts", () => {
    before(() => {
        nock.disableNetConnect();
        nock.emitter.on("no match", onMatchFail);
    });

    after(() => {
        nock.emitter.removeListener("no match", onMatchFail);
        nock.cleanAll();
    });

    describe("headRequest", () => {
        it("should return status code when response status is between 200 to 299", async function() {
            return jsc.assert(
                jsc.forall(jsc.integer(200, 299), async function(statusCode) {
                    const url = "http://example.com";
                    const path = "/xx";
                    nock(url)
                        .head(path)
                        .reply(statusCode);

                    const resStatusCode = await headRequest(`${url}${path}`);
                    expect(resStatusCode).to.equal(statusCode);
                    return true;
                })
            );
        });

        it("should return status code when response status is 429", async function() {
            const url = "http://example.com";
            const path = "/xx";
            nock(url)
                .head(path)
                .reply(429);

            const resStatusCode = await headRequest(`${url}${path}`);
            expect(resStatusCode).to.equal(429);
            return true;
        });

        it("should throw `BadHttpResponseError` when response status is not between 200 to 299 or 429", async function() {
            return jsc.assert(
                jsc.forall(jsc.integer(300, 600), async function(statusCode) {
                    const url = "http://example.com";
                    const path = "/xx";
                    nock(url)
                        .head(path)
                        .reply(statusCode);

                    let error: any = null;
                    try {
                        await headRequest(`${url}${path}`);
                    } catch (e) {
                        error = e;
                    }
                    expect(error).to.be.an.instanceof(BadHttpResponseError);
                    expect(error.httpStatusCode).to.equal(statusCode);
                    return true;
                }),
                { tests: 3 }
            );
        });
    });

    describe("getRequest", () => {
        it("should return status code when response status is between 200 to 299", async function(this: Mocha.ISuiteCallbackContext) {
            this.timeout(5000);
            return jsc.assert(
                jsc.forall(
                    jsc.integer(200, 299),
                    jsc.integer(50, 100),
                    async function(statusCode, streamWaitTime) {
                        const url = "http://example.com";
                        const path = "/xx";
                        const scope = nock(url)
                            .get(path)
                            .reply(statusCode, () => {
                                return new RandomStream(streamWaitTime);
                            });

                        const resStatusCode = await getRequest(`${url}${path}`);
                        scope.done();
                        expect(resStatusCode).to.equal(statusCode);
                        return true;
                    }
                ),
                { tests: 3 }
            );
        });

        it("should wait until stream completes", async function(this: Mocha.ISuiteCallbackContext) {
            this.timeout(30000);
            return jsc.assert(
                jsc.forall(
                    jsc.integer(200, 299),
                    jsc.integer(1500, 3000),
                    async function(statusCode, streamWaitTime) {
                        const url = "http://example.com";
                        const path = "/xx";
                        nock(url)
                            .get(path)
                            .reply(statusCode, () => {
                                return new RandomStream(streamWaitTime);
                            });

                        const now = new Date().getTime();
                        const resStatusCode = await getRequest(`${url}${path}`);
                        const newTime = new Date().getTime();
                        const diff = newTime - now;
                        expect(resStatusCode).to.equal(statusCode);
                        expect(diff).to.closeTo(streamWaitTime, 50);
                        return true;
                    }
                ),
                { tests: 3 }
            );
        });

        it("should return status code when response status is 429", async function() {
            const url = "http://example.com";
            const path = "/xx";
            nock(url)
                .get(path)
                .reply(429);

            const resStatusCode = await getRequest(`${url}${path}`);
            expect(resStatusCode).to.equal(429);
            return true;
        });

        it("should throw `BadHttpResponseError` when response status is not between 200 to 299 or 429", async function() {
            return jsc.assert(
                jsc.forall(jsc.integer(300, 600), async function(statusCode) {
                    const url = "http://example.com";
                    const path = "/xx";
                    nock(url)
                        .get(path)
                        .reply(statusCode);

                    let error: any = null;
                    try {
                        await getRequest(`${url}${path}`);
                    } catch (e) {
                        error = e;
                    }
                    expect(error).to.be.an.instanceof(BadHttpResponseError);
                    expect(error.httpStatusCode).to.equal(statusCode);
                    return true;
                }),
                { tests: 3 }
            );
        });
    });
});
