import {} from "mocha";
import * as sinon from "sinon";
import * as express from "express";
import { expect } from "chai";
import * as nock from "nock";
import * as _ from "lodash";
import * as supertest from "supertest";
import * as URI from "urijs";
import createDGARedirectionRouter from "../createDGARedirectionRouter";

describe("DGARedirectionRouter router", () => {
    const dgaRedirectionDomain = "ckan.data.gov.au";

    let app: express.Application;
    const registryUrl = "http://registry.example.com";
    let registryScope: nock.Scope;

    beforeEach(() => {
        const router = createDGARedirectionRouter({
            dgaRedirectionDomain,
            registryApiBaseUrlInternal: registryUrl
        });
        app = express();
        app.use(router);
        registryScope = nock(registryUrl);
    });

    afterEach(() => {
        if ((<sinon.SinonStub>console.error).restore) {
            (<sinon.SinonStub>console.error).restore();
        }
        nock.cleanAll();
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

        test404(
            `https://${dgaRedirectionDomain}/api/v0/registry/records/ds-dga-fa0b0d71-b8b8-4af8-bc59-0b000ce0d5e4`,
            true
        );
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
                });
        });
    });

    describe("Redirect DGA /user", () => {
        testCkanDomainChangeOnly(
            [
                `https://${dgaRedirectionDomain}/user`,
                `https://${dgaRedirectionDomain}/user/xxx`,
                `https://${dgaRedirectionDomain}/user?x=1332`
            ],
            307,
            true
        );

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

    describe("Redirect /dataset/*", () => {
        //--/records?aspectQuery=ckan-dataset.name:pg_skafsd0_f___00120141210_11a

        it("should redirect /dataset/pg_skafsd0_f___00120141210_11a to /dataset/ds-dga-8beb4387-ec03-46f9-8048-3ad76c0416c8/details", () => {
            setupRegistryApiForCkanDatasetQuery();
            return supertest(app)
                .get("/dataset/pg_skafsd0_f___00120141210_11a")
                .expect(checkRedirectionDetails("/dataset/ds-dga-8beb4387-ec03-46f9-8048-3ad76c0416c8/details"));
        });

        it("should redirect /dataset/8beb4387-ec03-46f9-8048-3ad76c0416c8 to /dataset/ds-dga-8beb4387-ec03-46f9-8048-3ad76c0416c8/details", () => {
            setupRegistryApiForCkanDatasetQuery();
            return supertest(app)
                .get("/dataset/8beb4387-ec03-46f9-8048-3ad76c0416c8")
                .expect(checkRedirectionDetails("/dataset/ds-dga-8beb4387-ec03-46f9-8048-3ad76c0416c8/details"));
        });

        it("should redirect /dataset/unknown-name to /page/ckan-dataset-not-found?token=unknown-name", () => {
            setupRegistryApiForCkanDatasetQuery();
            return supertest(app)
                .get("/dataset/unknown-name")
                .expect(checkRedirectionDetails("/page/ckan-dataset-not-found?token=unknown-name"));
        });

    });

    function setupRegistryApiForCkanDatasetQuery() {
        const errorResponse = `{
            hasMore: false,
            records: [ ]
        }`;

        const okResponse = `{
            "hasMore": false,
            "records": [
              {
                "id": "ds-dga-8beb4387-ec03-46f9-8048-3ad76c0416c8",
                "name": "Status of key Australian fish stocks reports 2014",
                "aspects": {},
                "sourceTag": "7b5a3341-9f8c-49c3-ad98-5015833420fe"
              }
            ]
          }`;

        registryScope
            .get("/records")
            .query(true)
            .reply(200, function(uri: string) {
                const uriObj = URI(uri);
                const query = uriObj.search(true);
                if (!query || !query.aspectQuery) return errorResponse;
                const [path, value] = query.aspectQuery.split(":");
                if (
                    path === "ckan-dataset.name" &&
                    value === "pg_skafsd0_f___00120141210_11"
                ) {
                    return okResponse;
                } else if (
                    path === "ckan-dataset.id" &&
                    value === "8beb4387-ec03-46f9-8048-3ad76c0416c8"
                ) {
                    return okResponse;
                } else {
                    return errorResponse;
                }
            });
    }

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
