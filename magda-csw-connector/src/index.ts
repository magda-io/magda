import Csw from "./Csw";
import CswConnector from "./CswConnector";
import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";
import * as moment from "moment";
import * as URI from "urijs";
import * as lodash from "lodash";
import * as jsonpath from "jsonpath";
import datasetAspectBuilders from "./datasetAspectBuilders";
import distributionAspectBuilders from "./distributionAspectBuilders";
import organizationAspectBuilders from "./organizationAspectBuilders";
import * as yargs from "yargs";

const argv = yargs
    .config()
    .help()
    .option("name", {
        describe:
            "The name of this connector, to be displayed to users to indicate the source of datasets.",
        type: "string",
        demandOption: true
    })
    .option("sourceUrl", {
        describe:
            "The base URL of the CSW server, including /csw if present, but not including any query parameters.",
        type: "string",
        demandOption: true
    })
    .option("pageSize", {
        describe:
            "The number of datasets per page to request from the CSW server.",
        type: "number",
        default: 1000
    })
    .option("registryUrl", {
        describe:
            "The base URL of the registry to which to write data from CSW.",
        type: "string",
        default: "http://localhost:6101/v0"
    })
    .option("jwtSecret", {
        describe: "The shared secret for intra-network communication",
        type: "string",
        demand: true,
        default:
            process.env.JWT_SECRET || process.env.npm_package_config_jwtSecret
    })
    .option("userId", {
        describe:
            "The user id to use when making authenticated requests to the registry",
        type: "string",
        demand: true,
        default: process.env.USER_ID || process.env.npm_package_config_userId
    })
    .showHelpOnFail(false).argv;

const csw = new Csw({
    baseUrl: argv.sourceUrl,
    name: argv.name,
    pageSize: argv.pageSize
});

const registry = new Registry({
    baseUrl: argv.registryUrl,
    jwtSecret: argv.jwtSecret,
    userId: argv.userId
});

const connector = new CswConnector({
    source: csw,
    registry: registry,
    datasetAspectBuilders: datasetAspectBuilders,
    distributionAspectBuilders: distributionAspectBuilders,
    organizationAspectBuilders: organizationAspectBuilders,
    libraries: {
        moment: moment,
        URI: URI,
        lodash: lodash,
        jsonpath: jsonpath
    }
});

connector.run().then(result => {
    console.log(result.summarize());
});
