import { runConnectorTest } from "@magda/typescript-common/dist/test/connectors/runConnectorTest";

import { MockOpenDataCatalog } from "./MockOpenDataCatalog";

import { MAGDA_ADMIN_PORTAL_ID } from "@magda/typescript-common/src/registry/TenantConsts";

const TEST_CASES = [
    {
        input: {
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
        },
        output: {
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
                        url: "SOURCE",
                        id: "connector",
                        name: "Connector"
                    }
                },
                sourceTag: "stag",
                tenantId: MAGDA_ADMIN_PORTAL_ID
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
                        url: "SOURCE",
                        id: "connector",
                        name: "Connector"
                    }
                },
                sourceTag: "stag",
                tenantId: MAGDA_ADMIN_PORTAL_ID
            },
            "org-connector-": {
                id: "org-connector-",
                aspects: {
                    source: {
                        type: "project-open-data-organization",
                        url: "SOURCE",
                        id: "connector",
                        name: "Connector"
                    },
                    "organization-details": {}
                },
                sourceTag: "stag",
                tenantId: MAGDA_ADMIN_PORTAL_ID
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
                        url: "SOURCE",
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
                sourceTag: "stag",
                tenantId: MAGDA_ADMIN_PORTAL_ID
            }
        }
    }
];

runConnectorTest(TEST_CASES, MockOpenDataCatalog);
