import SQLSyntax, { sqls, Value, RawValue } from "sql-syntax";
import pg from "pg";
import AuthDecision, { UnconditionalTrueDecision } from "./opa/AuthDecision";
import { AspectQueryToSqlConfig } from "./opa/AspectQuery";
import { camelCase, difference } from "lodash";

type PossibleObjectKind = "object" | "authObject";

let isDebugMode = false;

export function getDebugMode() {
    return isDebugMode;
}

export function setDebugMode(debugMode: boolean) {
    isDebugMode = debugMode;
}

/**
 * Escape SQL identifier string
 * Although postgreSQL does allow non-ASCII characters in identifiers, to make it simple, we will remove any non-ASCII characters.
 *
 * @export
 * @param {string} idStr
 * @return {*}  {string}
 */
export function escapeIdentifierStr(idStr: string): string {
    return '"' + idStr.replace(/[^\x20-\x7e]/g, "").replace(/"/g, "\"'") + '"';
}

/**
 * Escape SQL identifier (e.g. column names, or table names).
 * `xxx."ss.dd` will be escaped as `"xxx"."""ss"."dd"`
 * Although postgreSQL does allow non-ASCII characters in identifiers, to make it simple, we will remove any non-ASCII characters.
 *
 * @export
 * @param {string} id
 * @return {*}  {SQLSyntax}
 */
export function escapeIdentifier(id: string): SQLSyntax {
    const sanitisedIdStr = id.replace(/[^\x20-\x7e]/g, "");
    const parts = sanitisedIdStr.split(".");
    const escapedIdStr =
        parts.length > 1
            ? parts.map((item) => escapeIdentifierStr(item)).join(".")
            : escapeIdentifierStr(sanitisedIdStr);
    return SQLSyntax.createUnsafely(escapedIdStr);
}

/**
 * Make a postgreSQL identifier in SQLSyntax from tableRef (optional) & column name.
 *
 * @export
 * @param {String} columnName
 * @param {String} [tableRef=""]
 * @param {Boolean} [useLowerCaseColumnName=true]
 * @return {*}  {SQLSyntax}
 */
export function getTableColumnName(
    columnName: String,
    tableRef: String = "",
    useLowerCaseColumnName: Boolean = false
): SQLSyntax {
    const id = [
        tableRef,
        useLowerCaseColumnName ? columnName.toLowerCase : useLowerCaseColumnName
    ]
        .filter((item) => item)
        .join(".");
    return escapeIdentifier(id);
}

/**
 * Create a record for given table with given data object.
 * This method will use the key / value pairs of the object as column name / value of the new record.
 * It will return the newly created record
 *
 * @export
 * @param {pg.Client | pg.Pool} poolOrClient
 * @param {string} table
 * @param {{ [key: string]: Value }} data
 * @return {*}
 */
export async function createTableRecord(
    poolOrClient: pg.Client | pg.Pool,
    table: string,
    data: { [key: string]: RawValue },
    allowFieldList?: string[],
    autoGenerateUuid: boolean = true
) {
    if (!table.trim()) {
        throw new Error("invalid empty table name is supplied.");
    }
    if (autoGenerateUuid) {
        data["id"] = sqls`uuid_generate_v4()`;
    }

    if (allowFieldList?.length) {
        const keys = Object.keys(data);
        const diff = difference(keys, allowFieldList);
        if (diff?.length) {
            throw new Error(
                `Failed to create record, the following fields are not allowed: ${diff.join(
                    ","
                )}`
            );
        }
    }

    const [fieldList, valueList] = Object.keys(data).reduce(
        (result, currentKey) => {
            const currentValue = data[currentKey];
            result[0].push(escapeIdentifier(currentKey));
            result[1].push(sqls`${currentValue}`);
            return result;
        },
        [[], []] as [SQLSyntax[], SQLSyntax[]]
    );

    const sqlSyntax = sqls`INSERT INTO ${escapeIdentifier(table)} 
        (${SQLSyntax.csv(...fieldList)})
        VALUES
        (${SQLSyntax.csv(...valueList)})
        RETURNING *`;

    if (isDebugMode) {
        console.log(sqlSyntax.toQuery());
    }

    const result = await poolOrClient.query(...sqlSyntax.toQuery());

    return result.rows[0];
}

export async function updateTableRecord(
    poolOrClient: pg.Client | pg.Pool,
    table: string,
    id: string,
    data: { [key: string]: Value },
    allowFieldList?: string[]
) {
    if (!id.trim()) {
        throw new Error("Failed to delete the record: empty id was provided.");
    }
    if (!table.trim()) {
        throw new Error("invalid empty table name is supplied.");
    }
    if (allowFieldList?.length) {
        const keys = Object.keys(data);
        const diff = difference(keys, allowFieldList);
        if (diff?.length) {
            throw new Error(
                `Failed to update record, the following fields are not allowed: ${diff.join(
                    ","
                )}`
            );
        }
    }
    const updates = Object.keys(data).reduce((result, currentKey) => {
        const currentValue = data[currentKey];
        result.push(
            sqls`${escapeIdentifier(currentKey)} = ${sqls`${currentValue}`}`
        );
        return result;
    }, [] as SQLSyntax[]);

    const sqlSyntax = sqls`UPDATE ${escapeIdentifier(table)} 
        SET ${SQLSyntax.csv(...updates)}
        WHERE id = ${id}
        RETURNING *`;

    if (isDebugMode) {
        console.log(sqlSyntax.toQuery());
    }

    const result = await poolOrClient.query(...sqlSyntax.toQuery());

    return result.rows[0];
}

