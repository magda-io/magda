"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg = require("pg");
const nodeConfig = require("config");
//   conString: "postgres://postgres@192.168.99.100:30544/postgres"
const config = {
    user: "postgres",
    database: "auth",
    password: "",
    host: nodeConfig.get("db.host"),
    port: nodeConfig.get("db.port"),
    max: 10,
    idleTimeoutMillis: 30000
};
const pool = new pg.Pool(config);
pool.on("error", function(err, client) {
    // if an error is encountered by a client while it sits idle in the pool
    // the pool itself will emit an error event with both the error and
    // the client which emitted the original error
    // this is a rare occurrence but can happen if there is a network partition
    // between your application and the database, the database restarts, etc.
    // and so you might want to handle it and at least log it out
    console.error("idle client error", err.message, err.stack);
});
exports.default = pool;
//# sourceMappingURL=pool.js.map
