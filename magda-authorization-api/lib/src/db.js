"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pool_1 = require("./pool");
const array_to_maybe_1 = require("@magda/typescript-common/lib/util/array-to-maybe");
function getUser(id) {
    return pool_1.default
        .query(
            'SELECT id, "displayName", email, "photoURL", source FROM users WHERE "id" = $1',
            [id]
        )
        .then(res => array_to_maybe_1.default(res.rows));
}
exports.getUser = getUser;
function getUserByExternalDetails(source, sourceId) {
    return pool_1.default
        .query(
            'SELECT id, "displayName", email, "photoURL", source, "sourceId" FROM users WHERE "sourceId" = $1 AND source = $2',
            [sourceId, source]
        )
        .then(res => array_to_maybe_1.default(res.rows));
}
exports.getUserByExternalDetails = getUserByExternalDetails;
function createUser(user) {
    return pool_1.default
        .query(
            'INSERT INTO users(id, "displayName", email, "photoURL", source, "sourceId") VALUES(uuid_generate_v4(), $1, $2, $3, $4, $5) RETURNING id',
            [
                user.displayName,
                user.email,
                user.photoURL,
                user.source,
                user.sourceId
            ]
        )
        .then(result => result.rows[0]);
}
exports.createUser = createUser;
//# sourceMappingURL=db.js.map
