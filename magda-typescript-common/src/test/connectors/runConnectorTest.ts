const child = require("child_process");
const assert = require("assert");
import { MockRegistry } from "./MockRegistry";
import { MockExpressServer } from "./MockExpressServer";

/**
 * Hoping to re-use this functionality for all black-box style connector
 * testing.
 */
export function runConnectorTest(
    TEST_CASES: any[],
    Catalog: any,
    options: any = {}
) {
    describe("connector", function() {
        this.timeout(15000);

        const registryPort = 5000 + Math.round(5000 * Math.random());
        const catalogPort = registryPort + 1;

        function run() {
            return new Promise((resolve, reject) => {
                const command = [
                    "src",
                    "--id=connector",
                    "--name=Connector",
                    `--sourceUrl=http://localhost:${catalogPort}`,
                    `--registryUrl=http://localhost:${registryPort}`,
                    "--jwtSecret=nerdgasm",
                    "--userId=user"
                ];
                const proc = child.spawn("ts-node", command, {
                    stdio: "inherit"
                });
                proc.on("error", (err: any) => {
                    console.log("Failed to start subprocess.", err);
                    reject(err);
                });
                proc.on("close", (code: number) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`error exit code nonzero: ${code}`));
                    }
                });
            });
        }

        let servers: any[] = [];
        let registry: any;

        beforeEach(async function() {
            servers.push(
                (registry = await new MockRegistry().run(registryPort))
            );
        });

        afterEach(function() {
            servers.forEach(server => server.server.close());
        });

        TEST_CASES.forEach(function(testCase: any, index: number) {
            it(`should run ${index}`, async function() {
                const catalog: MockExpressServer = new Catalog(testCase.input);
                await catalog.run(catalogPort).then((catalog: any) => {
                    servers.push(catalog);
                    return run().then(() => {
                        Object.values(registry.records).forEach(record => {
                            record.sourceTag = "stag";
                            if (record.aspects && record.aspects.source) {
                                record.aspects.source.url = record.aspects.source.url.replace(
                                    `http://localhost:${catalogPort}`,
                                    "SOURCE"
                                );
                            }
                        });
                        if (options.cleanRegistry) {
                            options.cleanRegistry(registry);
                        }
                        assert.deepEqual(registry.records, testCase.output);
                    });
                });
            });
        });
    });
}
