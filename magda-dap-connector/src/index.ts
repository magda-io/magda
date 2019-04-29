import addJwtSecretFromEnvVar from "@magda/typescript-common/dist/session/addJwtSecretFromEnvVar";
import AspectBuilder from "@magda/typescript-common/dist/AspectBuilder";
import Dap from "./Dap";
import createTransformer from "./createTransformer";
import JsonConnector from "@magda/typescript-common/dist/JsonConnector";
import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";
import * as fs from "fs";
import * as yargs from "yargs";
import { MAGDA_ADMIN_PORTAL_ID } from "@magda/typescript-common/dist/registry/TenantConsts";
//npm run dev -- --config ../deploy/connector-config/csiro-dap.json --userId="00000000-0000-4000-8000-000000000000" --jwtSecret="squirrel"
//npm run dev -- --config ../deploy/connector-config/csiro-dap.json --userId="00000000-0000-4000-8000-000000000000" --jwtSecret="squirrel" --registryUrl="http://192.168.137.107:30860/v0"
const argv = addJwtSecretFromEnvVar(
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
            describe: "The base URL of the CSIRO DAP server, without /api/...",
            type: "string",
            demandOption: true
        })
        .option("pageSize", {
            describe:
                "The number of datasets per page to request from the CSIRO Dap server.",
            type: "number",
            default: 1000
        })
        .option("distributionSize", {
            describe: "The number of distributions harvested.",
            type: "number",
            default: 24
        })
        .option("ignoreHarvestSources", {
            describe:
                "An array of harvest sources to ignore.  Datasets from these harvest soures will not be added to the registry.",
            type: "array",
            default: []
        })
        .option("registryUrl", {
            describe:
                "The base URL of the registry to which to write data from CKAN.",
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
        .option("userId", {
            describe:
                "The user id to use when making authenticated requests to the registry",
            type: "string",
            demand: true,
            default:
                process.env.USER_ID || process.env.npm_package_config_userId
        })
        .option("tenantId", {
            describe:
                "The magda tenant id to use when making requests to the registry",
            type: "number",
            demand: true,
            default:
                process.env.TENANT_ID ||
                process.env.npm_package_config_tenantId ||
                MAGDA_ADMIN_PORTAL_ID
        }).argv
);

const datasetAspectBuilders: AspectBuilder[] = [
    {
        aspectDefinition: {
            id: "dap-dataset",
            name: "DAP Dataset",
            jsonSchema: require("@magda/registry-aspects/dap-dataset.schema.json"),
            tenantId: "tenant id in number string"
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/dap-dataset.js",
            "utf8"
        )
    },
    {
        aspectDefinition: {
            id: "dcat-dataset-strings",
            name: "DCAT Dataset properties as strings",
            jsonSchema: require("@magda/registry-aspects/dcat-dataset-strings.schema.json"),
            tenantId: "tenant id in number string"
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
            jsonSchema: require("@magda/registry-aspects/source.schema.json"),
            tenantId: "tenant id in number string"
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
            jsonSchema: require("@magda/registry-aspects/temporal-coverage.schema.json"),
            tenantId: "tenant id in number string"
        },
        setupFunctionString: fs.readFileSync(
            "aspect-templates/temporal-coverage-setup.js",
            "utf8"
        ),
        builderFunctionString: fs.readFileSync(
            "aspect-templates/temporal-coverage.js",
            "utf8"
        )
    }
];

const distributionAspectBuilders: AspectBuilder[] = [
    // {
    //     aspectDefinition: {
    //         id: "ckan-resource",
    //         name: "CKAN Resource",
    //         jsonSchema: require("@magda/registry-aspects/ckan-resource.schema.json")
    //     },
    //     builderFunctionString: fs.readFileSync(
    //         "aspect-templates/dap-resource.js",
    //         "utf8"
    //     )
    // },
    {
        aspectDefinition: {
            id: "dap-resource",
            name: "DAP Resource",
            jsonSchema: require("@magda/registry-aspects/dap-resource.schema.json"),
            tenantId: "tenant id in number string"
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/dap-resource.js",
            "utf8"
        )
    },
    {
        aspectDefinition: {
            id: "dcat-distribution-strings",
            name: "DCAT Distribution properties as strings",
            jsonSchema: require("@magda/registry-aspects/dcat-distribution-strings.schema.json"),
            tenantId: "tenant id in number string"
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
            jsonSchema: require("@magda/registry-aspects/source.schema.json"),
            tenantId: "tenant id in number string"
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/distribution-source.js",
            "utf8"
        )
    }
];

const organizationAspectBuilders: AspectBuilder[] = [
    {
        aspectDefinition: {
            id: "source",
            name: "Source",
            jsonSchema: require("@magda/registry-aspects/source.schema.json"),
            tenantId: "tenant id in number string"
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
            jsonSchema: require("@magda/registry-aspects/organization-details.schema.json"),
            tenantId: "tenant id in number string"
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/organization-details.js",
            "utf8"
        )
    }
];

const dap = new Dap({
    baseUrl: argv.sourceUrl,
    id: argv.id,
    name: argv.name,
    pageSize: argv.pageSize,
    distributionSize: argv.distributionSize,
    ignoreHarvestSources: argv.ignoreHarvestSources
});

const registry = new Registry({
    baseUrl: argv.registryUrl,
    jwtSecret: argv.jwtSecret,
    userId: argv.userId,
    tenantId: Number(argv.tenantId)
});

const transformerOptions = {
    id: argv.id,
    name: argv.name,
    sourceUrl: argv.sourceUrl,
    pageSize: argv.pageSize,
    ignoreHarvestSources: argv.ignoreHarvestSources,
    registryUrl: argv.registryUrl,
    datasetAspectBuilders,
    distributionAspectBuilders,
    organizationAspectBuilders,
    tenantId: Number(argv.tenantId)
};

const transformer = createTransformer(transformerOptions);

const connector = new JsonConnector({
    source: dap,
    transformer: transformer,
    registry: registry
});

if (!argv.interactive) {
    connector.run().then(result => {
        console.log(result.summarize());
    });
} else {
    connector.runInteractive({
        timeoutSeconds: argv.timeout,
        listenPort: argv.listenPort,
        transformerOptions: transformerOptions
    });
}
