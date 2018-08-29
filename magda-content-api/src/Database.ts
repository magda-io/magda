import createPool from "./createPool";
import { Maybe } from "tsmonad";
import arrayToMaybe from "@magda/typescript-common/dist/util/arrayToMaybe";
import * as pg from "pg";
import { Content } from "./model";

export interface DatabaseOptions {
    dbHost: string;
    dbPort: number;
    dbName: string;
}

export default class Database {
    private pool: pg.Pool;

    constructor(options: DatabaseOptions) {
        this.pool = createPool(options);
    }

    getContentById(id: string): Promise<Maybe<Content>> {
        return this.pool
            .query('SELECT * FROM content WHERE "id" = $1', [id])
            .then(res => arrayToMaybe(res.rows));
    }

    setContentById(
        id: string,
        type: string,
        content: string
    ): Promise<Maybe<Content>> {
        return this.pool
            .query(
                `INSERT INTO content (id, "type", "content")
                 VALUES ($1, $2, $3)
                 ON CONFLICT (id) DO
                 UPDATE SET "type" = $2, "content"=$3`,
                [id, type, content]
            )
            .then(res => arrayToMaybe(res.rows));
    }
}
