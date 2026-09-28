import pg from "pg";
import createPgPool from "@magda/typescript-common/dist/createPgPool.js";

export interface PoolCreationOptions {
    dbHost: string;
    dbPort: number;
    dbName: string;
}

export default function createPool(options: PoolCreationOptions): pg.Pool {
    const { dbName, ...rest } = options;
    return createPgPool({ ...rest, database: dbName });
}
