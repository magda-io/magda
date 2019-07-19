import EsriPortal from "./EsriPortal";
import JsonConnector from "@magda/typescript-common/dist/JsonConnector";
import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";
import { argv, transformer, transformerOptions } from "./setup";

const esriPortal = new EsriPortal({
    baseUrl: argv.sourceUrl,
    id: argv.id,
    name: argv.name,
    pageSize: argv.pageSize
});

if (argv.arcgisUserId !== null) {
    esriPortal
        .getToken(argv.arcgisUserId, argv.arcgisUserPassword)
        .then(function() {
            runConnector();
        });
} else {
    runConnector();
}

function runConnector() {
    const registry = new Registry({
        baseUrl: argv.registryUrl,
        jwtSecret: argv.jwtSecret,
        userId: argv.userId
    });

    const connector = new JsonConnector({
        source: esriPortal,
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
}
