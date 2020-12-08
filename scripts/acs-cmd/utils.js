async function recordExist(pool, table, record) {
    if (!Object.keys(record).length) {
        throw new Error("record cannot be an empty object!");
    }
    const sqlValues = [];
    const where = Object.keys(record)
        .map((key) => {
            sqlValues.push(record[key]);
            return `"${key}" = $${sqlValues.length}`;
        })
        .join(" AND ");
    const result = await pool.query(
        `SELECT id FROM "${table}" WHERE ${where}`,
        sqlValues
    );
    if (!result || !result.rows || !result.rows.length) {
        return false;
    }
    return true;
}

const ADMIN_ROLE_ID = "00000000-0000-0003-0000-000000000000";

module.exports.recordExist = recordExist;
module.exports.ADMIN_ROLE_ID = ADMIN_ROLE_ID;
