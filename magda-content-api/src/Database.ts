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

    getContentSummary(query: any, inlineContentIfType: string[]): Promise<any> {
        let inline = "";
        if (inlineContentIfType.length > 0) {
            inline = `,
            CASE
              ${inlineContentIfType
                  .map(
                      type =>
                          "WHEN type = '" +
                          type.replace(/\'/g, "") +
                          "' THEN content"
                  )
                  .join(" ")}
              ELSE NULL
            END
            AS content`;
        }
        return this.pool
            .query(
                `SELECT id, type, length(content) as length ${inline} FROM content ${
                    query ? "WHERE" + query : ""
                }`
            )
            .then(res => (res && res.rows) || []);
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

    deleteContentById(id: string) {
        return this.pool
            .query("DELETE FROM content WHERE id=$1", [id])
            .then(res => (res && res.rows) || []);
    }

    createWildcardMatch(field: string, pattern: string) {
        const result = `${field} LIKE '${pattern
            .replace(/[^\w\/\-* ]/gi, "")
            .replace(/\*/g, "%")}'`;
        console.log(result);
        return result;
    }

    createOr(...queries: string[]) {
        return queries.map(x => `(${x})`).join(" OR ");
    }
}
