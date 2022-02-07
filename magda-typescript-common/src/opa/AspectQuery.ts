import SQLSyntax, { sqls } from "sql-syntax";
import { getTableColumnName } from "../SQLUtils";

export class AspectQueryValue {
    readonly value: boolean | number | string;
    readonly postgresType: SQLSyntax;

    constructor(value: boolean | number | string) {
        this.value = value;
        switch (typeof value) {
            case "number":
                this.postgresType = sqls`NUMERIC`;
            case "boolean":
                this.postgresType = sqls`BOOL`;
            case "string":
                this.postgresType = sqls`TEXT`;
            default:
                throw new Error(
                    "getPostgresValueTypeCastStr: unsupported data type: `${" +
                        typeof value +
                        "}`"
                );
        }
    }
}

export interface AspectQueryToSqlConfig {
    prefixes: string[];
    tableRef?: string;
    useLowerCaseColumnName?: boolean;
}

export abstract class AspectQuery {
    readonly aspectId?: string;
    readonly path?: string[];
    readonly negated: boolean;

    constructor(
        aspectId: string,
        path: string[] = [],
        negated: boolean = false
    ) {
        this.aspectId = aspectId;
        this.path = path;
        this.negated = negated;
    }

    /**
     * interface for implementing logic of translating AspectQuery to SQL in different context
     *
     * @protected
     * @abstract
     * @param {AspectQueryToSqlConfig} config
     * @return {*}  {SQLSyntax}
     * @memberof AspectQuery
     */
    protected abstract sqlQueries(config: AspectQueryToSqlConfig): SQLSyntax;

    /**
     * Public interface of all types of AspectQuery. Call this method to covert AspectQuery to SQL statement.
     * Sub-class might choose to override this method to alter generic logic.
     *
     * @param {AspectQueryToSqlConfig} config
     * @return {SQLSyntax}
     * @memberof AspectQuery
     */
    public toSql(config: AspectQueryToSqlConfig): SQLSyntax {
        if (!this.aspectId) {
            throw new Error("Invalid AspectQuery: aspectId cannot be empty.");
        }
        const sqlQuery = this.sqlQueries(config);
        if (this.negated) {
            return sqls`NOT ${sqlQuery}`;
        } else {
            return sqlQuery;
        }
    }
}

export class AspectQueryTrue extends AspectQuery {
    constructor() {
        super(undefined);
    }

    sqlQueries(config: AspectQueryToSqlConfig) {
        return sqls`TRUE`;
    }

    // override default toSql as we don't need any validation logic
    toSql(config: AspectQueryToSqlConfig): SQLSyntax {
        return this.sqlQueries(config);
    }
}

export class AspectQueryFalse extends AspectQuery {
    constructor() {
        super(undefined);
    }

    sqlQueries(config: AspectQueryToSqlConfig) {
        return sqls`FALSE`;
    }

    // override default toSql as we don't need any validation logic
    toSql(config: AspectQueryToSqlConfig): SQLSyntax {
        return this.sqlQueries(config);
    }
}

export class AspectQueryExists extends AspectQuery {
    sqlQueries(config: AspectQueryToSqlConfig) {
        const fieldRef = getTableColumnName(
            this.aspectId,
            config.tableRef,
            config.useLowerCaseColumnName
        );

        if (this.path?.length) {
            return sqls`(${fieldRef} #> string_to_array(${this.path.join(
                ","
            )}, ',')) IS NOT NULL`;
        } else {
            return fieldRef.isNotNull();
        }
    }
}

export class AspectQueryWithValue extends AspectQuery {
    readonly value: AspectQueryValue;
    readonly operator: SQLSyntax;
    readonly placeReferenceFirst: boolean;

    constructor(
        value: AspectQueryValue,
        operator: SQLSyntax,
        placeReferenceFirst: boolean,
        aspectId: string,
        path: string[] = [],
        negated: boolean = false
    ) {
        super(aspectId, path, negated);
        this.value = value;
        this.operator = operator;
        this.placeReferenceFirst = placeReferenceFirst;
    }

