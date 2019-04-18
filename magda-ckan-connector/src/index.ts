import Ckan from "./Ckan";
import JsonConnector from "@magda/typescript-common/dist/JsonConnector";
import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";
import { argv, transformer, transformerOptions } from "./setup";
import * as fs from "fs";
import { MAGDA_ADMIN_PORTAL_ID } from "@magda/typescript-common/dist/registry/TenantConsts";

let configData: any;
try {
    if (!argv) {
        throw new Error("failed to parse commandline parameter!");
    }

    if (!argv.config) {
        if (!argv.tenantId) {
            configData = {
                tenantId: MAGDA_ADMIN_PORTAL_ID
            };
        } else {
            configData = {
                tenantId: argv.tenantId as number
            };
        }
    } else {
        configData = JSON.parse(
            fs.readFileSync(argv.config as string, {
                encoding: "utf-8"
            })
        );
    }

    if (!configData) {
        throw new Error("invalid empty config data.");
    }

    if (!configData.tenantId) {
        throw new Error("invalid config data, missing compulsory `tenantId`.");
    }
} catch (e) {
    throw new Error(`Can't read connector config data: ${e}`);
}

console.debug(`----- argv.tenantId = ${argv.tenantId}`);

const ckan = new Ckan({
    baseUrl: argv.sourceUrl,
    id: argv.id,
    name: argv.name,
    pageSize: argv.pageSize,
    ignoreHarvestSources: argv.ignoreHarvestSources,
    allowedOrganisationNames: argv.allowedOrganisationNames,
    ignoreOrganisationNames: argv.ignoreOrganisationNames
});

const registry = new Registry({
    baseUrl: argv.registryUrl,
    jwtSecret: argv.jwtSecret,
    userId: argv.userId,
    tenantId: configData.tenantId
});

const connector = new JsonConnector({
    source: ckan,
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
