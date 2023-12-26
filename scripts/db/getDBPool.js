import pg from "pg";
import getDBConfig from "./getDBConfig.js";

const pool = new pg.Pool(getDBConfig());
pool.on("error", function (err, client) {
    console.error("DB Pool Error: ", err.message, err.stack);
});

function getDBPool() {
    return pool;
}

export default getDBPool;
