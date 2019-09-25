import addJwtSecretFromEnvVar from "@magda/typescript-common/dist/session/addJwtSecretFromEnvVar";
import AspectBuilder from "@magda/typescript-common/dist/AspectBuilder";
import createTransformer from "./createTransformer";
import * as fs from "fs";
import * as yargs from "yargs";

export const argv: any = addJwtSecretFromEnvVar(
    yargs
        .config()
        .help()
        .option("id", {
            describe:
                "The ID of this connector. Datasets created by this connector will have an ID prefixed with this ID.",
            type: "string",
            demandOption: true
        })
        .option("name", {
            describe:
                "The name of this connector, to be displayed to users to indicate the source of datasets.",
            type: "string",
            demandOption: true
        })
        .option("sourceUrl", {
            describe:
                "The base URL of the Esri Portal server, without /sharing/rest/...",
            type: "string",
            demandOption: true
        })
        .option("pageSize", {
            describe:
                "The number of datasets per page to request from the Esri Portal server.",
            type: "number",
            default: 1000
        })
        .option("registryUrl", {
            describe:
                "The base URL of the registry to which to write data from Esri Portal.",
            type: "string",
            default: "http://localhost:6101/v0"
        })
        .option("interactive", {
            describe:
                "Run the connector in an interactive mode with a REST API, instead of running a batch connection job.",
            type: "boolean",
            default: false
        })
        .option("listenPort", {
            describe:
                "The port on which to run the REST API when in interactive model.",
            type: "number",
            default: 6113
        })
        .option("timeout", {
            describe:
                "When in --interactive mode, the time in seconds to wait without servicing an REST API request before shutting down. If 0, there is no timeout and the process will never shut down.",
            type: "number",
            default: 0
        })
        .option("jwtSecret", {
            describe: "The shared secret for intra-network communication",
            type: "string"
        })
        .option("arcgisUserId", {
            describe:
                "The arcgis portal user id to use when making authenticated requests to the portal",
            type: "string",
            demand: false,
            default:
                process.env.ARCGIS_USER_ID ||
                process.env.npm_package_config_arcgisUserId
        })
        .option("arcgisUserPassword", {
            describe:
                "The password of a, arcgis portal user to use when making authenticated requests to the portal",
            type: "string",
            demand: false,
            default:
                process.env.ARCGIS_USER_PASSWORD ||
                process.env.npm_package_config_arcgisUserPassword
        })
        .option("userId", {
            describe:
                "The user id to use when making authenticated requests to the registry",
            type: "string",
            demand: true,
            default:
                process.env.USER_ID || process.env.npm_package_config_userId
        })
        .option("tenantId", {
            describe: "The tenant id",
            type: "number",
            demand: true,
            default: 0
        })
        .option("esriUpdateInterval", {
            describe: "Re-crawl esri portal interval in hours",
            type: "number",
            demand: true,
            default: 12
        }).argv
);

const datasetAspectBuilders: AspectBuilder[] = [
    {
        aspectDefinition: {
            id: "esri-dataset",
            name: "Esri Portal Dataset",
            jsonSchema: require("@magda/registry-aspects/esri-dataset.schema.json")
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/esri-dataset.js",
            "utf8"
        )
    },
    {
        aspectDefinition: {
            id: "dcat-dataset-strings",
            name: "DCAT Dataset properties as strings",
            jsonSchema: require("@magda/registry-aspects/dcat-dataset-strings.schema.json")
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/dcat-dataset-strings.js",
            "utf8"
        )
    },
    {
        aspectDefinition: {
            id: "source",
            name: "Source",
            jsonSchema: require("@magda/registry-aspects/source.schema.json")
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/dataset-source.js",
            "utf8"
        )
    },
    {
        aspectDefinition: {
            id: "temporal-coverage",
            name: "Temporal Coverage",
            jsonSchema: require("@magda/registry-aspects/temporal-coverage.schema.json")
        },
        setupFunctionString: fs.readFileSync(
            "aspect-templates/temporal-coverage-setup.js",
            "utf8"
        ),
        builderFunctionString: fs.readFileSync(
            "aspect-templates/temporal-coverage.js",
            "utf8"
        )
    },
    {
        aspectDefinition: {
            id: "esri-access-control",
            name: "Esri data access control",
            jsonSchema: require("@magda/registry-aspects/esri-access-control.schema.json")
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/dataset-access-attributes.js",
            "utf8"
        )
    }
];

const distributionAspectBuilders: AspectBuilder[] = [
    {
        aspectDefinition: {
            id: "esri-resource",
            name: "Esri Portal Resource",
            jsonSchema: require("@magda/registry-aspects/esri-resource.schema.json")
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/esri-resource.js",
            "utf8"
        )
    },
    {
        aspectDefinition: {
            id: "dcat-distribution-strings",
            name: "DCAT Distribution properties as strings",
            jsonSchema: require("@magda/registry-aspects/dcat-distribution-strings.schema.json")
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/dcat-distribution-strings.js",
            "utf8"
        )
    },
    {
        aspectDefinition: {
            id: "source",
            name: "Source",
            jsonSchema: require("@magda/registry-aspects/source.schema.json")
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/distribution-source.js",
            "utf8"
        )
    },
    {
        aspectDefinition: {
            id: "esri-access-control",
            name: "Esri data access control",
            jsonSchema: require("@magda/registry-aspects/esri-access-control.schema.json")
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/dataset-access-attributes.js",
            "utf8"
        )
    }
];

const organizationAspectBuilders: AspectBuilder[] = [
    {
        aspectDefinition: {
            id: "source",
            name: "Source",
            jsonSchema: require("@magda/registry-aspects/source.schema.json")
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/organization-source.js",
            "utf8"
        )
    },
    {
        aspectDefinition: {
            id: "organization-details",
            name: "Organization",
            jsonSchema: require("@magda/registry-aspects/organization-details.schema.json")
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/organization-details.js",
            "utf8"
        )
    }
];

export const transformerOptions = {
    id: argv.id,
    name: argv.name,
    sourceUrl: argv.sourceUrl,
    pageSize: argv.pageSize,
    registryUrl: argv.registryUrl,
    datasetAspectBuilders,
    distributionAspectBuilders,
    organizationAspectBuilders
};

export const transformer: any = createTransformer(transformerOptions);
