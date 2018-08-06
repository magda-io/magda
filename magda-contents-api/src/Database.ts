import createPool from "./createPool";
import { Maybe } from "tsmonad";
import arrayToMaybe from "@magda/typescript-common/dist/util/arrayToMaybe";
import * as pg from "pg";
import { Content } from "./model";

export interface DatabaseOptions {
    dbHost: string;
    dbPort: number;
}

export default class Database {
    private pool: pg.Pool;

    constructor(options: DatabaseOptions) {
        this.pool = createPool(options);
    }

    getContentById(id: string): Promise<Maybe<Content>> {
        return this.pool
            .query('SELECT id, content FROM contents WHERE "id" = $1', [id])
            .then(res => arrayToMaybe(res.rows));
    }
}
