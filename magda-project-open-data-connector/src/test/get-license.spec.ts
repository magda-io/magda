import {} from "mocha";
import * as nock from "nock";
import { expect } from "chai";

import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";
import JsonConnector from "@magda/typescript-common/dist/JsonConnector";

import createTransformer from "../createTransformer";
import ProjectOpenData from "../ProjectOpenData";
import organizationAspectBuilders from "../organizationAspectBuilders";
import datasetAspectBuilders from "../datasetAspectBuilders";
import distributionAspectBuilders from "../distributionAspectBuilders";
import ProjectOpenDataTransformer from "../ProjectOpenDataTransformer";

describe("when distributions have a license as a custom URL", function(this: Mocha.ISuiteCallbackContext) {
    let registry: Registry;
    let source: ProjectOpenData;
    let transformer: ProjectOpenDataTransformer;
    let connector: JsonConnector;
    let dataJson: any;
    let distributions: any[];

    beforeEach(() => {
        dataJson = {
            "@context":
                "https://project-open-data.cio.gov/v1.1/schema/catalog.jsonld",
            "@type": "dcat:Catalog",
            conformsTo: "https://project-open-data.cio.gov/v1.1/schema",
            describedBy:
                "https://project-open-data.cio.gov/v1.1/schema/catalog.json",
            dataset: [
                {
                    "@type": "dcat:Dataset",
                    identifier:
                        "http://data-logancity.opendata.arcgis.com/datasets/bc07c26cb26d4b4880715f3e55ccdb17_0",
                    title: "Logan City Council Building Works Applications",
                    description:
                        "Building work approval data by application number, application type, description of building work and address. This information is also available on Council’s public PD Online system.",
                    keyword: [
                        "Planning Building",
                        " Building works",
                        " Logan City Council",
                        " LCC Open Data",
                        " Business"
                    ],
                    issued: "2017-07-28T01:17:20.000Z",
                    modified: "2019-01-08T19:04:24.209Z",
                    publisher: { name: "Logan City Council" },
                    contactPoint: {
                        "@type": "vcard:Contact",
                        fn: "Matthew Maguire",
                        hasEmail: "mailto:council@logan.qld.gov.au"
                    },
                    accessLevel: "public",
                    distribution: [
                        {
                            "@type": "dcat:Distribution",
                            title: "ArcGIS Open Dataset",
                            format: "Web page",
                            mediaType: "text/html",
                            accessURL:
                                "http://data-logancity.opendata.arcgis.com/datasets/bc07c26cb26d4b4880715f3e55ccdb17_0"
                        },
                        {
                            "@type": "dcat:Distribution",
                            title: "Esri Rest API",
                            format: "Esri REST",
                            mediaType: "application/json",
                            accessURL:
                                "https://services5.arcgis.com/ZUCWDRj8F77Xo351/arcgis/rest/services/Logan_City_Council_Building_Works_Applications/FeatureServer/0"
                        },
                        {
                            "@type": "dcat:Distribution",
                            title: "GeoJSON",
                            format: "GeoJSON",
                            mediaType: "application/vnd.geo+json",
                            downloadURL:
                                "http://data-logancity.opendata.arcgis.com/datasets/bc07c26cb26d4b4880715f3e55ccdb17_0.geojson"
                        },
                        {
                            "@type": "dcat:Distribution",
                            title: "CSV",
                            format: "CSV",
                            mediaType: "text/csv",
                            downloadURL:
                                "http://data-logancity.opendata.arcgis.com/datasets/bc07c26cb26d4b4880715f3e55ccdb17_0.csv"
                        },
                        {
                            "@type": "dcat:Distribution",
                            title: "KML",
                            format: "KML",
                            mediaType: "application/vnd.google-earth.kml+xml",
                            downloadURL:
                                "http://data-logancity.opendata.arcgis.com/datasets/bc07c26cb26d4b4880715f3e55ccdb17_0.kml"
                        },
                        {
                            "@type": "dcat:Distribution",
                            title: "Shapefile",
                            format: "ZIP",
                            mediaType: "application/zip",
                            downloadURL:
                                "http://data-logancity.opendata.arcgis.com/datasets/bc07c26cb26d4b4880715f3e55ccdb17_0.zip"
                        }
                    ],
                    landingPage:
                        "http://data-logancity.opendata.arcgis.com/datasets/bc07c26cb26d4b4880715f3e55ccdb17_0",
                    webService:
                        "https://services5.arcgis.com/ZUCWDRj8F77Xo351/arcgis/rest/services/Logan_City_Council_Building_Works_Applications/FeatureServer/0",
                    license: "http://license.example.com",
                    spatial:
                        "152.8061156622849,-27.936405953929796,153.28713764921812,-27.58739121942008",
                    theme: ["geospatial"]
                }
            ]
        };

        registry = new Registry({
            jwtSecret: "secret",
            userId: "",
            baseUrl: "http://registry.example.com",
            tenantId: undefined
        });

        source = new ProjectOpenData({
            id: "id",
            name: "name",
            url: "http://source.example.com"
        });

        transformer = createTransformer({
            id: "id",
            name: "name",
            sourceUrl: "http://source.example.com",
            datasetAspectBuilders,
            distributionAspectBuilders,
            organizationAspectBuilders
        });

        connector = new JsonConnector({
            source: source,
            transformer: transformer,
            registry: registry
        });

        nock("http://registry.example.com")
            .put(
                path =>
                    path.startsWith("/aspects") ||
                    path.startsWith("/records/org") ||
                    path.startsWith("/records/ds"),
                () => true
            )
            .optionally()
            .times(1000)
            .reply(200);

        nock("http://registry.example.com")
            .delete(
                path => path.startsWith("/records?sourceTagToPreserve"),
                () => true
            )
            .optionally()
            .times(1000)
            .reply(200, JSON.stringify({ count: 0 }));

        nock("http://source.example.com")
            .get("/")
            .reply(200, () => JSON.stringify(dataJson));

        distributions = [];
        nock("http://registry.example.com")
            .put(
                path =>
                    path.startsWith(
                        "/records/dist-id-" +
                            encodeURIComponent(
                                "http://data-logancity.opendata.arcgis.com/datasets/bc07c26cb26d4b4880715f3e55ccdb17_0-"
                            )
                    ),
                (distribution: any) => {
                    distributions.push(distribution);
                    return true;
                }
            )
            .times(6)
            .reply(200);
    });

    afterEach(() => {
        nock.cleanAll();
    });

    it("should request license if it's a URL", async () => {
        nock("http://license.example.com")
            .get("/")
            .reply(200, JSON.stringify({ description: "This is a license" }));

        await connector.run();

        expect(distributions).not.to.be.empty;
        distributions.forEach(dist => {
            expect(dist.aspects["dcat-distribution-strings"].license).to.equal(
                "This is a license"
            );
        });
    });

    it("should record license as creative commons if it contains a link to creative commons", async () => {
        nock("http://license.example.com")
            .get("/")
            .reply(
                200,
                JSON.stringify({
                    description:
                        'Blah blah blah <a href="http://creativecommons.org/licenses/blahlicense">this is the license</a>'
                })
            );

        await connector.run();

        expect(distributions).not.to.be.empty;
        distributions.forEach(dist => {
            expect(dist.aspects["dcat-distribution-strings"].license).to.equal(
                "http://creativecommons.org/licenses/blahlicense"
            );
        });
    });

    it("should record license as creative commons if it's a URL with creative commons", async () => {
        dataJson.dataset[0].license = "https://creativecommons.org/anything";

        await connector.run();

        expect(distributions).not.to.be.empty;
        distributions.forEach(dist => {
            expect(dist.aspects["dcat-distribution-strings"].license).to.equal(
                "https://creativecommons.org/anything"
            );
        });
    });

    it("should not fail if the URL returns no body", async () => {
        nock("http://license.example.com")
            .get("/")
            .reply(200);

        await connector.run();

        expect(distributions).not.to.be.empty;
        distributions.forEach(dist => {
            expect(dist.aspects["dcat-distribution-strings"].license).to.equal(
                "http://license.example.com"
            );
        });
    });

    it("should not fail if the response returns no datasets", async () => {
        dataJson.dataset = undefined;

        await connector.run();
    });
});
