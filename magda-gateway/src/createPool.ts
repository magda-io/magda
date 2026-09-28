import pg from "pg";
import createPgPool from "@magda/typescript-common/dist/createPgPool.js";

export interface PoolCreationOptions {
    dbHost: string;
    dbPort: number;
    database?: string;
}

function createPool(options: PoolCreationOptions): pg.Pool {
    return createPgPool({
        dbHost: options.dbHost,
        dbPort: options.dbPort,
        database: options.database ? options.database : "session"
    });
}

export default createPool;
