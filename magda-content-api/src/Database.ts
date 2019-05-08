import createPool from "./createPool";
import { Maybe } from "tsmonad";
import arrayToMaybe from "@magda/typescript-common/dist/util/arrayToMaybe";
import OpaCompileResponseParser, {
    CompleteRuleResult
} from "@magda/typescript-common/dist/OpaCompileResponseParser";
import SimpleOpaSQLTranslator from "@magda/typescript-common/dist/SimpleOpaSQLTranslator";
import * as request from "request-promise-native";
import * as pg from "pg";
import * as _ from "lodash";
import { Content } from "./model";
import AccessControlError from "@magda/typescript-common/dist/authorization-api/AccessControlError";

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

interface QueryPattern {
    field: string;
    pattern: string;
}

interface QueryPatternResult extends QueryPattern {
    opaResult?: CompleteRuleResult;
}

export default class PostgresDatabase implements Database {
    private pool: pg.Pool;
    private opaUrl: string;

    constructor(options: DatabaseOptions) {
        this.pool = createPool(options);
        this.opaUrl = options.opaUrl;
    }

    async getContentPartialDecisionByContentId(
        id: string,
        jwtToken: string = null
    ): Promise<CompleteRuleResult> {
        // --- incoming id could be `header/navigation/datasets.json` or `header/logo-mobile`
        // --- or a pattern header/*
        // --- operationUri should be `object/content/header/**/read` etc.
        const resourceId = id.replace(/\.[^\.\/$]/, "");
        const operationUri = `object/content/${resourceId}/read`;
        const requestOptions: any = {
            json: {
                query: "data.object.content.allowRead == true",
                input: {
                    operationUri
                },
                unknowns: ["input.object.content"]
            }
        };
        if (jwtToken) {
            requestOptions.headers = {
                "X-Magda-Session": jwtToken
            };
        }
        const response = await request.post(
            `${this.opaUrl}compile`,
            requestOptions
        );

        const parser = new OpaCompileResponseParser();
        parser.parse(response);

        return parser.evaluateRule("data.partial.object.content.allowRead");
    }

    opaResultToSqlClause(result: CompleteRuleResult, sqlValues: any[]): string {
        const translator = new SimpleOpaSQLTranslator(["input.object.content"]);
        return translator.parse(result, sqlValues);
    }

    async getSqlClausesFromOpaByContentId(
        id: string,
        sqlValues: any[],
        jwtToken: string = null
    ): Promise<string> {
        const result = await this.getContentPartialDecisionByContentId(
            id,
            jwtToken
        );
        return this.opaResultToSqlClause(result, sqlValues);
    }

    async getContentDecisionById(
        id: string,
        jwtToken: string = null
    ): Promise<boolean> {
        // --- incoming id could be `header/navigation/datasets.json` or `header/logo-mobile`
        // --- operationUri should be `object/content/header/header/navigation/datasets/read` etc.
        const resourceId = id.replace(/\.[^\.\/$]/, "");
        const operationUri = `object/content/${resourceId}/read`;
        const requestOptions: any = {
            json: {
                input: {
                    operationUri,
                    object: {
                        content: {
                            id: resourceId
                        }
                    }
                }
            }
        };
        if (jwtToken) {
            requestOptions.headers = {
                "X-Magda-Session": jwtToken
            };
        }
        // --- we don't need partial evaluation as we only need the decision for a particular resource
        const response = await request.post(
            `${this.opaUrl}data/object/content/allowRead`,
            requestOptions
        );

        if (response && response.result === true) return true;
        else return false;
    }

    async getContentById(
        id: string,
        jwtToken: string = null
    ): Promise<Maybe<Content>> {
        const isAllow = await this.getContentDecisionById(id, jwtToken);
        if (!isAllow) throw new AccessControlError(`Access denied for ${id}`);

        const sqlParameters: any[] = [id];
        return await this.pool
            .query(`SELECT * FROM content WHERE "id" = $1`, sqlParameters)
            .then(res => arrayToMaybe(res.rows));
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
        jwtToken: string = null
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

        const queryPatterns: QueryPattern[] = [];
        let queryPatternResults: QueryPatternResult[];

        queries.forEach(q =>
            q.patterns.forEach(p =>
                queryPatterns.push({
                    field: q.field,
                    pattern: p
                })
            )
        );

        queryPatternResults = await Promise.all(
            queryPatterns.map(qp => {
                if (qp.field !== "id") {
                    return Promise.resolve(qp);
                } else {
                    return (async () => {
                        const opaResult = await this.getContentPartialDecisionByContentId(
                            // --- we used glob pattern in opa policy
                            // --- header/* should be header/** to match header/navigation/datasets
                            qp.pattern.replace(/\/\*$/, "/**"),
                            jwtToken
                        );
                        return {
                            ...qp,
                            opaResult
                        };
                    })();
                }
            })
        );

        const whereClauses: string[] = [];
        queryPatternResults.forEach(r => {
            params.push(PostgresDatabase.createWildcardMatch(r.pattern));
            const patternLookupSql = `${r.field} LIKE $${getParamIndex()}`;

            if (r.field !== "id") {
                whereClauses.push(patternLookupSql);
            } else {
                const patternConditions = [];
                patternConditions.push(patternLookupSql);
                const accessControlSql = this.opaResultToSqlClause(
                    r.opaResult,
                    params
                );
                patternConditions.push(accessControlSql);
                whereClauses.push(
                    patternConditions.map(c => `(${c})`).join(" AND ")
                );
            }
        });

        const sql = `SELECT id, type, length(content) as length ${inline} FROM content ${
            whereClauses.length
                ? `WHERE ${whereClauses.map(c => `(${c})`).join(" OR ")} `
                : ""
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
