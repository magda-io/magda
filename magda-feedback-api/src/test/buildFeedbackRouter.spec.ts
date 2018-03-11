import {} from "mocha";
import * as sinon from "sinon";
import * as express from "express";
import { expect } from "chai";
import * as nock from "nock";
import * as supertest from "supertest";
import buildFeedbackRouter from "../buildFeedbackRouter";

describe("sitemap router", () => {
    const githubUrl = "https://github.com/post";

    let githubScope: nock.Scope;

    beforeEach(() => {
        githubScope = nock("https://github.com");
    });

    afterEach(() => {
        githubScope.done();
        githubScope.removeAllListeners();
    });

    describe("user feedback", () => {
        const TITLE = "This is a title";
        const COMMENT = "This is a comment";
        const NAME = "This is a name";
        const EMAIL = "test@example.com";
        const IP = "127.0.0.1";
        const SHARE_LINK = "http://nationalmap.gov.au";
        const SPECIFIC_UA = "specificua";
        const REFERRER = "thisisareferrer";

        it("should post to github if instructed", () => {
            const router = buildFeedbackRouter({
                trustProxy: true,
                shouldPostToGithub: true,
                gitHubPostUrl: githubUrl,
                userAgent: "defaultua"
            });

            githubScope
                .post("/post", function(this: any, body: any) {
                    expect(body.title).to.equal(TITLE);
                    checkReportBody(body.body);
                    return true;
                })
                .reply(200);

            return doPost(router).expect(200);
        });

        it("should log to console if instructed", () => {
            const stub = sinon.stub(console, "log");

            const router = buildFeedbackRouter({
                trustProxy: true,
                shouldPostToGithub: false,
                gitHubPostUrl: githubUrl,
                userAgent: "defaultua"
            });

            doPost(router).then(() => {
                checkReportBody(stub.lastCall.args[0]);
                (console.log as sinon.SinonStub).restore();
            });
        });

        function doPost(router: express.Express) {
            return supertest(router)
                .post("/v0/user")
                .set({
                    "User-Agent": SPECIFIC_UA,
                    Referrer: REFERRER
                })
                .send({
                    title: TITLE,
                    comment: COMMENT,
                    name: NAME,
                    email: EMAIL,
                    shareLink: SHARE_LINK
                })
                .expect(200);
        }

        function checkReportBody(body: string) {
            expect(body).to.contain(COMMENT);
            expect(body).to.contain(NAME);
            expect(body).to.contain(EMAIL);
            expect(body).to.contain(IP);
            expect(body).to.contain(SHARE_LINK);
            expect(body).to.contain(SPECIFIC_UA);
            expect(body).to.contain(REFERRER);
        }
    });

    describe("CSP Report", () => {
        const DOCUMENT_URI = "Document URI";
        const REFERRER = "thisisareferrer";
        const BLOCKED_URI = "http://magda.com/blocked";
        const VIOLATED_DIRECTIVE = "default-src: 'self'";
        const ORIGINAL_POLICY = "default-script: 'unsafe-eval'";

        it("should post to github if instructed", () => {
            const router = buildFeedbackRouter({
                trustProxy: true,
                shouldPostToGithub: true,
                gitHubPostUrl: githubUrl,
                userAgent: "defaultua"
            });

            githubScope
                .post("/post", function(this: any, body: any) {
                    checkReportBody(body.body);
                    return true;
                })
                .reply(200);

            return doPost(router);
        });

        it("should log to console if instructed", () => {
            const stub = sinon.stub(console, "log");

            const router = buildFeedbackRouter({
                trustProxy: true,
                shouldPostToGithub: false,
                gitHubPostUrl: githubUrl,
                userAgent: "defaultua"
            });

            return doPost(router).then(() => {
                checkReportBody(stub.lastCall.args[0]);
                (console.log as sinon.SinonStub).restore();
            });
        });

        function doPost(router: express.Express) {
            return supertest(router)
                .post("/v0/csp")
                .send({
                    "csp-report": {
                        "document-uri": DOCUMENT_URI,
                        referrer: REFERRER,
                        "blocked-uri": BLOCKED_URI,
                        "violated-directive": VIOLATED_DIRECTIVE,
                        "original-policy": ORIGINAL_POLICY
                    }
                })
                .expect(200);
        }

        function checkReportBody(body: string) {
            expect(body).to.contain(DOCUMENT_URI);
            expect(body).to.contain(REFERRER);
            expect(body).to.contain(BLOCKED_URI);
            expect(body).to.contain(VIOLATED_DIRECTIVE);
            expect(body).to.contain(ORIGINAL_POLICY);
            expect(body).to.contain(REFERRER);
        }
    });
});
