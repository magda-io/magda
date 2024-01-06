import {
    installStatusRouter,
    ConfigOption,
    createServiceProbe
} from "../../express/status.js";

import request from "supertest";
import express from "express";
import assert from "assert";
import delay from "../../delay.js";

describe("overall probe process", function (this) {
    this.timeout(30000);
    it("should be ready after required service online", async function () {
        const app = express();
        installStatusRouter(app, {
            key: Math.random().toString(),
            forceRun: true,
            probes: {
                a: async () => {
                    await delay(1000);
                    return {
                        ready: true
                    };
                }
            },
            probeUpdateMs: 200
        });
        const agent = request.agent(app);
        await agent.get("/status/ready").expect(500);
        await delay(2000);
        await agent.get("/status/ready").expect(200);
    });
});

setup("status - default", undefined, (agent: any) => {
    it("should always be live", function (done) {
        agent.get("/status/live").expect(200, "OK").end(done);
    });

    it("should instantly be ready with no probes", function (done) {
        agent.get("/status/ready").expect(200).end(done);
    });
});

setup(
    "status - not ready to ready",
    {
        probes: {
            a: async () => {
                console.log("here");
                await delay(500);
                console.log("after");
                return {
                    ready: true
                };
            }
        },
        probeUpdateMs: 200
    },
    (agent: any) => {
        it("should be ready after a while", function (done) {
            agent
                .get("/status/ready")
                .expect(500)
                .end(async () => {
                    await delay(1000);
                    agent.get("/status/ready").expect(200).end(done);
                });
        });
    }
);

setup(
    "status - not ready",
    {
        probes: {
            a: async () => {
                return {
                    ready: true
                };
            }
        },
        probeUpdateMs: 10
    },
    (agent: any) => {
        it("should be ready with probes", function (done) {
            delay(100).then(function () {
                agent.get("/status/ready").expect(200).end(done);
            });
        });

        it("should be ready with probes", function (done) {
            delay(100).then(function () {
                agent.get("/status/readySync").expect(200).end(done);
            });
        });
    }
);

setup(
    "status - error",
    {
        probes: {
            a: async () => {
                throw "ERROR";
            }
        },
        probeUpdateMs: 10
    },
    (agent: any) => {
        it("should error", function (done) {
            delay(100).then(function () {
                agent.get("/status/ready").expect(500).end(done);
            });
        });
    }
);

setup(
    "status - no error consider as ready",
    {
        probes: {
            a: async () => {
                // as long as no error, consider as ready
                // event if not return a status data object. e.g. {ready: true}
                return null;
            }
        },
        probeUpdateMs: 60
    },
    (agent: any) => {
        it("should be ready", function (done) {
            delay(100).then(function () {
                agent.get("/status/ready").expect(200).end(done);
            });
        });
    }
);

describe("request", function () {
    let app: any;
    const port = Math.round(Math.random() * 8000 + 8000);
    let server: any;
    beforeEach(function (done) {
        app = express();
        server = app.listen(port, done);
    });
    afterEach(function () {
        server.close();
    });

    it("should succeed", async function () {
        installStatusRouter(app, {});
        let return_;
        return_ = await createServiceProbe(`http://127.0.0.1:${port}`)();
        assert.deepEqual(return_.ready, true);
        return_ = await createServiceProbe(
            `http://127.0.0.1:${port}`,
            "/status/ready"
        )();
        assert.deepEqual(return_.ready, true);
    });

    it("should fail", async function () {
        app.use("/status/ready", function (req: any, res: any) {
            res.status(500).json({ ready: false });
        });
        try {
            await createServiceProbe(`http://127.0.0.1:${port}`)();
            throw "ERROR";
        } catch (return_) {
            assert.deepEqual(return_, {
                ready: false,
                statusCode: 500
            });
        }
    });
    it("should fail", async function () {
        try {
            await createServiceProbe(`http://127.0.0.1:${port + 6}`)();
            throw "ERROR";
        } catch (return_) {
            assert.notDeepEqual(return_, "ERROR");
        }
    });
});

function setup(text: string, options: ConfigOption, callback: any) {
    describe(text, function (this) {
        this.timeout(30000);
        if (options) {
            options.forceRun = true;
            // --- manually set key to avoid status probe overwritten by other tests
            options.key = Math.random().toString();
        }
        const app = express();
        installStatusRouter(app, options);
        const agent = request.agent(app);
        callback(agent, options);
    });
}
