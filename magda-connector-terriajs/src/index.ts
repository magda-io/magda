const anyGlobal: any = global
anyGlobal.window = global;

import * as yargs from "yargs";
import addJwtSecretFromEnvVar from "@magda/typescript-common/dist/session/addJwtSecretFromEnvVar";
import * as Terria from "terriajs/lib/Models/Terria";
import { XMLHttpRequest } from "xmlhttprequest";
import * as xmldom from "xmldom";
import registerCatalogMembers from "./registerCatalogMembers";
import * as loadJson5 from "terriajs/lib/Core/loadJson5";
import connectCatalog from "./connectCatalog";
import AuthorizedRegistryClient from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";

const argv = addJwtSecretFromEnvVar(
    yargs
        .config()
        .help()
        .option("name", {
            describe: "The name of this connector, to be displayed to users to indicate the source of datasets.",
            type: "string",
            demandOption: true
        })
        .option("sourceUrl", {
            describe: "The URL of the TerriaJS catalog file.",
            type: "string",
            demandOption: true
        })
        .option("registryUrl", {
            describe: "The base URL of the registry to which to write data.",
            type: "string",
            default: "http://localhost:6101/v0"
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
        }).argv
);
console.log(argv);

anyGlobal.XMLHttpRequest = XMLHttpRequest;
anyGlobal.DOMParser = xmldom.DOMParser;

const registry = new AuthorizedRegistryClient({
    baseUrl: argv.registryUrl,
    jwtSecret: argv.jwtSecret,
    userId: argv.userId
});

registerCatalogMembers();

const terria = new Terria({
    baseUrl: 'file:///test'
});

const initPromise = loadJson5('http://static.nationalmap.nicta.com.au/init/2017-11-30.json');
initPromise.then(function(init: any) {
    return terria.addInitSource(init);
}).then(function() {
    return connectCatalog({
        terria: terria,
        registry: registry
    });
}).otherwise(function(e: any) {
    console.log(e);
});
