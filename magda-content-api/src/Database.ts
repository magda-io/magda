import createPool from "./createPool";
import { Maybe } from "tsmonad";
import arrayToMaybe from "@magda/typescript-common/dist/util/arrayToMaybe";
import * as pg from "pg";
import * as _ from "lodash";
import { Content } from "./model";

export interface DatabaseOptions {
    dbHost: string;
    dbPort: number;
    dbName: string;
}

export interface Database {
    getContentById(id: string): Promise<Maybe<Content>>;
    getContentSummary(
        queries: Query[],
        inlineContentIfType: string[]
    ): Promise<any>;
    setContentById(
        id: string,
        type: string,
        content: string
    ): Promise<Maybe<Content>>;
    deleteContentById(id: string): Promise<any[]>;
}

export type Query = {
    field: "id" | "type";
    pattern: string;
};

export default class PostgresDatabase implements Database {
    private pool: pg.Pool;

    constructor(options: DatabaseOptions) {
        this.pool = createPool(options);
    }

    getContentById(id: string): Promise<Maybe<Content>> {
        return this.pool
            .query('SELECT * FROM content WHERE "id" = $1', [id])
            .then(res => arrayToMaybe(res.rows));
    }

    getContentSummary(
        queries: Query[],
        inlineContentIfType: string[]
    ): Promise<any> {
        let params: { [paramIndex: string]: string } = {};
        let inline = "";
        if (inlineContentIfType.length > 0) {
            const inlineStatements = inlineContentIfType.map((type, i) => {
                const paramIndex = `inline${i + 1}`;
                params[paramIndex] = type.replace(/\'/g, "");
                `WHEN type = $${i + 1} THEN content`;
            });

            inline = `,
            CASE
              ${inlineStatements.join(" ")}
              ELSE NULL
            END
            AS content`;
        }

        const whereClauses = queries
            .map((query, i) => {
                const baseParamIndexNumber = i * 2;
                const paramA = `where${baseParamIndexNumber + 1}`;
                const paramB = `where${baseParamIndexNumber + 2}`;

                params[paramA] = query.field;
                params[paramB] = query.pattern;

                return `$${paramA} LIKE $${paramB}`;
            })
            .join(" OR ");

        const whereValues = _.flatMap(queries, query => [
            query.field,
            PostgresDatabase.createWildcardMatch(query.pattern)
        ]);

        return this.pool
            .query(
                `SELECT id, type, length(content) as length ${inline} FROM content ${
                    whereClauses.length > 0 ? "WHERE " + whereClauses : ""
                }`,
                whereValues
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

    private static createWildcardMatch(pattern: string): string {
        return pattern.replace(/[^\w\/\-* ]/gi, "").replace(/\*/g, "%");
    }
}
