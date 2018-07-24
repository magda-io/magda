import {} from "mocha";
import * as sinon from "sinon";
import * as express from "express";
import { expect } from "chai";
//import * as nock from "nock";
import * as _ from "lodash";
import * as supertest from "supertest";
import * as URI from "urijs";
import createDGARedirectionRouter from "../createDGARedirectionRouter";

describe("DGARedirectionRouter router", () => {
    const dgaRedirectionDomain = "ckan.data.gov.au";

    let app: express.Application;

    beforeEach(() => {
        const router = createDGARedirectionRouter({ dgaRedirectionDomain });
        app = express();
        app.use(router);
    });

    afterEach(() => {
        if ((<sinon.SinonStub>console.error).restore) {
            (<sinon.SinonStub>console.error).restore();
        }
    });

    describe("Redirect DGA /about", () => {
        it("should redirect /about to /page/about", () => {
            return supertest(app)
                .get("/about")
                .expect(checkRedirectionDetails("/page/about"));
        });
    });

    describe("Redirect DGA /api/3/*", () => {
        testCkanDomainChangeOnly(
            `https://${dgaRedirectionDomain}/api/3/action/package_search?sort=extras_harvest_portal+asc`,
            308,
            true
        );

        test404(`https://${dgaRedirectionDomain}/api/v0/registry/records/ds-dga-fa0b0d71-b8b8-4af8-bc59-0b000ce0d5e4`, true);
    });

    describe("Redirect DGA /dataset/edit", () => {
        testCkanDomainChangeOnly(
            [
                `https://${dgaRedirectionDomain}/dataset/edit`,
                `https://${dgaRedirectionDomain}/dataset/edit/xxx`,
                `https://${dgaRedirectionDomain}/dataset/edit?x=1332`
            ],
            307,
            true
        );

        test404(`https://${dgaRedirectionDomain}/dataset/editxxx`, true);
    });

    describe("Redirect DGA /dataset/new", () => {
        testCkanDomainChangeOnly(
            [
                `https://${dgaRedirectionDomain}/dataset/new`,
                `https://${dgaRedirectionDomain}/dataset/new/xxx`,
                `https://${dgaRedirectionDomain}/dataset/new?x=1332`
            ],
            307,
            true
        );

        test404(`https://${dgaRedirectionDomain}/dataset/newxxx`, true);
    });

    describe("Redirect DGA /fanstatic/*", () => {
        testCkanDomainChangeOnly(
            `https://${dgaRedirectionDomain}/fanstatic/ckanext-pdfview/:version:2017-02-15T10:30:47/css/pdf.css`,
            308,
            true
        );
    });

    describe("Redirect DGA /geoserver/*", () => {
        testCkanDomainChangeOnly(
            `https://${dgaRedirectionDomain}/geoserver/web/`,
            308,
            true
        );
    });

    describe("Redirect DGA /group", () => {
        testCkanDomainChangeOnly([
            `https://${dgaRedirectionDomain}/group`,
            `https://${dgaRedirectionDomain}/group/xxx`,
            `https://${dgaRedirectionDomain}/group?x=1332`
        ]);

        test404(`https://${dgaRedirectionDomain}/groupxxx`, true);
    });

    describe("Redirect DGA /organization & /organization?q=xxx", () => {
        it("should redirect /organization to /organisations", () => {
            return supertest(app)
                .get("/organization")
                .expect(checkRedirectionDetails("/organisations"));
        });

        it("should redirect /organization?q=xxx&sort=xx&page=xx to /organisations?q=xxx", () => {
            return supertest(app)
                .get("/organization?q=xxx&sort=xx&page=xx")
                .expect(308)
                .expect((res: supertest.Response) => {
                    const uri = URI(res.header["location"]);
                    expect(uri.segment(0)).to.equal("organisations");
                    const query = uri.search(true);
                    expect(query.q).to.equal("xxx");
                    expect(query.sort).be.an("undefined");
                    expect(query.page).be.an("undefined");
                })
        });
    });

    describe("Redirect DGA /user", () => {
        testCkanDomainChangeOnly([
            `https://${dgaRedirectionDomain}/user`,
            `https://${dgaRedirectionDomain}/user/xxx`,
            `https://${dgaRedirectionDomain}/user?x=1332`
        ],307, true);

        test404(`https://${dgaRedirectionDomain}/userxxx`, true);
    });

    describe("Redirect DGA /storage/*", () => {
        testCkanDomainChangeOnly(
            `https://${dgaRedirectionDomain}/storage/f/xxx.txt`,
            308,
            true
        );
    });

    describe("Redirect DGA /uploads/*", () => {
        testCkanDomainChangeOnly(
            `https://${dgaRedirectionDomain}/uploads/group/xxx.jpg`,
            308,
            true
        );
    });

    describe("Redirect DGA /vendor/leaflet/*", () => {
        testCkanDomainChangeOnly(
            `https://${dgaRedirectionDomain}/vendor/leaflet/0.7.3/xxx.png`,
            308,
            true
        );
    });

    function checkRedirectionDetails(location: string | RegExp) {
        return (res: supertest.Response) => {
            if (_.isRegExp(location)) {
                expect(location.test(res.header["location"])).to.equal(true);
            } else {
                expect(res.header["location"]).to.equal(location);
            }
        };
    }

    function checkStatusCode(statusCode: number = 308) {
        return (res: supertest.Response) => {
            expect(res.status).to.equal(statusCode);
        };
    }

    function testCkanDomainChangeOnly(
        targetUrlOrUrls: string | string[],
        statusCode: number = 308,
        allowAllMethod: boolean = false
    ) {
        let targetUrls: string[] = [];
        if (_.isArray(targetUrlOrUrls)) {
            targetUrls = targetUrls.concat(targetUrlOrUrls);
        } else {
            targetUrls.push(targetUrlOrUrls);
        }
        targetUrls.forEach(targetUrl => {
            const uri = URI(targetUrl);
            let testMethods = ["get"];
            if (allowAllMethod) {
                testMethods = testMethods.concat(["post", "put", "patch"]);
            }
            const uriRes = uri.resource();
            const testUri = URI(uriRes);
            if (uri.origin()) {
                testUri.origin(uri.origin());
                if (uri.protocol()) {
                    testUri.protocol(uri.protocol());
                }
            }

            testMethods.forEach(method => {
                let caseTitle = `should redirect ${method.toUpperCase()} ${uriRes} correctly`;
                if (statusCode === 404) {
                    caseTitle = `should return 404 for ${method.toUpperCase()} ${uriRes}`;
                }
                it(caseTitle, () => {
                    let test: any = supertest(app);
                    test = test[method].call(test, uriRes);
                    test = test.expect(checkStatusCode(statusCode));
                    if (statusCode === 404) return test;
                    else {
                        return test.expect(
                            checkRedirectionDetails(testUri.toString())
                        );
                    }
                });
            });
        });
    }

    function test404(
        targetUrlOrUrls: string | string[],
        allowAllMethod: boolean = false
    ) {
        testCkanDomainChangeOnly(targetUrlOrUrls, 404, allowAllMethod);
    }
});
