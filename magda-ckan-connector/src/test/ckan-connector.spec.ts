import { expect } from "chai";
import "mocha";
import * as nock from "nock";
import Ckan from "../Ckan";
import CkanTransformer from "../CkanTransformer";
import JsonConnector, {
    JsonConnectorConfig
} from "@magda/typescript-common/dist/JsonConnector";
import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";
import AspectBuilder from "@magda/typescript-common/src/AspectBuilder";

describe("JsonTransformer", () => {
    before(() => {
        nock.disableNetConnect();
    });

    after(() => {
        nock.enableNetConnect();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    function setupCrawlTest(
        config: JsonConnectorConfig,
        datasetAspectBuilders: AspectBuilder[] = undefined,
        distributionAspectBuilders: AspectBuilder[] = undefined,
        organizationAspectBuilders: AspectBuilder[] = undefined,
        libraries: any = undefined
    ) {
        const source = new Ckan({
            baseUrl: config.sourceUrl,
            id: config.id,
            name: config.name,
            pageSize: config.pageSize,
            ignoreHarvestSources: config.ignoreHarvestSources,
            allowedOrganisationName: config.allowedOrganisationName
        });

        const transformer = new CkanTransformer({
            sourceId: config.id,
            datasetAspectBuilders,
            distributionAspectBuilders,
            organizationAspectBuilders,
            libraries
        });

        const registryScope = nock("http://example.com").log(console.log);
        const sourceScope = nock(config.sourceUrl).log(console.log);

        const registry = new Registry({
            baseUrl: "http://example.com",
            jwtSecret: "squirrel",
            userId: "1",
            maxRetries: 0
        });

        const connector = new JsonConnector({
            source,
            transformer,
            registry
        });

        return {
            sourceScope,
            registryScope,
            registry,
            source,
            transformer,
            connector
        };
    }

    const ckanPackageSearchResponse = {
        help:
            "https://data.gov.au/data/api/3/action/help_show?name=package_search",
        success: true,
        result: {
            count: 1,
            sort: "metadata_created asc",
            facets: {},
            results: [
                {
                    id: "e99b2a9e-8f60-4121-b35e-b788a35f982d",
                    type: "dataset",
                    num_resources: 0,
                    name: "wels",
                    isopen: true,
                    notes: "xxxx",
                    title: "test dataset title"
                }
            ],
            search_facets: {}
        }
    };

    const ckanOrgResponse = {
        help:
            "https://data.gov.au/data/api/3/action/help_show?name=organization_show",
        success: true,
        result: {
            display_name: "Test department",
            description: "test description",
            package_count: 1,
            name: "deptxxx",
            is_organization: true,
            state: "active",
            type: "organization",
            title: "Test department",
            id: "f4833158-3d11-4d3a-897e-b4e5fa9c11d0"
        }
    };

    it("Should filter by organisation if `allowedOrganisationName` is specified", function() {
        this.timeout(5000000);
        const organisationName = "deptxxx";
        const { sourceScope, registryScope, connector } = setupCrawlTest({
            id: "test-ckan-connector",
            name: "Test Ckan Connector",
            ignoreHarvestSources: ["*"],
            pageSize: 100,
            allowedOrganisationName: organisationName,
            sourceUrl: "http://test-ckan.com"
        });

        /**
         * Connector should call organization_show api instead with org name as id parameter
         */
        sourceScope
            .get(/\/organization_show/)
            .query({
                id: organisationName
            })
            .reply(200, ckanOrgResponse);

        /**
         * Connector should call package_search api with extra `fq` query
         */
        sourceScope
            .get(/\/package_search/)
            .query((q: any) => {
                const fq: string = q.fq;
                expect(fq).include(`organization:"${organisationName}"`);
                expect(fq).include("-harvest_source_title:*");
                return true;
            })
            .reply(200, ckanPackageSearchResponse);

        registryScope
            .persist()
            .put(new RegExp("/records"), (body: any) => {
                return body.sourceTag === connector.sourceTag;
            })
            .reply(200);

        registryScope.delete(/.*/).reply(201, { count: 0 });

        return connector.run().then(result => {
            // --- make sure all mocks are satisfied
            sourceScope.done();
            registryScope.done();
        });
    });
});
