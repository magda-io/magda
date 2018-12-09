import {
    installStatusRouter,
    OptionsIO,
    createServiceProbe
} from "../../express/status";

const request = require("supertest");
const express = require("express");
const assert = require("assert");

setup("status - default", undefined, (agent: any) => {
    it("should always be live", function(done) {
        agent
            .get("/status/live")
            .expect(200, "OK")
            .end(done);
    });

    it("should instantly be ready with no probes", function(done) {
        agent
            .get("/status/ready")
            .expect(200)
            .end(done);
    });
});

setup(
    "status - not ready to ready",
    {
        probes: {
            a: async () => {
                console.log("here");
                await sleep(500);
                console.log("after");
                return {
                    ready: true
                };
            }
        },
        probeUpdateMs: 1000
    },
    (agent: any) => {
        it("should be ready after a while", function(done) {
            agent
                .get("/status/ready")
                .expect(500)
                .end(async () => {
                    await sleep(1000);
                    agent
                        .get("/status/ready")
                        .expect(200)
                        .end(done);
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
        it("should be ready with probes", function(done) {
            sleep(100).then(function() {
                agent
                    .get("/status/ready")
                    .expect(200)
                    .end(done);
            });
        });

        it("should be ready with probes", function(done) {
            sleep(100).then(function() {
                agent
                    .get("/status/readySync")
                    .expect(200)
                    .end(done);
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
        it("should error", function(done) {
            sleep(100).then(function() {
                agent
                    .get("/status/ready")
                    .expect(500)
                    .end(done);
            });
        });
    }
);

setup(
    "status - error",
    {
        probes: {
            a: async () => {
                return null;
            }
        },
        probeUpdateMs: 60
    },
    (agent: any) => {
        it("should error", function(done) {
            sleep(100).then(function() {
                agent
                    .get("/status/ready")
                    .expect(500)
                    .end(done);
            });
        });
    }
);

describe("request", function() {
    let app: any;
    const port = Math.round(Math.random() * 8000 + 8000);
    let server: any;
    beforeEach(function(done) {
        app = express();
        server = app.listen(port, done);
    });
    afterEach(function() {
        server.close();
    });

    it("should succeed", async function() {
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

    it("should fail", async function() {
        app.use("/status/ready", function(req: any, res: any) {
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
    it("should fail", async function() {
        try {
            await createServiceProbe(`http://127.0.0.1:${port + 6}`)();
            throw "ERROR";
        } catch (return_) {
            assert.notDeepEqual(return_, "ERROR");
        }
    });
});

function sleep(time: number) {
    return new Promise(resolve => setTimeout(resolve, time));
}

function setup(text: string, options: OptionsIO, callback: any) {
    describe(text, function() {
        if (options) {
            options.forceRun = true;
        }
        const app = express();
        installStatusRouter(app, options);
        const agent = request.agent(app);
        callback(agent, options);
    });
}
