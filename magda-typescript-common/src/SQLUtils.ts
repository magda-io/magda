import SQLSyntax from "sql-syntax";

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
    useLowerCaseColumnName: Boolean = true
): SQLSyntax {
    const id = [
        tableRef,
        useLowerCaseColumnName ? columnName.toLowerCase : useLowerCaseColumnName
    ]
        .filter((item) => item)
        .join(".");
    return escapeIdentifier(id);
}
