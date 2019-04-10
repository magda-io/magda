import * as nock from "nock";

import JsonConnector from "@magda/typescript-common/dist/JsonConnector";
import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";

import Csw from "../Csw";
import createTransformer from "../createTransformer";
import datasetAspectBuilders from "../datasetAspectBuilders";
import distributionAspectBuilders from "../distributionAspectBuilders";
import organizationAspectBuilders from "../organizationAspectBuilders";

const ID = "CSW";
const BASE_CSW_URL = "https://csw.example.com";
const REGISTRY_URL = "https://registry.example.com";
const PAGE_SIZE = 100;

describe("csw connector", () => {
    let connector: JsonConnector;
    let cswScope: nock.Scope;
    let registryScope: nock.Scope;

    beforeEach(() => {
        const csw = new Csw({
            id: ID,
            baseUrl: BASE_CSW_URL,
            name: ID,
            pageSize: PAGE_SIZE
        });

        const registry = new Registry({
            baseUrl: REGISTRY_URL,
            jwtSecret: "squirrel",
            userId: "12345",
            tenantId: undefined
        });

        const transformerOptions = {
            id: ID,
            name: ID,
            sourceUrl: BASE_CSW_URL,
            pageSize: PAGE_SIZE,
            ignoreHarvestSources: [] as any[],
            registryUrl: REGISTRY_URL,
            datasetAspectBuilders,
            distributionAspectBuilders,
            organizationAspectBuilders
        };

        const transformer = createTransformer(transformerOptions);

        connector = new JsonConnector({
            source: csw,
            transformer: transformer,
            registry: registry
        });

        cswScope = nock(BASE_CSW_URL);
        registryScope = nock(REGISTRY_URL);
    });

    it("should parse qspatial response with missing ids without crashing", () => {
        cswScope
            .get(
                "/?service=CSW&version=2.0.2&request=GetRecords&constraintLanguage=FILTER&constraint_language_version=1.1.0&resultType=results&elementsetname=full&outputschema=http%3A%2F%2Fwww.isotc211.org%2F2005%2Fgmd&typeNames=gmd%3AMD_Metadata&startPosition=1&maxRecords=100"
            )
            .replyWithFile(200, require.resolve("./qspatial-response.xml"));

        registryScope
            .put(/.*/)
            .times(100000)
            .reply(200);

        registryScope.delete(/.*/).reply(200, { count: 2 });

        return connector.run();
    }).timeout(30000);
});
