import EsriPortal from "./EsriPortal";
import JsonConnector from "@magda/typescript-common/dist/JsonConnector";
import { JsonConnectorOptions } from "@magda/typescript-common/dist/JsonConnector";
import ApiClient from "@magda/typescript-common/dist/authorization-api/ApiClient";
import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";
import ConnectionResult from "@magda/typescript-common/dist/ConnectionResult";

import { argv, transformer, transformerOptions } from "./setup";
import AsyncPage, {
    forEachAsync
} from "@magda/typescript-common/dist/AsyncPage";
import RecordCreationFailure from "@magda/typescript-common/dist/RecordCreationFailure";

const esriPortal = new EsriPortal({
    baseUrl: argv.sourceUrl,
    esriOrgGroup: argv.esriOrgGroup,
    id: argv.id,
    name: argv.name,
    pageSize: argv.pageSize
});

transformer.expiration = Date.now() + argv.esriUpdateInterval * 60 * 60 * 1000;

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
        userId: argv.userId,
        tenantId: argv.tenantId
    });

    class EsriConnector extends JsonConnector {
        constructor(options: JsonConnectorOptions) {
            super(options);
        }

        async createGroups(): Promise<ConnectionResult> {
            const result: any = new ConnectionResult();

            const groups = AsyncPage.single(esriPortal.getPortalGroups());
            await forEachAsync(groups, this.maxConcurrency, async groupJson => {
                const recordOrError = await this.putRecord(
                    transformer.groupJsonToRecord(groupJson),
                    "Group"
                );
                if (recordOrError instanceof Error) {
                    result.groupFailures.push(
                        new RecordCreationFailure(
                            transformer.getIdFromJsonGroup(
                                groupJson,
                                this.source.id
                            ),
                            undefined,
                            recordOrError
                        )
                    );
                } else {
                    ++result.groupsConnected;
                }
            });

            return result;
        }

        async createDatasetsAndDistributions(): Promise<ConnectionResult> {
            const result = await super.createDatasetsAndDistributions();
            const groupResult = await this.createGroups();
            return ConnectionResult.combine(result, groupResult);
        }
    }

    const connector = new EsriConnector({
        source: esriPortal,
        transformer: transformer,
        registry: registry
    });

    const authApi = new ApiClient(
        argv.authorizationApi,
        argv.jwtSecret,
        argv.userId
    );

    function saveLastCrawlExpiration() {
        const time_in_hours =
            argv.esriUpdateInterval + argv.esriExpirationOverlap;
        const expiration = Date.now() + time_in_hours * 60 * 60 * 1000;
        const extraInput = {
            id: argv.id,
            data: {
                "last crawl expiration": expiration
            }
        };

        console.log(
            `The last crawl expiration should be in ${time_in_hours} hours from ${new Date().toUTCString()}.`
        );
        console.log(JSON.stringify(extraInput));
        authApi
            .updateOpaExtraInput(extraInput)
            .then(_ => {
                console.log(
                    "Successfully updated the last crawl expiration as extra input to OPA."
                );
            })
            .catch(error => {
                console.error(error.message);
            });
    }

    if (!argv.interactive) {
        connector.run().then(_ => saveLastCrawlExpiration());
    } else {
        connector.runInteractive({
            timeoutSeconds: argv.timeout,
            listenPort: argv.listenPort,
            transformerOptions: transformerOptions
        });
    }
}