export async function deleteTableRecord(
    poolOrClient: pg.Client | pg.Pool,
    table: string,
    id: string
) {
    if (!id.trim()) {
        throw new Error("Failed to delete the record: empty id was provided.");
    }
    if (!table.trim()) {
        throw new Error("invalid empty table name is supplied.");
    }
    const sqlSyntax = sqls`DELETE FROM ${escapeIdentifier(
        table
    )} WHERE id = ${id}`;

    if (isDebugMode) {
        console.log(sqlSyntax.toQuery());
    }

    await poolOrClient.query(...sqlSyntax.toQuery());
}

export function parseIntParam(p: number | string | undefined) {
    if (!p) {
        return 0;
    }
    const result = parseInt(p?.toString());
    if (isNaN(result)) {
        return 0;
    }
    return result;
}

export const MAX_PAGE_RECORD_NUMBER = 500;

export async function searchTableRecord<T = any>(
    poolOrClient: pg.Client | pg.Pool,
    table: string,
    contiditions: SQLSyntax[] = [],
    queryConfig?: {
        offset?: number | string;
        limit?: number | string;
        authDecision?: AuthDecision;
        objectKind?: PossibleObjectKind;
        toSqlConfig?: AspectQueryToSqlConfig;
        selectedFields?: SQLSyntax[];
        leftJoins?: {
            table: string;
            joinCondition: SQLSyntax;
        }[];
    }
): Promise<T[]> {
    if (!table.trim()) {
        throw new Error("invalid empty table name is supplied.");
    }
    const objectKind = queryConfig?.objectKind
        ? queryConfig.objectKind
        : "authObject";
    const authDecision = queryConfig?.authDecision
        ? queryConfig.authDecision
        : UnconditionalTrueDecision;

    let limit = parseIntParam(queryConfig?.limit);
    const offset = parseIntParam(queryConfig?.offset);
    if (!limit || limit > MAX_PAGE_RECORD_NUMBER) {
        limit = MAX_PAGE_RECORD_NUMBER;
    }

    const config: AspectQueryToSqlConfig = queryConfig?.toSqlConfig
        ? queryConfig.toSqlConfig
        : {
              prefixes: [
                  `input.${objectKind}.${camelCase(table.replace(/s$/, ""))}`
              ]
          };
    const authConditions = authDecision.toSql(config);
    const where = SQLSyntax.where(
        SQLSyntax.joinWithAnd([...contiditions, authConditions])
    );

    const sqlSyntax = sqls`SELECT ${
        queryConfig?.selectedFields
            ? SQLSyntax.csv(...queryConfig.selectedFields)
            : sqls`*`
    } 
        FROM ${escapeIdentifier(table)}
        ${
            queryConfig?.leftJoins?.length
                ? SQLSyntax.join(
                      queryConfig.leftJoins.map(
                          (joinItem) =>
                              sqls`LEFT JOIN ${escapeIdentifier(
                                  joinItem.table
                              )} ON ${joinItem.joinCondition}`
                      ),
                      sqls`\n`
                  )
                : SQLSyntax.empty
        }
        ${where}
        ${offset ? sqls`OFFSET ${offset}` : SQLSyntax.empty}
        ${limit ? sqls`LIMIT ${limit}` : SQLSyntax.empty}
        `;

    if (isDebugMode) {
        console.log(sqlSyntax.toQuery());
    }

    const result = await poolOrClient.query(...sqlSyntax.toQuery());
    if (!result?.rows?.length) {
        return [];
    } else {
        return result.rows;
    }
}

export async function getTableRecord<T = any>(
    poolOrClient: pg.Client | pg.Pool,
    table: string,
    id: string,
    authDecision: AuthDecision = UnconditionalTrueDecision,
    objectKind: PossibleObjectKind = "authObject",
    toSqlConfig?: AspectQueryToSqlConfig
): Promise<T | null> {
    const records = await searchTableRecord<T>(
        poolOrClient,
        table,
        [sqls`id = ${id}`],
        {
            authDecision,
            objectKind,
            toSqlConfig
        }
    );
    if (!records.length) {
        return null;
    } else {
        return records[0];
    }
}

export async function countTableRecord(
    poolOrClient: pg.Client | pg.Pool,
    table: string,
    contiditions: SQLSyntax[] = [],
    authDecision?: AuthDecision,
    objectKind?: PossibleObjectKind,
    toSqlConfig?: AspectQueryToSqlConfig
): Promise<number> {
    const records = await searchTableRecord<{ total: number }>(
        poolOrClient,
        table,
        contiditions,
        {
            authDecision,
            objectKind,
            toSqlConfig,
            selectedFields: [sqls`COUNT(*) AS total`]
        }
    );
    if (!records.length) {
        return 0;
    } else {
        return records[0]["total"];
    }
}
