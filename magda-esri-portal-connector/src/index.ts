import EsriPortal from "./EsriPortal";
import JsonConnector from "@magda/typescript-common/dist/JsonConnector";
import { JsonConnectorOptions } from "@magda/typescript-common/dist/JsonConnector";
import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";
import ConnectionResult from "@magda/typescript-common/dist/ConnectionResult";

import { argv, transformer, transformerOptions } from "./setup";

const esriPortal = new EsriPortal({
    baseUrl: argv.sourceUrl,
    esriOrgGroup: argv.esriOrgGroup,
    id: argv.id,
    name: argv.name,
    pageSize: argv.pageSize,
    updateInterval: argv.esriUpdateInterval
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
        userId: argv.userId,
        tenantId: argv.tenantId
    });

    class EsriConnector extends JsonConnector {
        constructor(options: JsonConnectorOptions) {
            super(options);
        }

        // @ts-ignore
        async createGroup(groupJson: object): Promise<Record | Error> {
            return super.putRecord(
                transformer.groupJsonToRecord(groupJson),
                "Group"
            );
        }

        async createGroups(connectedDatasets: []) {
            const groups = await esriPortal.getPortalGroups();

            for (var i = 0; i < groups.length; i++) {
                const group = groups[i];
                group.members = connectedDatasets.filter((d: any) => {
                    if (d.esriGroups === undefined) return false;
                    return d.esriGroups.indexOf(group.id) > -1;
                });

                group.members = group.members.map(
                    (ds: any) => `ds-${esriPortal.name}-${ds.id}`
                );
                await this.createGroup(group);
            }
        }

        async run(): Promise<ConnectionResult> {
            const result = await super.run();
            console.log(result.summarize());
            // @ts-ignore
            await this.createGroups(this.source.harvestedDatasets);
            return result;
        }
    }

    const connector = new EsriConnector({
        source: esriPortal,
        transformer: transformer,
        registry: registry
    });

    if (!argv.interactive) {
        connector.run();
    } else {
        connector.runInteractive({
            timeoutSeconds: argv.timeout,
            listenPort: argv.listenPort,
            transformerOptions: transformerOptions
        });
    }
}