    sqlQueries(config: AspectQueryToSqlConfig) {
        const fieldRef = getTableColumnName(
            this.aspectId,
            config.tableRef,
            config.useLowerCaseColumnName
        );
        const tableDataRef = !this.path?.length
            ? sqls`${fieldRef}::${this.value.postgresType}`
            : sqls`(${fieldRef} #>> string_to_array(${this.path.join(
                  ","
              )}, ','))::${this.value.postgresType}`;
        return this.placeReferenceFirst
            ? sqls`COALESCE(${tableDataRef} ${this.operator} ${this.value}::${this.value.postgresType}, false)`
            : sqls`COALESCE(${this.value}::${this.value.postgresType} ${this.operator} ${tableDataRef}, false)`;
    }
}

export class AspectQueryArrayNotEmpty extends AspectQuery {
    sqlQueries(config: AspectQueryToSqlConfig) {
        const fieldRef = getTableColumnName(
            this.aspectId,
            config.tableRef,
            config.useLowerCaseColumnName
        );
        const tableDataRef = !this.path?.length
            ? sqls`(${fieldRef} #> string_to_array('0',','))`
            : sqls`(${fieldRef} #>> string_to_array(${[...this.path, "0"].join(
                  ","
              )}, ','))`;
        return tableDataRef.isNotNull();
    }
}

export class AspectQueryValueInArray extends AspectQuery {
    readonly value: AspectQueryValue;

    constructor(
        value: AspectQueryValue,
        aspectId: string,
        path: string[] = [],
        negated: boolean = false
    ) {
        super(aspectId, path, negated);
        this.value = value;
    }

    sqlQueries(config: AspectQueryToSqlConfig) {
        const fieldRef = getTableColumnName(
            this.aspectId,
            config.tableRef,
            config.useLowerCaseColumnName
        );
        const tableDataRef = !this.path?.length
            ? sqls`COALESCE(
                (
                  (${fieldRef}::JSONB #> string_to_array('0',','))::JSONB
                ) @> to_json(${this.value})::JSONB,
                FALSE
              )`
            : sqls`COALESCE(
                (
                  (${fieldRef}::JSONB #> string_to_array(${this.path.join(
                  ","
              )}, ','))::JSONB
                ) @> to_json(${this.value})::JSONB,
                FALSE
              )`;
        return tableDataRef;
    }
}

export class AspectQueryGroup {
    readonly queries: AspectQuery[];
    readonly joinWithAnd: boolean;
    readonly negated: boolean;

    constructor(
        queries?: AspectQuery[],
        joinWithAnd: boolean = true,
        negated: boolean = false
    ) {
        this.queries = queries;
        this.joinWithAnd = joinWithAnd;
        this.negated = negated;
    }

    toSql(config: AspectQueryToSqlConfig): SQLSyntax {
        if (!this.queries?.length) {
            return SQLSyntax.empty;
        }
        let result: SQLSyntax;

        if (this.joinWithAnd) {
            if (
                this.queries.findIndex(
                    (item) => item instanceof AspectQueryFalse
                ) !== -1
            ) {
                result = sqls`FALSE`;
            } else {
                result = SQLSyntax.joinWithAnd(
                    this.queries.map((q) => {
                        if (q instanceof AspectQueryTrue) {
                            return SQLSyntax.empty;
                        } else {
                            return q.toSql(config);
                        }
                    })
                );
            }
        } else {
            if (
                this.queries.findIndex(
                    (item) => item instanceof AspectQueryTrue
                ) !== -1
            ) {
                result = sqls`TRUE`;
            } else {
                result = SQLSyntax.joinWithOr(
                    this.queries.map((q) => {
                        if (q instanceof AspectQueryFalse) {
                            return SQLSyntax.empty;
                        } else {
                            return q.toSql(config);
                        }
                    })
                );
            }
        }
        if (this.negated) {
            return sqls`NOT ${result}`;
        } else {
            return result;
        }
    }
}
