import pg from "pg";
import createPgPool from "@magda/typescript-common/dist/createPgPool.js";

export interface PoolCreationOptions {
    dbHost: string;
    dbPort: number;
}

export default function createPool(options: PoolCreationOptions): pg.Pool {
    return createPgPool({ ...options, database: "auth" });
}
