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

        function run(done: any) {
            const command = [
                "src",
                "--id=connector",
                "--name=Connector",
                `--sourceUrl=http://localhost:${catalogPort}`,
                `--registryUrl=http://localhost:${registryPort}`,
                "--jwtSecret=nerdgasm",
                "--userId=user"
            ];
            // console.log(command.join(" "));
            const proc = child.spawn("ts-node", command, {
                stdio: "inherit"
            });
            proc.on("error", (err: any) => {
                console.log("Failed to start subprocess.", err);
            });
            proc.on("close", done);
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
            it(`should run ${index}`, function(done) {
                const catalog: MockExpressServer = new Catalog(testCase.input);
                catalog.run(catalogPort).then((catalog: any) => {
                    servers.push(catalog);
                    run((code: number) => {
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

                        // console.log(JSON.stringify(registry.records, null, 2))

                        assert.deepEqual(registry.records, testCase.output);
                        if (code === 0) {
                            done();
                        } else {
                            done(`error exit code nonzero: ${code}`);
                        }
                    });
                });
            });
        });
    });
}
