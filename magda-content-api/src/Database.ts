import { Maybe } from "@magda/tsmonad";
import pg from "pg";
import _ from "lodash";

import arrayToMaybe from "magda-typescript-common/src/util/arrayToMaybe";
import { sqls, SQLSyntax } from "sql-syntax";

import { Content } from "./model";
import createPool from "./createPool";
import AuthDecision from "magda-typescript-common/src/opa/AuthDecision";
import { UnconditionalTrueDecision } from "magda-typescript-common/src/opa/AuthDecision";
import { escapeIdentifier } from "magda-typescript-common/src/SQLUtils";

const ALLOWABLE_QUERY_FIELDS = ["id", "type"];
const allowableQueryFieldLookup = _.keyBy(ALLOWABLE_QUERY_FIELDS, _.identity);

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
    patterns: string[];
};

export default class PostgresDatabase implements Database {
    private pool: pg.Pool;

    constructor(options: DatabaseOptions) {
        this.pool = createPool(options);
    }

    async getContentById(
        id: string,
        authDecision: AuthDecision = UnconditionalTrueDecision
    ): Promise<Maybe<Content>> {
        const authConditions = authDecision.toSql({
            prefixes: ["input.object.content"]
        });

        return this.pool
            .query(
                ...sqls`SELECT * FROM content`
                    .where(
                        SQLSyntax.joinWithAnd([
                            sqls`"id" = ${id}`,
                            authConditions
                        ])
                    )
                    .toQuery()
            )
            .then((res) => arrayToMaybe(res.rows));
    }

    async check(): Promise<any> {
        await this.pool.query("SELECT id FROM content LIMIT 1");
        return {
            ready: true
        };
    }

    async getContentSummary(
        queries: Query[],
        inlineContentIfType: string[],
        authDecision: AuthDecision = UnconditionalTrueDecision
    ): Promise<any> {
        for (const query of queries) {
            if (!allowableQueryFieldLookup[query.field]) {
                throw new Error(
                    "Attempted to filter by unknown query field " + query.field
                );
            }
        }

        const authConditions = authDecision.toSql({
            prefixes: ["input.object.content"]
        });

        let inline = SQLSyntax.empty;
        if (inlineContentIfType.length > 0) {
            const inlineTypes = inlineContentIfType.map(
                (type) => sqls`type = ${type}`
            );

            inline = sqls`,
            CASE
              WHEN ${SQLSyntax.joinWithOr(
                  inlineTypes
              ).roundBracket()} THEN content
              ELSE NULL
            END
            AS content`;
        }

        const queryPatternsByField: { [key: string]: string[] } = {};
        queries.map((q) => {
            if (!queryPatternsByField[q.field]) {
                queryPatternsByField[q.field] = [];
            }
            queryPatternsByField[q.field] = queryPatternsByField[
                q.field
            ].concat(q.patterns);
        });

        const queryConditions = SQLSyntax.joinWithAnd(
            // join query for different field with AND
            Object.keys(queryPatternsByField).map((field) =>
                // pattern queries for the same field: joined with OR
                SQLSyntax.joinWithOr(
                    queryPatternsByField[field].map(
                        (pattern) =>
                            sqls`${escapeIdentifier(
                                field
                            )} LIKE ${PostgresDatabase.createWildcardMatch(
                                pattern
                            )}`
                    )
                ).roundBracket()
            )
        ).roundBracket();

        const sql = sqls`SELECT id, type, length(content) as length ${inline} FROM content`.where(
            SQLSyntax.joinWithAnd([authConditions, queryConditions])
        );

        const result = await this.pool.query(...sql.toQuery());
        if (!result?.rows?.length) {
            return [];
        }
        return result.rows;
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
            .then((res) => arrayToMaybe(res.rows));
    }

    deleteContentById(id: string) {
        return this.pool
            .query("DELETE FROM content WHERE id=$1", [id])
            .then((res) => (res && res.rows) || []);
    }

    private static createWildcardMatch(pattern: string): string {
        return pattern.replace(/[^\w\/\-* ]/gi, "").replace(/\*/g, "%");
    }
}
