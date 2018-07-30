import {} from "mocha";
import * as sinon from "sinon";
import * as express from "express";
import { expect } from "chai";
import * as nock from "nock";
import * as _ from "lodash";
import * as supertest from "supertest";
import * as URI from "urijs";
import createCkanRedirectionRouter, {
    genericUrlRedirectConfig,
    covertGenericUrlRedirectConfigToFullArgList,
    genericUrlRedirectConfigs
} from "../createCkanRedirectionRouter";

describe("ckanRedirectionRouter router", () => {
    const ckanRedirectionDomain = "ckan.data.gov.au";

    let app: express.Application;
    const registryUrl = "http://registry.example.com";
    let registryScope: nock.Scope;

    beforeEach(() => {
        const router = createCkanRedirectionRouter({
            ckanRedirectionDomain,
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

    genericUrlRedirectConfigs.forEach(config =>
        testGenericCkanRedirection(config)
    );

    describe("Redirect ckan /about", () => {
        it("should redirect /about to /page/about", () => {
            return supertest(app)
                .get("/about")
                .expect(303)
                .expect(checkRedirectionDetails("/page/about"));
        });
    });

    describe("Redirect ckan /organization & /organization?q=xxx", () => {
        it("should redirect /organization to /organisations", () => {
            return supertest(app)
                .get("/organization")
                .expect(303)
                .expect(checkRedirectionDetails("/organisations"));
        });

        it("should redirect /organization?q=xxx&sort=xx&page=xx to /organisations?q=xxx", () => {
            return supertest(app)
                .get("/organization?q=xxx&sort=xx&page=xx")
                .expect(303)
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

    describe("Redirect /dataset/*", () => {
        it("should redirect /dataset/pg_skafsd0_f___00120141210_11a to /dataset/ds-dga-8beb4387-ec03-46f9-8048-3ad76c0416c8/details", () => {
            setupRegistryApiForCkanDatasetQuery();
            return supertest(app)
                .get("/dataset/pg_skafsd0_f___00120141210_11a")
                .expect(303)
                .expect(
                    checkRedirectionDetails(
                        "/dataset/ds-dga-8beb4387-ec03-46f9-8048-3ad76c0416c8/details"
                    )
                );
        });

        it("should redirect /dataset/8beb4387-ec03-46f9-8048-3ad76c0416c8 to /dataset/ds-dga-8beb4387-ec03-46f9-8048-3ad76c0416c8/details", () => {
            setupRegistryApiForCkanDatasetQuery();
            return supertest(app)
                .get("/dataset/8beb4387-ec03-46f9-8048-3ad76c0416c8")
                .expect(303)
                .expect(
                    checkRedirectionDetails(
                        "/dataset/ds-dga-8beb4387-ec03-46f9-8048-3ad76c0416c8/details"
                    )
                );
        });

        it("should redirect /dataset/unknown-name to /error?errorCode=404&recordType=ckan-dataset&recordId=unknown-name", () => {
            setupRegistryApiForCkanDatasetQuery();
            return supertest(app)
                .get("/dataset/unknown-name")
                .expect(303)
                .expect(
                    checkRedirectionDetails(
                        "/error?errorCode=404&recordType=ckan-dataset&recordId=unknown-name"
                    )
                );
        });
    });

    describe("Redirect /dataset/*/resource/*", () => {
        it("should redirect /dataset/pg_skafsd0_f___00120141210_11a/resource/af618603-e529-4998-b977-e8751f291e6e to /dataset/ds-dga-8beb4387-ec03-46f9-8048-3ad76c0416c8/details", () => {
            setupRegistryApiForCkanDatasetQuery();
            return supertest(app)
                .get(
                    "/dataset/pg_skafsd0_f___00120141210_11a/resource/af618603-e529-4998-b977-e8751f291e6e"
                )
                .expect(303)
                .expect(
                    checkRedirectionDetails(
                        "/dataset/ds-dga-8beb4387-ec03-46f9-8048-3ad76c0416c8/details"
                    )
                );
        });

        it("should redirect /dataset/missing-ckan-id/resource/af618603-e529-4998-b977-e8751f291e6e to /dataset/ds-dga-8beb4387-ec03-46f9-8048-3ad76c0416c8/details", () => {
            setupRegistryApiForCkanDatasetQuery();
            return supertest(app)
                .get(
                    "/dataset/missing-ckan-id/resource/af618603-e529-4998-b977-e8751f291e6e"
                )
                .expect(303)
                .expect(
                    checkRedirectionDetails(
                        "/dataset/ds-dga-8beb4387-ec03-46f9-8048-3ad76c0416c8/details"
                    )
                );
        });

        it("should redirect /dataset/wrong-ckan-id/resource/wrong-ckan-resource-id to /error?errorCode=404&recordType=ckan-resource&recordId=wrong-ckan-resource-id", () => {
            setupRegistryApiForCkanDatasetQuery();
            return supertest(app)
                .get("/dataset/wrong-ckan-id/resource/wrong-ckan-resource-id")
                .expect(303)
                .expect(
                    checkRedirectionDetails(
                        "/error?errorCode=404&recordType=ckan-resource&recordId=wrong-ckan-resource-id"
                    )
                );
        });
    });

    describe("Redirect /organization/:ckanIdOrName", () => {
        it("should redirect /organization/australianbureauofstatistics-geography to /organisations/org-dga-760c24b1-3c3d-4ccb-8196-41530fcdebd5", () => {
            setupRegistryApiForCkanDatasetQuery();
            return supertest(app)
                .get("/organization/australianbureauofstatistics-geography")
                .expect(303)
                .expect(
                    checkRedirectionDetails(
                        "/organisations/org-dga-760c24b1-3c3d-4ccb-8196-41530fcdebd5"
                    )
                );
        });

        it("should redirect /organization/760c24b1-3c3d-4ccb-8196-41530fcdebd5 to /organisations/org-dga-760c24b1-3c3d-4ccb-8196-41530fcdebd5", () => {
            setupRegistryApiForCkanDatasetQuery();
            return supertest(app)
                .get("/organization/760c24b1-3c3d-4ccb-8196-41530fcdebd5")
                .expect(303)
                .expect(
                    checkRedirectionDetails(
                        "/organisations/org-dga-760c24b1-3c3d-4ccb-8196-41530fcdebd5"
                    )
                );
        });

        it("should redirect /organization/unknown-name-or-id to /error?errorCode=404&recordType=ckan-organization-details&recordId=unknown-name-or-id", () => {
            setupRegistryApiForCkanDatasetQuery();
            return supertest(app)
                .get("/organization/unknown-name-or-id")
                .expect(303)
                .expect(
                    checkRedirectionDetails(
                        "/error?errorCode=404&recordType=ckan-organization-details&recordId=unknown-name-or-id"
                    )
                );
        });
    });

    function setupRegistryApiForCkanDatasetQuery() {
        const errorResponse = `{
            "hasMore": false,
            "records": [ ]
        }`;

        const okCkanDatasetResponse = `{
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

        const okCkanResource = `{
            "hasMore": false,
            "records": [
              {
                "id": "dist-dga-af618603-e529-4998-b977-e8751f291e6e",
                "name": "wwLink to Australian Fish and Fisheries web site managed by Fisheries Research and Development Corporation",
                "aspects": {
                  "ckan-resource": {
                    "mimetype": "audio/basic",
                    "format": "HTML",
                    "name": "wwLink to Australian Fish and Fisheries web site managed by Fisheries Research and Development Corporation",
                    "package_id": "8beb4387-ec03-46f9-8048-3ad76c0416c8",
                    "datastore_active": false,
                    "size": null,
                    "state": "active",
                    "url": "http://www.fish.gov.au",
                    "description": "KeyDocument 01 \\r\\n Website with details about Australian Fisheries, and fish stocks",
                    "resource_type": null,
                    "url_type": null,
                    "last_modified": "2014-12-10T00:00:00",
                    "hash": "",
                    "id": "af618603-e529-4998-b977-e8751f291e6e",
                    "cache_url": null,
                    "wms_layer": "",
                    "position": 0,
                    "mimetype_inner": null,
                    "cache_last_updated": null,
                    "revision_id": "af1d049b-8074-4b92-ac5c-1431a8942f14",
                    "created": "2018-07-19T23:56:15.464718"
                  }
                },
                "sourceTag": "45262f84-5043-443a-a028-377108bda3b5"
              }
            ]
          }`;

        const okCkanOrganizationQueryResponse = `{
            "hasMore": true,
            "nextPageToken": "88922",
            "records": [
              {
                "id": "ds-dga-9eb34d32-5548-46ae-8668-851217428731",
                "name": "Census (1981 Edition) - Boundaries",
                "aspects": {
                  "dataset-publisher": {
                    "publisher": "org-dga-760c24b1-3c3d-4ccb-8196-41530fcdebd5"
                  }
                },
                "sourceTag": "45262f84-5043-443a-a028-377108bda3b5"
              }
            ]
          }`;

        registryScope
            .persist()
            .get("/records")
            .query(true)
            .reply(200, function(uri: string) {
                const uriObj = URI(uri);
                const query = uriObj.search(true);
                if (!query || !query.aspectQuery) return errorResponse;
                const [path, value] = query.aspectQuery.split(":");
                if (
                    path === "ckan-dataset.name" &&
                    value === "pg_skafsd0_f___00120141210_11a"
                ) {
                    return okCkanDatasetResponse;
                } else if (
                    path === "ckan-dataset.id" &&
                    value === "8beb4387-ec03-46f9-8048-3ad76c0416c8"
                ) {
                    return okCkanDatasetResponse;
                } else if (
                    path === "ckan-dataset.organization.id" &&
                    value === "760c24b1-3c3d-4ccb-8196-41530fcdebd5"
                ) {
                    return okCkanOrganizationQueryResponse;
                } else if (
                    path === "ckan-dataset.organization.name" &&
                    value === "australianbureauofstatistics-geography"
                ) {
                    return okCkanOrganizationQueryResponse;
                } else if (
                    path === "ckan-resource.id" &&
                    value === "af618603-e529-4998-b977-e8751f291e6e"
                ) {
                    return okCkanResource;
                } else if (
                    path === "ckan-resource.name" &&
                    value ===
                        "wwLink to Australian Fish and Fisheries web site managed by Fisheries Research and Development Corporation"
                ) {
                    return okCkanResource;
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

    function testGenericCkanRedirection(config: genericUrlRedirectConfig) {
        const [
            path,
            requireExtraSeqment,
            statusCode,
            method
        ] = covertGenericUrlRedirectConfigToFullArgList(config);
        const allowAllMethod = method === "all";
        const testUrlList = [
            `https://${ckanRedirectionDomain}${path}/xxx`,
            `https://${ckanRedirectionDomain}${path}/xxx?q=xxx`
        ];
        if (!requireExtraSeqment) {
            testUrlList.push(`https://${ckanRedirectionDomain}${path}`);
            testUrlList.push(`https://${ckanRedirectionDomain}${path}?q=xxx`);
        }
        describe(`Redirect CKan URL ${path}`, () => {
            testCkanDomainChangeOnly(testUrlList, statusCode, allowAllMethod);
            test404(
                `https://${ckanRedirectionDomain}/${path}xxx`,
                allowAllMethod
            );
        });
    }
});
