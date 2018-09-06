"use strict";

const child = require("child_process");
const assert = require("assert");
import { MockRegistry } from "./MockRegistry";
import { MockOpenDataCatalog } from "./MockOpenDataCatalog";

describe("connector", function() {
    this.timeout(15000);
    function run(done: any) {
        const command = [
            "src",
            "--id=connector",
            "--name=Connector",
            "--sourceUrl=http://localhost:8888/data.json",
            "--registryUrl=http://localhost:8889",
            "--jwtSecret=nerdgasm",
            "--userId=user"
        ];
        const proc = child.spawn("ts-node", command, {
            stdout: process.stdout,
            stderr: process.stderr
        });
        proc.on("close", done);
    }

    let servers: any[] = [];
    let registry: any;

    beforeEach(function() {
        servers.push((registry = new MockRegistry().run(8889)));
    });

    afterEach(function() {
        servers.forEach(server => server.server.close());
    });

    it("should run", function(done) {
        servers.push(
            new MockOpenDataCatalog({
                "@type": "dcat:Catalog",
                dataset: [
                    {
                        "@type": "dcat:Dataset",
                        identifier: "dataset-id",
                        description: "dataset-desc",
                        title: "dataset-title",
                        license: "dataset-license-url",
                        distribution: [
                            {
                                "@type": "dcat:Distribution",
                                downloadURL: "dataset-url/dataset.csv",
                                mediaType: "text/csv"
                            },
                            {
                                "@type": "dcat:Distribution",
                                downloadURL: "dataset-url/dataset.json",
                                mediaType: "application/json"
                            }
                        ]
                    }
                ]
            }).run(8888)
        );
        run(() => {
            Object.values(registry.records).forEach(
                record => (record.sourceTag = "stag")
            );

            assert.deepEqual(registry.records, {
                "dist-connector-dataset-id-0": {
                    id: "dist-connector-dataset-id-0",
                    name: "dataset-id-0",
                    aspects: {
                        "project-open-data-distribution": {
                            "@type": "dcat:Distribution",
                            downloadURL: "dataset-url/dataset.csv",
                            mediaType: "text/csv"
                        },
                        "dcat-distribution-strings": {
                            downloadURL: "dataset-url/dataset.csv",
                            mediaType: "text/csv",
                            license: "dataset-license-url"
                        },
                        source: {
                            type: "project-open-data-distribution",
                            url: "http://localhost:8888/data.json",
                            id: "connector",
                            name: "Connector"
                        }
                    },
                    sourceTag: "stag"
                },
                "dist-connector-dataset-id-1": {
                    id: "dist-connector-dataset-id-1",
                    name: "dataset-id-1",
                    aspects: {
                        "project-open-data-distribution": {
                            "@type": "dcat:Distribution",
                            downloadURL: "dataset-url/dataset.json",
                            mediaType: "application/json"
                        },
                        "dcat-distribution-strings": {
                            downloadURL: "dataset-url/dataset.json",
                            mediaType: "application/json",
                            license: "dataset-license-url"
                        },
                        source: {
                            type: "project-open-data-distribution",
                            url: "http://localhost:8888/data.json",
                            id: "connector",
                            name: "Connector"
                        }
                    },
                    sourceTag: "stag"
                },
                "org-connector-": {
                    id: "org-connector-",
                    aspects: {
                        source: {
                            type: "project-open-data-organization",
                            url: "http://localhost:8888/data.json",
                            id: "connector",
                            name: "Connector"
                        },
                        "organization-details": {}
                    },
                    sourceTag: "stag"
                },
                "ds-connector-dataset-id": {
                    id: "ds-connector-dataset-id",
                    name: "dataset-title",
                    aspects: {
                        "project-open-data-dataset": {
                            "@type": "dcat:Dataset",
                            identifier: "dataset-id",
                            description: "dataset-desc",
                            title: "dataset-title",
                            license: "dataset-license-url"
                        },
                        "dcat-dataset-strings": {
                            title: "dataset-title",
                            description: "dataset-desc",
                            temporal: {}
                        },
                        source: {
                            type: "project-open-data-dataset",
                            url: "http://localhost:8888/data.json",
                            id: "connector",
                            name: "Connector"
                        },
                        "dataset-distributions": {
                            distributions: [
                                "dist-connector-dataset-id-0",
                                "dist-connector-dataset-id-1"
                            ]
                        },
                        "dataset-publisher": { publisher: "org-connector-" }
                    },
                    sourceTag: "stag"
                }
            });

            done();
        });
    });
});
