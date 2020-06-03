const pg = require("pg");
const getDBConfig = require("./getDBConfig");

const pool = new pg.Pool(getDBConfig());
pool.on("error", function(err, client) {
    console.error("DB Pool Error: ", err.message, err.stack);
});

function getDBPool() {
    return pool;
}

module.exports = getDBPool;
