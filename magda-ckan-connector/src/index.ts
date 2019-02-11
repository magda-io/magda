import Ckan from "./Ckan";
import JsonConnector from "@magda/typescript-common/dist/JsonConnector";
import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";
import { argv, transformer, transformerOptions } from "./setup";

const ckan = new Ckan({
    baseUrl: argv.sourceUrl,
    id: argv.id,
    name: argv.name,
    pageSize: argv.pageSize,
    ignoreHarvestSources: argv.ignoreHarvestSources,
    allowedOrganisationName: argv.allowedOrganisationName
});

const registry = new Registry({
    baseUrl: argv.registryUrl,
    jwtSecret: argv.jwtSecret,
    userId: argv.userId
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
