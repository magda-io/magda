import SQLSyntax, { sqls, Value } from "sql-syntax";
import pg from "pg";
import AuthDecision, { UnconditionalTrueDecision } from "./opa/AuthDecision";
import { AspectQueryToSqlConfig } from "./opa/AspectQuery";
import { camelCase } from "lodash";

type PossibleObjectKind = "object" | "authObject";

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
    data: { [key: string]: Value }
) {
    if (!table.trim()) {
        throw new Error("invalid empty table name is supplied.");
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

    const result = await poolOrClient.query(
        ...sqls`INSERT INTO ${escapeIdentifier(table)} 
        (${SQLSyntax.csv(...fieldList)})
        VALUES
        (${SQLSyntax.csv(...valueList)})
        RETURNING *`.toQuery()
    );

    return result.rows[0];
}

export async function updateTableRecord(
    poolOrClient: pg.Client | pg.Pool,
    table: string,
    id: string,
    data: { [key: string]: Value }
) {
    if (!id.trim()) {
        throw new Error("Failed to delete the record: empty id was provided.");
    }
    if (!table.trim()) {
        throw new Error("invalid empty table name is supplied.");
    }
    const updates = Object.keys(data).reduce((result, currentKey) => {
        const currentValue = data[currentKey];
        result.push(
            sqls`${escapeIdentifier(currentKey)} = ${sqls`${currentValue}`}`
        );
        return result;
    }, [] as SQLSyntax[]);

    const result = await poolOrClient.query(
        ...sqls`UPDATE ${escapeIdentifier(table)} 
        SET ${SQLSyntax.csv(...updates)}
        WHERE id = ${id}
        RETURNING *`.toQuery()
    );

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
    await poolOrClient.query(
        ...sqls`DELETE FROM ${escapeIdentifier(
            table
        )} WHERE id = ${id}`.toQuery()
    );
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

    const limit = parseIntParam(queryConfig?.limit);
    let offset = parseIntParam(queryConfig?.offset);
    if (!offset || offset > MAX_PAGE_RECORD_NUMBER) {
        offset = MAX_PAGE_RECORD_NUMBER;
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
    const result = await poolOrClient.query(
        ...sqls`SELECT ${
            queryConfig?.selectedFields
                ? SQLSyntax.csv(...queryConfig.selectedFields)
                : sqls`*`
        } FROM ${escapeIdentifier(table)} ${where}
        ${offset ? sqls`OFFSET ${offset}` : SQLSyntax.empty}
        ${limit ? sqls`LIMIT ${limit}` : SQLSyntax.empty}
        `.toQuery()
    );
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
