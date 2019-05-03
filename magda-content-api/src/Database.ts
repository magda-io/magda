import createPool from "./createPool";
import { Maybe } from "tsmonad";
import arrayToMaybe from "@magda/typescript-common/dist/util/arrayToMaybe";
import OpaCompileResponseParser from "@magda/typescript-common/dist/OpaCompileResponseParser";
import SimpleOpaSQLTranslator from "@magda/typescript-common/dist/SimpleOpaSQLTranslator";
import * as request from "request-promise-native";
import * as pg from "pg";
import * as _ from "lodash";
import { Content } from "./model";

const ALLOWABLE_QUERY_FIELDS = ["id", "type"];
const allowableQueryFieldLookup = _.keyBy(ALLOWABLE_QUERY_FIELDS, _.identity);

export interface DatabaseOptions {
    dbHost: string;
    dbPort: number;
    dbName: string;
    opaUrl: string;
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
    private opaUrl: string;

    constructor(options: DatabaseOptions) {
        this.pool = createPool(options);
        this.opaUrl = options.opaUrl;
    }

    async getSqlConditionsFromOpaByContentId(
        id: string,
        sqlValues: any[]
    ): Promise<string> {
        // --- operationUri should be `object/content/header/**/read` etc.
        const operationUri = `object/${id}/read`;
        const response = await request.post(`${this.opaUrl}compile`, {
            json: {
                query: "data.object.content.allowRead == true",
                input: {
                    operationUri
                },
                unknowns: ["input.object.content"]
            }
        });

        const parser = new OpaCompileResponseParser();
        parser.parse(response);

        const result = parser.evaluateRule(
            "data.partial.object.content.allowRead"
        );

        const translator = new SimpleOpaSQLTranslator(["input.object.content"]);
        return translator.parse(result, sqlValues);
    }

    async getContentById(id: string): Promise<Maybe<Content>> {
        const sqlParameters: any[] = [id];
        const sqlConditions = await this.getSqlConditionsFromOpaByContentId(
            id,
            sqlParameters
        );
        return await this.pool
            .query(
                `SELECT * FROM content WHERE "id" = $1 AND (${sqlConditions})`,
                sqlParameters
            )
            .then(res => arrayToMaybe(res.rows));
    }

    async check(): Promise<any> {
        await this.pool.query("SELECT id FROM content LIMIT 1");
        return {
            ready: true
        };
    }

    getContentSummary(
        queries: Query[],
        inlineContentIfType: string[]
    ): Promise<any> {
        for (const query of queries) {
            if (!allowableQueryFieldLookup[query.field]) {
                throw new Error(
                    "Attempted to filter by unknown query field " + query.field
                );
            }
        }

        const params: string[] = [];
        let paramCounter = 0;
        const getParamIndex = () => {
            return ++paramCounter;
        };

        let inline = "";
        if (inlineContentIfType.length > 0) {
            const inlineStatements = inlineContentIfType.map((type, i) => {
                params.push(type.replace(/\'/g, ""));
                return `type = $${getParamIndex()}`;
            });

            inline = `,
            CASE
              WHEN ${inlineStatements.join(" OR ")} THEN content
              ELSE NULL
            END
            AS content`;
        }

        const whereClauses = _.flatMap(queries, query =>
            query.patterns.map((pattern: string) => {
                params.push(PostgresDatabase.createWildcardMatch(pattern));

                return `${query.field} LIKE $${getParamIndex()}`;
            })
        ).join(" OR ");

        const sql = `SELECT id, type, length(content) as length ${inline} FROM content ${
            whereClauses.length > 0 ? "WHERE " + whereClauses : ""
        }`;

        return this.pool
            .query(sql, params)
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
