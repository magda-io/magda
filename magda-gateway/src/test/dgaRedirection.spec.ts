import {} from "mocha";
import * as sinon from "sinon";
import * as express from "express";
import { expect } from "chai";
//import * as nock from "nock";
import * as _ from "lodash";
import * as supertest from "supertest";
import * as escapeStringRegexp from "escape-string-regexp";
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
        it(`should redirect GET /api/3/* to https://${dgaRedirectionDomain}/api/3/*`, () => {
            return supertest(app)
                .get("/api/3/action/package_search?sort=extras_harvest_portal+asc")
                .expect(checkRedirectionDetails(new RegExp(escapeStringRegexp(`https://${dgaRedirectionDomain}/api/3/`)+".+")));
        });

        it(`should redirect POST /api/3/* to https://${dgaRedirectionDomain}/api/3/*`, () => {
            return supertest(app)
                .post("/api/3/action/package_search?sort=extras_harvest_portal+asc")
                .expect(checkRedirectionDetails(new RegExp(escapeStringRegexp(`https://${dgaRedirectionDomain}/api/3/`)+".+")));
        });

        it(`should response 404 for to /api/v0/registry/records/ds-dga-fa0b0d71-b8b8-4af8-bc59-0b000ce0d5e4`, () => {
            return supertest(app)
                .get("/api/v0/registry/records/ds-dga-fa0b0d71-b8b8-4af8-bc59-0b000ce0d5e4")
                .expect(404);
        });
    });

    describe("Redirect DGA /dataset/edit", () => {
        it(`should redirect GET /dataset/edit to https://${dgaRedirectionDomain}/dataset/edit`, () => {
            return supertest(app)
                .get("/dataset/edit")
                .expect(checkRedirectionDetails(`https://${dgaRedirectionDomain}/dataset/edit`,307));
        });

        it(`should redirect GET /dataset/edit/abc to https://${dgaRedirectionDomain}/dataset/edit/abc`, () => {
            return supertest(app)
                .get("/dataset/edit/abc")
                .expect(checkRedirectionDetails(`https://${dgaRedirectionDomain}/dataset/edit/abc`,307));
        });

    });

    describe("Redirect DGA /dataset/new", () => {
        it(`should redirect GET /dataset/new to https://${dgaRedirectionDomain}/dataset/new`, () => {
            return supertest(app)
                .get("/dataset/new")
                .expect(checkRedirectionDetails(`https://${dgaRedirectionDomain}/dataset/new`,307));
        });

        it(`should redirect GET /dataset/new/abc to https://${dgaRedirectionDomain}/dataset/new/abc`, () => {
            return supertest(app)
                .get("/dataset/new/abc")
                .expect(checkRedirectionDetails(`https://${dgaRedirectionDomain}/dataset/new/abc`,307));
        });
        
    });

    function checkRedirectionDetails(
        location: string | RegExp,
        statusCode: number = 308
    ) {
        return (res: supertest.Response) => {
            expect(res.status).to.equal(statusCode);
            if (_.isRegExp(location)) {
                expect(location.test(res.header["location"])).to.equal(true);
            } else {
                expect(res.header["location"]).to.equal(location);
            }
        };
    }
});
