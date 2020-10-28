import pg, { PoolConfig } from "pg";

export interface PoolCreationOptions {
    dbHost: string;
    dbPort: number;
    dbUser?: string; // if not specified, env var will be used
    dbPassword?: string; // if not specified, env var will be used
    database?: string;
}

function createPool(options: PoolCreationOptions) {
    const { dbUser, dbPassword } = options;
    const dbConfig = {
        database: options?.database ? options.database : "session", //env var: PGDATABASE
        host: options.dbHost, // Server hosting the postgres database
        port: options.dbPort, //env var: PGPORT
        max: 10, // max number of clients in the pool
        idleTimeoutMillis: 30000 // how long a client is allowed to remain idle before being closed
    } as PoolConfig;

    if (dbUser) {
        dbConfig.user = dbUser;
    }

    if (dbPassword) {
        dbConfig.password = dbPassword;
    }

    const pool = new pg.Pool(dbConfig);

    pool.on("error", function (err, client) {
        // if an error is encountered by a client while it sits idle in the pool
        // the pool itself will emit an error event with both the error and
        // the client which emitted the original error
        // this is a rare occurrence but can happen if there is a network partition
        // between your application and the database, the database restarts, etc.
        // and so you might want to handle it and at least log it out
        console.error("idle client error", err.message, err.stack);
    });

    return pool;
}

export default createPool;
