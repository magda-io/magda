import createPool from "./createPool.js";
import {
    User,
    Role,
    Permission,
    APIKeyRecord,
    UserRecord,
    CreateUserData,
    ResourceRecord,
    OperationRecord
} from "magda-typescript-common/src/authorization-api/model.js";
import { Maybe } from "@magda/tsmonad";
import arrayToMaybe from "magda-typescript-common/src/util/arrayToMaybe.js";
import pg from "pg";
import _ from "lodash";
import GenericError from "magda-typescript-common/src/authorization-api/GenericError.js";
import {
    ANONYMOUS_USERS_ROLE_ID,
    AUTHENTICATED_USERS_ROLE_ID,
    ADMIN_USERS_ROLE_ID
} from "magda-typescript-common/src/authorization-api/constants.js";
import { getUserId } from "magda-typescript-common/src/session/GetUserId.js";
import NestedSetModelQueryer from "./NestedSetModelQueryer.js";
import isUuid from "magda-typescript-common/src/util/isUuid.js";
import { v4 as uuidV4 } from "uuid";
import AuthDecision, {
    UnconditionalTrueDecision
} from "magda-typescript-common/src/opa/AuthDecision.js";
import SQLSyntax, { sqls, escapeIdentifier } from "sql-syntax";
import {
    parseIntParam,
    MAX_PAGE_RECORD_NUMBER,
    getTableRecord,
    createTableRecord,
    updateTableRecord
} from "magda-typescript-common/src/SQLUtils.js";
import ServerError from "magda-typescript-common/src/ServerError.js";
import { SYSTEM_ROLES } from "magda-typescript-common/src/authorization-api/constants.js";
import { generateAPIKey, createApiKeyHash } from "./apiKeyUtils.js";
import isArray from "magda-typescript-common/src/util/isArray.js";
import uniq from "lodash/uniq.js";
import isEmpty from "lodash/isEmpty.js";
import getBoolValWithDefault from "magda-typescript-common/src/getBoolValWithDefault.js";

export interface DatabaseOptions {
    dbHost: string;
    dbPort: number;
}

export const defaultAnonymousUserInfo: User = {
    id: "",
    displayName: "Anonymous User",
    email: "",
    photoURL: "",
    source: "",
    sourceId: "",
    isAdmin: false,
    roles: [
        {
            id: ANONYMOUS_USERS_ROLE_ID,
            name: "Anonymous Users",
            description: "Default role for unauthenticated users",
            permissionIds: [] as string[]
        }
    ],
    permissions: [],
    orgUnit: null,
    managingOrgUnitIds: []
};

export interface CreatePermissionOptions {
    name: string;
    description: string;
    userOwnershipConstraint?: boolean;
    orgUnitOwnershipConstraint?: boolean;
    preAuthorisedConstraint?: boolean;
    allowExemption?: boolean;
    resourceId?: string;
    resourceUri?: string;
    operationIds?: string[];
    operationUris?: string[];
    ownerId?: string;
    createBy?: string;
}

export interface UpdatePermissionOptions {
    name?: string;
    description?: string;
    userOwnershipConstraint?: boolean;
    orgUnitOwnershipConstraint?: boolean;
    preAuthorisedConstraint?: boolean;
    allowExemption?: boolean;
    resourceId?: string;
    resourceUri?: string;
    operationIds?: string[];
    operationUris?: string[];
    ownerId?: string | null;
    editBy?: string | null;
}

export default class Database {
    private pool: pg.Pool;
    private orgQueryer: NestedSetModelQueryer;

    constructor(options: DatabaseOptions) {
        this.pool = createPool(options);
        this.orgQueryer = new NestedSetModelQueryer(this.pool, "org_units", [
            "id",
            "name",
            "description",
            "left",
            "right",
            "create_by",
            "create_time",
            "edit_by",
            "edit_time"
        ]);
    }

    getPool(): pg.Pool {
        return this.pool;
    }

    getOrgQueryer(): NestedSetModelQueryer {
        return this.orgQueryer;
    }

    getUser(
        id: string,
        authDecision: AuthDecision = UnconditionalTrueDecision
    ): Promise<Maybe<User>> {
        const authConditions = authDecision.toSql({
            prefixes: ["input.authObject.user"]
        });
        const whereSql = SQLSyntax.where(
            SQLSyntax.joinWithAnd([authConditions, sqls`"id" = ${id}`])
        );

        const query = sqls`SELECT "id", "displayName", "email", "photoURL", "source", "sourceId", "isAdmin", "orgUnitId" FROM users ${whereSql}`;

        return this.pool
            .query(...query.toQuery())
            .then((res) => arrayToMaybe(res.rows));
    }

    async getUserRoles(
        id: string,
        authDecision: AuthDecision = UnconditionalTrueDecision
    ): Promise<Role[]> {
        const authConditions = authDecision.toSql({
            prefixes: ["input.authObject.user"],
            tableRef: "u"
        });
        const result = await this.pool.query(
            ...sqls`SELECT r.id, r.name, rp.permission_id
                FROM user_roles AS ur
                LEFT JOIN users u ON u.id = ur.user_id
                LEFT JOIN roles r ON r.id = ur.role_id
                LEFT JOIN role_permissions rp ON rp.role_id = ur.role_id
                WHERE ${SQLSyntax.joinWithAnd([
                    sqls`ur.user_id = ${id}`,
                    authConditions
                ])}`.toQuery()
        );
        const list: any = {};
        result.rows.forEach((item) => {
            const { permissionId, ...roleData } = _.zipObject(
                // --- underscore to camelCase case
                Object.keys(item).map(_.camelCase),
                Object.values(item)
            );
            if (!list[item.id]) {
                list[item.id] = {
                    ...roleData,
                    permissionIds: []
                };
            }
            if (permissionId) {
                list[item.id].permissionIds.push(permissionId);
            }
        });
        return Object.values(list);
    }

    async getUserPermissions(
        id: string,
        authDecision: AuthDecision = UnconditionalTrueDecision
    ): Promise<Permission[]> {
        const authConditions = authDecision.toSql({
            prefixes: ["input.authObject.user"],
            tableRef: "u"
        });
        const result = await this.pool.query(
            ...sqls`SELECT DISTINCT ON (p.id, op.id)
                p.id, p.name, p.resource_id, res.uri AS resource_uri,
                p.user_ownership_constraint,
                p.org_unit_ownership_constraint,
                p.pre_authorised_constraint,
                p.allow_exemption,
                op.id AS operation_id,
                op.uri AS operation_uri,
                op.name AS operation_name
                FROM role_permissions rp
                LEFT JOIN user_roles ur ON ur.role_id = rp.role_id
                LEFT JOIN users u ON u.id = ur.user_id
                LEFT JOIN permission_operations po ON po.permission_id = rp.permission_id
                LEFT JOIN operations op ON op.id = po.operation_id
                LEFT JOIN permissions p ON p.id = rp.permission_id
                LEFT JOIN resources res ON res.id = p.resource_id
                WHERE ${SQLSyntax.joinWithAnd([
                    sqls`ur.user_id = ${id}`,
                    authConditions
                ])}`.toQuery()
        );
        return this.convertPermissionOperationRowsToPermissions(result);
    }

    async getUserApiKeys(
        userId: string,
        authDecision: AuthDecision = UnconditionalTrueDecision
    ): Promise<APIKeyRecord[]> {
        if (!userId) {
            throw new ServerError("User ID cannot be empty!", 400);
        }
        const authConditions = authDecision.toSql({
            prefixes: ["input.authObject.apiKey"],
            tableRef: "a"
        });
        const result = await this.pool.query(
            ...sqls`SELECT * FROM (SELECT DISTINCT ON (a.id)
                a.*
                FROM api_keys a
                LEFT JOIN users u ON u.id = a.user_id
                WHERE ${SQLSyntax.joinWithAnd([
                    sqls`a.user_id = ${userId}`,
                    authConditions
                ])}) r ORDER BY r.created_timestamp DESC`.toQuery()
        );
        if (!result?.rows?.length) {
            return [];
        } else {
            return result.rows;
        }
    }

    async getApiKeyById(
        id: string,
        authDecision: AuthDecision = UnconditionalTrueDecision
    ): Promise<APIKeyRecord | null> {
        if (!id) {
            throw new ServerError("API Key ID cannot be empty!", 400);
        }
        const authConditions = authDecision.toSql({
            prefixes: ["input.authObject.apiKey"]
        });
        const whereConditions = SQLSyntax.joinWithAnd([
            sqls`id=${id}`,
            authConditions
        ]);
        const result = await this.pool.query(
            ...sqls`SELECT * FROM api_keys ${SQLSyntax.where(
                whereConditions
            )} LIMIT 1`.toQuery()
        );
        if (!result?.rows?.length) {
            return null;
        } else {
            return result.rows[0];
        }
    }

    async createUserApiKey(
        userId: string,
        expiryTime?: Date
    ): Promise<{ id: string; key: string }> {
        if (!userId) {
            throw new ServerError("User ID cannot be empty!", 400);
        }
        const users = await this.pool.query(
            ...sqls`SELECT id, "displayName" FROM users WHERE id=${userId} LIMIT 1`.toQuery()
        );

        if (!users?.rows?.length) {
            throw new ServerError(
                `Cannot locate user record with user id: ${userId}`,
                404
            );
        }

        const newKey = await generateAPIKey();
        const keyHash = await createApiKeyHash(newKey);

        const result = await this.pool.query(
            ...sqls`INSERT INTO "api_keys" 
                ("id", "user_id", "created_timestamp", "hash", "expiry_time", "enabled") 
                VALUES
                (uuid_generate_v4(), ${userId}, CURRENT_TIMESTAMP, ${keyHash}, ${
                expiryTime ? expiryTime : null
            }, True) RETURNING id`.toQuery()
        );
        const apiKeyId = result.rows[0].id;
        return {
            id: apiKeyId,
            key: newKey
        };
    }

    async updateUserApiKey(
        userId: string,
        apiKeyId: string,
        enabled: boolean | undefined,
        expiryTime: Date | undefined
    ): Promise<void> {
        if (!userId) {
            throw new ServerError("User ID cannot be empty!", 400);
        }
        if (!apiKeyId) {
            throw new ServerError("API Key ID cannot be empty!", 400);
        }
        if (typeof enabled !== "boolean" && !(expiryTime instanceof Date)) {
            // nothing to update
            return;
        }
        const apiKey = await this.pool.query(
            ...sqls`SELECT id FROM api_keys WHERE user_id=${userId} AND id=${apiKeyId} LIMIT 1`.toQuery()
        );

        if (!apiKey?.rows?.length) {
            throw new ServerError(
                `Cannot locate api key record with api key id: ${apiKeyId} user id: ${userId}`,
                404
            );
        }

        const updates: SQLSyntax[] = [sqls`edit_time=CURRENT_TIMESTAMP`];
        if (typeof enabled === "boolean") {
            updates.push(sqls`"enabled"=${enabled}`);
        }
        if (expiryTime instanceof Date) {
            updates.push(sqls`"expiry_time"=${expiryTime}`);
        }

        await this.pool.query(
            ...sqls`UPDATE "api_keys" SET ${SQLSyntax.join(
                updates,
                sqls`, `
            )} WHERE id = ${apiKeyId}`.toQuery()
        );
    }

    async deleteUserApiKey(
        userId: string,
        apiKeyId: string
    ): Promise<{ deleted: boolean }> {
        if (!userId) {
            throw new ServerError("User ID cannot be empty!", 400);
        }
        if (!apiKeyId) {
            throw new ServerError("API Key ID cannot be empty!", 400);
        }

        const apiKey = await this.pool.query(
            ...sqls`SELECT id FROM api_keys WHERE user_id=${userId} AND id=${apiKeyId} LIMIT 1`.toQuery()
        );

        if (!apiKey?.rows?.length) {
            return { deleted: false };
        }

        await this.pool.query(
            ...sqls`DELETE FROM api_keys WHERE id = ${apiKeyId}`.toQuery()
        );

        return { deleted: true };
    }

    private convertPermissionOperationRowsToPermissions(
        result: pg.QueryResult
    ): Permission[] {
        const list: any = {};
        result.rows.forEach((item) => {
            const {
                operationId,
                operationUri,
                operationName,
                ...permissionData
            } = _.zipObject(
                // --- underscore to camelCase case
                Object.keys(item).map(_.camelCase),
                Object.values(item)
            );
            if (!list[item.id]) {
                list[item.id] = {
                    ...permissionData,
                    operations: []
                };
            }
            if (operationId) {
                list[item.id].operations.push({
                    id: operationId,
                    uri: operationUri,
                    name: operationName
                });
            }
        });
        return Object.values(list);
    }

    async getRolePermissions(
        id: string,
        authDecision: AuthDecision = UnconditionalTrueDecision,
        queryConfig: {
            offset?: string | number;
            limit?: string | number;
            conditions?: SQLSyntax[];
        } = {
            offset: 0,
            limit: 0,
            conditions: []
        }
    ): Promise<Permission[]> {
        const authConditions = authDecision.toSql({
            prefixes: ["input.authObject.role"],
            tableRef: "r"
        });
        let limit = parseIntParam(queryConfig?.limit);
        const offset = parseIntParam(queryConfig?.offset);
        if (limit > MAX_PAGE_RECORD_NUMBER) {
            limit = MAX_PAGE_RECORD_NUMBER;
        }
        const conditions = queryConfig?.conditions?.length
            ? queryConfig.conditions
            : [];
        const result = await this.pool.query(
            ...sqls`SELECT  DISTINCT ON (p.id, op.id)
            p.id, p.name, p.resource_id, res.uri AS resource_uri,
            p.user_ownership_constraint,
            p.org_unit_ownership_constraint,
            p.pre_authorised_constraint,
            p.allow_exemption,
            op.id AS operation_id,
            op.uri AS operation_uri,
            op.name AS operation_name
            FROM role_permissions rp 
            LEFT JOIN roles r ON r.id = rp.role_id
            LEFT JOIN permission_operations po ON po.permission_id = rp.permission_id
            LEFT JOIN operations op ON op.id = po.operation_id
            LEFT JOIN permissions p ON p.id = rp.permission_id
            LEFT JOIN resources res ON res.id = p.resource_id
            WHERE ${SQLSyntax.joinWithAnd([
                ...(conditions?.length ? conditions : []),
                sqls`rp.role_id = ${id}`,
                authConditions
            ])}
            ${offset ? sqls`OFFSET ${offset}` : SQLSyntax.empty}
            ${limit ? sqls`LIMIT ${limit}` : SQLSyntax.empty}
            `.toQuery()
        );
        return this.convertPermissionOperationRowsToPermissions(result);
    }

    getUsers(
        authDecision: AuthDecision = UnconditionalTrueDecision
    ): Promise<User[]> {
        const authConditions = authDecision.toSql({
            prefixes: ["input.authObject.user"]
        });
        return this.pool
            .query(
                ...sqls`SELECT "id", "displayName", "email", "photoURL", "source", "sourceId", "isAdmin", "orgUnitId" 
                FROM users 
                ${SQLSyntax.where(
                    SQLSyntax.joinWithAnd([
                        // do not show the default admin account
                        sqls`id <> '00000000-0000-4000-8000-000000000000'`,
                        authConditions
                    ])
                )}`.toQuery()
            )
            .then((res) => res.rows);
    }

    getValidUserUpdateFields() {
        return [
            "displayName",
            "email",
            "photoURL",
            "source",
            "sourceId",
            "isAdmin",
            "orgUnitId"
        ];
    }

    isValidUserUpdateField(fieldName: string) {
        return (
            this.getValidUserUpdateFields().findIndex(
                (item) => item === fieldName
            ) !== -1
        );
    }

    async updateUser(
        userId: string,
        update: Partial<UserRecord>
    ): Promise<UserRecord> {
        if (
            !update ||
            typeof update !== "object" ||
            !Object.keys(update).length
        ) {
            throw new ServerError("user update data cannot be empty.", 400);
        }

        const updates: SQLSyntax[] = [];

        Object.keys(update).forEach((field) => {
            if (!this.isValidUserUpdateField(field)) {
                throw new Error(
                    `Field ${field} is not a valid user record update field.`
                );
            }
            updates.push(
                sqls`${escapeIdentifier(field)} = ${(update as any)[field]}`
            );
        });

        await this.pool.query(
            ...sqls`UPDATE users SET ${SQLSyntax.join(
                updates,
                sqls`,`
            )} WHERE id = ${userId}`.toQuery()
        );

        const fetchUserResult = await this.pool.query(
            ...sqls`SELECT * FROM users WHERE id = ${userId}`.toQuery()
        );
        if (!fetchUserResult?.rows?.length) {
            throw new ServerError(
                "failed to locate user by id: " + userId,
                400
            );
        }
        return fetchUserResult.rows[0];
    }

    /**
     * This function is mainly used by internal service for user lookup
     *
     * @param {string} source
     * @param {string} sourceId
     * @return {*}  {Promise<Maybe<User>>}
     * @memberof Database
     */
    getUserByExternalDetails(
        source: string,
        sourceId: string,
        authDecision: AuthDecision = UnconditionalTrueDecision
    ): Promise<Maybe<User>> {
        const authConditions = authDecision.toSql({
            prefixes: ["input.authObject.user"]
        });
        return this.pool
            .query(
                ...sqls`SELECT "id", "displayName", "email", "photoURL", "source", "sourceId", "isAdmin", "orgUnitId" 
                FROM users 
                WHERE ${SQLSyntax.joinWithAnd([
                    sqls`"sourceId" = ${sourceId}`,
                    sqls`"source" = ${source}`,
                    authConditions
                ])}`.toQuery()
            )
            .then((res) => arrayToMaybe(res.rows));
    }

    async createUser(user: CreateUserData): Promise<UserRecord> {
        const userId = uuidV4();

        if (!user?.displayName) {
            throw new ServerError(`displayName cannot be empty.`, 400);
        }

        if (!user?.email) {
            throw new ServerError(`email cannot be empty.`, 400);
        }

        if (!user?.isAdmin) {
            user.isAdmin = false;
        }

        if (!user?.photoURL) {
            user.photoURL = "";
        }

        if (!user?.source) {
            user.source = "unknown";
        }

        if (!user?.sourceId) {
            user.sourceId = userId;
        }
        const insertFields = [sqls`id`];
        const values = [sqls`${userId}`];

        Object.keys(user).forEach((field) => {
            if (!this.isValidUserUpdateField(field)) {
                throw new ServerError(
                    `Field ${field} is not a valid user record field.`,
                    400
                );
            }
            insertFields.push(escapeIdentifier(field));
            values.push(sqls`${(user as any)[field]}`);
        });

        if (user?.orgUnitId && !isUuid(user?.orgUnitId)) {
            throw new ServerError(
                `orgUnitId ${user?.orgUnitId} is not a valid uuid.`,
                400
            );
        }

        await this.pool.query(
            ...sqls`INSERT INTO users 
            (${SQLSyntax.join(insertFields, sqls`,`)}) 
            VALUES 
            (${SQLSyntax.join(values, sqls`,`)})`.toQuery()
        );

        const fetchUserResult = await this.pool.query(
            ...sqls`SELECT * FROM users WHERE id = ${userId}`.toQuery()
        );
        if (!fetchUserResult?.rows?.length) {
            throw new ServerError(
                "failed to locate newly created user by id: " + userId,
                500
            );
        }

        //--- add default authenticated role to the newly create user
        await this.pool.query(
            ...sqls`INSERT INTO user_roles (role_id, user_id) VALUES(${AUTHENTICATED_USERS_ROLE_ID}, ${userId})`.toQuery()
        );

        //--- add default Admin role to the newly create user (if isAdmin is true)
        if (user.isAdmin) {
            await this.pool.query(
                ...sqls`INSERT INTO user_roles (role_id, user_id) VALUES(${ADMIN_USERS_ROLE_ID}, ${userId})`.toQuery()
            );
        }

        return fetchUserResult.rows[0];
    }

    async check(): Promise<any> {
        await this.pool.query("SELECT id FROM users LIMIT 1");
        return {
            ready: true
        };
    }

    /**
     * Return AnonymousUser info as fallback when system can't authenticate user
     * Should capture call errors and return AnonymousUser info as fallback
     */
    async getDefaultAnonymousUserInfo(): Promise<User> {
        const user = { ...defaultAnonymousUserInfo };
        try {
            user.permissions = await this.getRolePermissions(user.roles[0].id);
            user.roles[0].permissionIds = user.permissions.map(
                (item) => item.id
            );
            return user;
        } catch (e) {
            return user;
        }
    }

    async getCurrentUserInfo(req: any, jwtSecret: string): Promise<User> {
        const userId = getUserId(req, jwtSecret).valueOr(null);

        if (!userId || userId === "") {
            return await this.getDefaultAnonymousUserInfo();
        }

        const user = (await this.getUser(userId)).valueOr(null);
        if (!user) {
            throw new GenericError("Not Found User", 404);
        }
        user.roles = await this.getUserRoles(userId);
        user.permissions = await this.getUserPermissions(userId);
        if (!isUuid(user.orgUnitId)) {
            user.managingOrgUnitIds = [];
            user.orgUnit = null;
        } else {
            user.orgUnit = (
                await this.orgQueryer.getNodeById(user.orgUnitId, [
                    "id",
                    "name",
                    "description",
                    "left",
                    "right",
                    "create_by",
                    "create_time",
                    "edit_by",
                    "edit_time"
                ])
            ).valueOr(null);
            user.managingOrgUnitIds = (
                await this.orgQueryer.getAllChildren(user.orgUnitId, true, [
                    "id"
                ])
            ).map((item) => item.id);
        }
        return user;
    }

    async getUserApiKeyById(
        apiKeyId: string,
        authDecision: AuthDecision = UnconditionalTrueDecision
    ): Promise<APIKeyRecord> {
        const authConditions = authDecision.toSql({
            prefixes: ["input.authObject.apiKey"]
        });
        const result = await this.pool.query(
            ...sqls`SELECT * FROM api_keys WHERE ${SQLSyntax.joinWithAnd([
                sqls`id = ${apiKeyId}`,
                authConditions
            ])} LIMIT 1`.toQuery()
        );
        if (!result?.rows?.length) {
            throw new GenericError(
                `cannot find API Key with ID ${apiKeyId}`,
                401
            );
        }
        return result.rows[0] as APIKeyRecord;
    }

    async updateApiKeyAttempt(apiKeyId: string, isSuccessfulAttempt: Boolean) {
        if (!apiKeyId) {
            throw new ServerError("invalid empty api key id.", 400);
        }
        const updateTimestampCol = isSuccessfulAttempt
            ? sqls`last_successful_attempt_time`
            : sqls`last_failed_attempt_time`;
        await this.pool.query(
            ...sqls`UPDATE api_keys SET ${updateTimestampCol} = CURRENT_TIMESTAMP WHERE id = ${apiKeyId}`.toQuery()
        );
    }

    updateApiKeyAttemptNonBlocking(
        apiKeyId: string,
        isSuccessfulAttempt: Boolean
    ): void {
        this.updateApiKeyAttempt(apiKeyId, isSuccessfulAttempt).catch((e) => {
            console.error("Failed to update API key attempt timestamp: " + e);
        });
    }

    /**
     * Add a list of roleIds to the user if the user don't has the role. Return a list of current role ids after the changes.
     *
     * @param {string} userId
     * @param {string[]} roleIds
     * @returns {Promise<string[]>}
     * @memberof Database
     */
    async addUserRoles(userId: string, roleIds: string[]): Promise<string[]> {
        if (!isUuid(userId)) {
            throw new ServerError(`Invalid user id: ${userId}`, 400);
        }

        const dbClient = await this.pool.connect();
        let finalRoleList: string[];

        try {
            await dbClient.query("BEGIN");

            let result = await dbClient.query(
                ...sqls`SELECT role_id
                    FROM user_roles
                    WHERE user_id = ${userId}`.toQuery()
            );

            const currentRoleIds = !result.rows.length
                ? []
                : result.rows.map((item) => item.role_id as string);
            const roleIdsToAdd = !roleIds?.length
                ? []
                : roleIds.filter(
                      (roleId) => currentRoleIds.indexOf(roleId) === -1
                  );

            if (roleIdsToAdd.length) {
                await Promise.all(
                    roleIdsToAdd.map((roleId) => {
                        if (!isUuid(roleId)) {
                            throw new ServerError(
                                `Invalid role ID: ${roleId}`,
                                400
                            );
                        }
                        dbClient.query(
                            ...sqls`INSERT INTO user_roles (role_id, user_id) VALUES(${roleId}, ${userId})`.toQuery()
                        );
                    })
                );
                finalRoleList = [...currentRoleIds, ...roleIdsToAdd];
            } else {
                finalRoleList = currentRoleIds;
            }

            await dbClient.query("COMMIT");
        } catch (e) {
            await dbClient.query("ROLLBACK");
            throw e;
        } finally {
            dbClient.release();
        }

        return finalRoleList;
    }

    /**
     * Delete roles from a user.
     * @param userId
     * @param roleIds
     */
    async deleteUserRoles(userId: string, roleIds: string[]): Promise<void> {
        if (!isUuid(userId)) {
            throw new ServerError(`Invalid user id: ${userId}`, 400);
        }

        const roleIdToBeDeleted: SQLSyntax[] = !roleIds?.length
            ? []
            : roleIds.map((roleId, idx) => {
                  if (!isUuid(roleId)) {
                      throw new ServerError(`Invalid role ID: ${roleId}`, 400);
                  }
                  return sqls`${roleId}`;
              });

        if (!roleIdToBeDeleted.length) {
            return;
        }

        await this.pool.query(
            ...sqls`DELETE FROM user_roles WHERE user_id = ${userId} AND role_id IN (${SQLSyntax.join(
                roleIdToBeDeleted,
                sqls`,`
            )})`.toQuery()
        );
    }

    async deleteRolePermission(
        roleId?: string,
        permissionId?: string,
        deletePermission: boolean = true
    ) {
        if (!isUuid(roleId)) {
            throw new ServerError("role id should be a valid uuid.", 400);
        }
        if (!isUuid(permissionId)) {
            throw new ServerError("permission id should be a valid uuid.", 400);
        }

        const pool = this.pool;

        const role = await getTableRecord(pool, "roles", roleId);
        if (!role) {
            throw new ServerError(
                "Cannot locate role record by ID: " + roleId,
                400
            );
        }
        const permission = await getTableRecord(
            pool,
            "permissions",
            permissionId
        );
        if (!permission) {
            throw new ServerError(
                "Cannot locate permission record by ID: " + permissionId,
                400
            );
        }
        const result = await pool.query(
            ...sqls`SELECT 1 FROM role_permissions WHERE role_id != ${roleId} AND permission_id = ${permissionId}`.toQuery()
        );
        await pool.query(
            ...sqls`DELETE FROM role_permissions WHERE role_id = ${roleId} AND permission_id = ${permissionId}`.toQuery()
        );
        if (!result?.rows?.length && deletePermission) {
            // the permission has not assigned to other roles
            // we will delete the permission record as well
            const client = await pool.connect();
            try {
                await client.query("BEGIN");

                await client.query(
                    ...sqls`DELETE FROM permission_operations WHERE permission_id = ${permissionId}`.toQuery()
                );
                await client.query(
                    ...sqls`DELETE FROM permissions WHERE id = ${permissionId}`.toQuery()
                );

                await client.query("COMMIT");
            } catch (e) {
                await client.query("ROLLBACK");
                throw e;
            } finally {
                client.release();
            }
        }
    }

    async deletePermission(
        permissionId?: string,
        client: pg.PoolClient = null
    ): Promise<boolean> {
        if (!isUuid(permissionId)) {
            throw new ServerError("permission id should be a valid uuid.", 400);
        }

        const shouldReleaseClient = client ? false : true;
        if (!client) {
            client = await this.pool.connect();
        }

        try {
            const permission = await getTableRecord(
                client,
                "permissions",
                permissionId
            );
            if (!permission) {
                return false;
            }
            const result = await client.query(
                ...sqls`SELECT 1 FROM role_permissions WHERE permission_id = ${permissionId}`.toQuery()
            );
            if (result?.rows?.length) {
                throw new ServerError(
                    `Cannot delete permission: ${permissionId} before remove it from all assigned roles.`,
                    400
                );
            }

            try {
                await client.query("BEGIN");

                await client.query(
                    ...sqls`DELETE FROM permission_operations WHERE permission_id = ${permissionId}`.toQuery()
                );
                await client.query(
                    ...sqls`DELETE FROM permissions WHERE id = ${permissionId}`.toQuery()
                );

                await client.query("COMMIT");
                return true;
            } catch (e) {
                await client.query("ROLLBACK");
                throw e;
            }
        } finally {
            if (shouldReleaseClient) {
                client.release();
            }
        }
    }

    async deleteRole(roleId?: string, client: pg.PoolClient = null) {
        roleId = roleId?.trim();
        if (!roleId) {
            throw new ServerError("Invalid empty role id supplied.", 400);
        }

        if (SYSTEM_ROLES.indexOf(roleId) !== -1) {
            throw new ServerError(
                `Cannot delete a system role: ${roleId}`,
                400
            );
        }

        const shouldReleaseClient = client ? false : true;
        if (!client) {
            client = await this.pool.connect();
        }

        try {
            const role = await getTableRecord(client, "roles", roleId);
            if (!role) {
                throw new ServerError(
                    "Cannot locate role record by ID: " + roleId,
                    404
                );
            }
            const userRolesResult = await client.query(
                ...sqls`SELECT 1 FROM user_roles WHERE role_id = ${roleId} LIMIT 1`.toQuery()
            );
            if (userRolesResult?.rows?.length) {
                throw new ServerError(
                    "Please remove the role from all users and try again",
                    400
                );
            }

            try {
                await client.query("BEGIN");

                await client.query(
                    ...sqls`DELETE FROM user_roles WHERE role_id = ${roleId}`.toQuery()
                );
                // delete all permission / operation relationship that not belong to other roles
                await client.query(
                    ...sqls`DELETE FROM permission_operations WHERE permission_id IN (
                            SELECT rp1.permission_id FROM role_permissions rp1 
                            WHERE rp1.permission_id IN (
                                SELECT rp2.permission_id FROM role_permissions rp2 WHERE rp2.role_id = ${roleId}
                            ) AND NOT EXISTS (
                                SELECT 1 FROM role_permissions rp3 WHERE rp1.permission_id = rp3.permission_id AND rp3.role_id != ${roleId}
                            )
                        )`.toQuery()
                );

                // delete all permissions that not belong to other roles
                await client.query(
                    ...sqls`DELETE FROM permissions WHERE id IN (
                            SELECT rp1.permission_id FROM role_permissions rp1 
                            WHERE rp1.permission_id IN (
                                SELECT rp2.permission_id FROM role_permissions rp2 WHERE rp2.role_id = ${roleId}
                            ) AND NOT EXISTS (
                                SELECT 1 FROM role_permissions rp3 WHERE rp1.permission_id = rp3.permission_id AND rp3.role_id != ${roleId}
                            )
                        )`.toQuery()
                );

                await client.query(
                    ...sqls`DELETE FROM roles WHERE id = ${roleId}`.toQuery()
                );

                await client.query("COMMIT");
            } catch (e) {
                await client.query("ROLLBACK");
                throw e;
            }
        } finally {
            if (shouldReleaseClient) {
                client.release();
            }
        }
    }

    async getResourceByUri(
        uri: string,
        client: pg.Client | pg.PoolClient = null
    ) {
        if (!uri) {
            throw new ServerError("uri cannot be empty!", 400);
        }
        const result = await (client ? client : this.pool).query(
            ...sqls`SELECT * FROM resources WHERE uri = ${uri} LIMIT 1`.toQuery()
        );
        if (!result?.rows?.length) {
            return null;
        }
        return result.rows[0] as ResourceRecord;
    }

    async getOperationByUri(
        uri: string,
        client: pg.Client | pg.PoolClient = null
    ) {
        if (!uri) {
            throw new ServerError("uri cannot be empty!", 400);
        }
        const result = await (client ? client : this.pool).query(
            ...sqls`SELECT * FROM operations WHERE uri = ${uri} LIMIT 1`.toQuery()
        );
        if (!result?.rows?.length) {
            return null;
        }
        return result.rows[0] as OperationRecord;
    }

    async createPermission(
        options: CreatePermissionOptions,
        client: pg.PoolClient = null
    ) {
        const shouldReleaseClient = client ? false : true;
        if (!client) {
            client = await this.pool.connect();
        }

        try {
            if (options?.resourceId && options?.resourceUri) {
                throw new ServerError(
                    "`resourceId` & `resourceUri` parameter cannot be both supplied.",
                    400
                );
            }
            if (!options?.resourceId && !options?.resourceUri) {
                throw new ServerError(
                    "Either `resourceId` or `resourceUri` parameter has to be supplied.",
                    400
                );
            }
            if (
                isArray(options?.operationIds) &&
                isArray(options?.operationUris)
            ) {
                throw new ServerError(
                    "`operationIds` & `operationUris` parameter cannot be both supplied.",
                    400
                );
            }
            if (
                !isArray(options?.operationIds) &&
                !isArray(options?.operationUris)
            ) {
                throw new ServerError(
                    "Either `operationIds` or `operationUris` has be valid array.",
                    400
                );
            }
            let {
                name,
                description,
                userOwnershipConstraint,
                orgUnitOwnershipConstraint,
                preAuthorisedConstraint,
                allowExemption,
                resourceId,
                operationIds,
                ownerId,
                createBy
            } = options;

            if (!name || typeof name !== "string") {
                throw new ServerError(
                    "`name` field must be a non-empty string.",
                    400
                );
            }

            if (ownerId && !isUuid(ownerId)) {
                throw new ServerError(
                    "`ownerId` field must be a valid uuid.",
                    400
                );
            }

            if (createBy && !isUuid(createBy)) {
                throw new ServerError(
                    "`createBy` field must be a valid uuid.",
                    400
                );
            }

            description = description ? "" + description : "";
            userOwnershipConstraint = getBoolValWithDefault(
                userOwnershipConstraint
            );
            orgUnitOwnershipConstraint = getBoolValWithDefault(
                orgUnitOwnershipConstraint
            );
            preAuthorisedConstraint = getBoolValWithDefault(
                preAuthorisedConstraint
            );
            allowExemption = getBoolValWithDefault(allowExemption);

            let resource: ResourceRecord;
            if (options?.resourceUri) {
                resource = await this.getResourceByUri(
                    options.resourceUri,
                    client
                );
                if (!resource) {
                    throw new ServerError(
                        `resource uri ${options.resourceUri} doesn't exist`,
                        400
                    );
                }
                resourceId = resource.id;
            } else {
                resource = await getTableRecord(
                    client,
                    "resources",
                    resourceId
                );
                if (!resource) {
                    throw new ServerError(
                        `cannot locate resource with id: ${options.resourceId}`,
                        400
                    );
                }
            }

            if (isArray(options?.operationUris)) {
                // operationUris is supplied
                // validate operationUris
                let operationUris = options.operationUris;
                operationUris = operationUris
                    .filter((item) => !!item)
                    .map((item) => `${item}`.trim())
                    .filter((item) => !!item);
                if (!operationUris.length) {
                    throw new ServerError(
                        "Supplied `operationUris` doesn't contain any valid items",
                        400
                    );
                }
                operationUris = uniq(operationUris);
                const result = await client.query(
                    ...sqls`SELECT id
                FROM operations 
                WHERE uri IN (${SQLSyntax.csv(
                    ...operationUris.map((item) => sqls`${item}`)
                )}) AND resource_id = ${resourceId}`.toQuery()
                );

                if (result?.rows?.length !== operationUris.length) {
                    throw new ServerError(
                        `Not all provided operation uris are valid and belong to the resource ${resource.uri}`,
                        400
                    );
                }
                operationIds = result.rows.map((item) => item.id);
            } else {
                // operationIds is supplied
                // validate operationIds
                const invalidOperationId = operationIds.find(
                    (item) => !isUuid(item)
                );
                if (typeof invalidOperationId !== "undefined") {
                    throw new ServerError(
                        `One of the provided operation id is not valid UUID: ${invalidOperationId}`,
                        400
                    );
                }
                if (!operationIds?.length) {
                    throw new ServerError(
                        "Supplied `operationIds` must not be empty array",
                        400
                    );
                }

                const result = await client.query(
                    ...sqls`SELECT COUNT(*) as count
            FROM operations 
            WHERE id IN (${SQLSyntax.csv(
                ...operationIds.map((item) => sqls`${item}`)
            )}) AND resource_id = ${resource.id}`.toQuery()
                );

                if (result?.rows?.[0]?.["count"] !== operationIds?.length) {
                    throw new Error(
                        `Not all provided operation ids are valid and belong to the resource ${resource.uri}`
                    );
                }
                operationIds = uniq(operationIds);
            }

            const permissionData = {
                name,
                description,
                resource_id: resourceId,
                user_ownership_constraint: userOwnershipConstraint,
                org_unit_ownership_constraint: orgUnitOwnershipConstraint,
                pre_authorised_constraint: preAuthorisedConstraint,
                allow_exemption: allowExemption
            } as any;

            if (ownerId) {
                permissionData["owner_id"] = ownerId;
            }

            if (createBy) {
                permissionData["create_by"] = createBy;
                permissionData["edit_by"] = createBy;
            }

            try {
                await client.query("BEGIN");
                const permission = await createTableRecord(
                    client,
                    "permissions",
                    permissionData,
                    [
                        "name",
                        "resource_id",
                        "user_ownership_constraint",
                        "org_unit_ownership_constraint",
                        "pre_authorised_constraint",
                        "allow_exemption",
                        "description",
                        "create_by",
                        "owner_id",
                        "edit_by"
                    ]
                );

                const values = (operationIds as string[]).map(
                    (id) => sqls`(${permission.id},${id})`
                );

                await client.query(
                    ...sqls`INSERT INTO permission_operations 
            (permission_id, operation_id) VALUES 
            ${SQLSyntax.csv(...values)}`.toQuery()
                );
                await client.query("COMMIT");
                return permission;
            } catch (e) {
                await client.query("ROLLBACK");
                throw e;
            }
        } finally {
            if (shouldReleaseClient) {
                client.release();
            }
        }
    }

    async updatePermission(
        id: string,
        options: UpdatePermissionOptions,
        client: pg.PoolClient = null
    ) {
        if (isEmpty(options)) {
            throw new ServerError("Empty update options are supplied.");
        }

        if (!isUuid(id)) {
            throw new ServerError("id must be a valid UUID", 400);
        }

        const shouldReleaseClient = client ? false : true;
        if (!client) {
            client = await this.pool.connect();
        }

        try {
            const permission = await getTableRecord(client, "permissions", id);
            if (!permission) {
                throw new ServerError(
                    `cannot locate permission with id: ${id}`,
                    400
                );
            }

            let {
                name,
                description,
                userOwnershipConstraint,
                orgUnitOwnershipConstraint,
                preAuthorisedConstraint,
                allowExemption,
                resourceId,
                resourceUri,
                operationIds,
                operationUris,
                ownerId,
                editBy
            } = options;

            let resource: ResourceRecord;
            if (resourceUri) {
                resource = await this.getResourceByUri(resourceUri, client);
                if (!resource) {
                    throw new ServerError(
                        `resource uri ${resourceUri} doesn't exist`,
                        400
                    );
                }
                resourceId = resource.id;
            } else if (resourceId) {
                if (!isUuid(resourceId)) {
                    throw new ServerError(
                        `supplied resourceId ${resourceId} is not valid UUID`,
                        400
                    );
                }
                resource = await getTableRecord(
                    client,
                    "resources",
                    resourceId
                );
                if (!resource) {
                    throw new ServerError(
                        `cannot locate resource with id: ${resourceId}`,
                        400
                    );
                }
            } else {
                resourceId = permission.resource_id;
                resource = await getTableRecord(
                    client,
                    "resources",
                    resourceId
                );
                if (!resource) {
                    throw new ServerError(
                        `cannot locate resource with id: ${resourceId}`,
                        500
                    );
                }
            }

            if (isArray(operationUris)) {
                if (!operationUris.length) {
                    operationIds = [];
                } else {
                    operationUris = operationUris
                        .filter((item) => !!item)
                        .map((item) => `${item}`.trim())
                        .filter((item) => !!item);
                    if (!operationUris.length) {
                        throw new ServerError(
                            "Supplied `operationUris` contains invalid items",
                            400
                        );
                    }
                    operationUris = uniq(operationUris);
                    const result = await client.query(
                        ...sqls`SELECT id
                FROM operations 
                WHERE uri IN (${SQLSyntax.csv(
                    ...operationUris.map((item) => sqls`${item}`)
                )}) AND resource_id = ${resourceId}`.toQuery()
                    );

                    if (result?.rows?.length !== operationUris.length) {
                        throw new ServerError(
                            `Not all provided operation uris are valid and belong to the resource ${resource.uri}`,
                            400
                        );
                    }
                    operationIds = result.rows.map((item) => item.id);
                }
            } else if (isArray(operationIds) && operationIds.length) {
                const invalidOperationId = operationIds.find(
                    (item) => !isUuid(item)
                );
                if (typeof invalidOperationId !== "undefined") {
                    throw new ServerError(
                        `One of the provided operation id is not valid UUID: ${invalidOperationId}`,
                        400
                    );
                }

                const result = await client.query(
                    ...sqls`SELECT COUNT(*) as count
            FROM operations 
            WHERE id IN (${SQLSyntax.csv(
                ...operationIds.map((item) => sqls`${item}`)
            )}) AND resource_id = ${resourceId}`.toQuery()
                );

                if (result?.rows?.[0]?.["count"] !== operationIds.length) {
                    throw new Error(
                        `Not all provided operation ids are valid and belong to the resource ${resource.uri}`
                    );
                }
                operationIds = uniq(operationIds);
            }

            const permissionData = {
                resource_id: resourceId
            } as any;

            if (name) {
                name = `${name}`.trim();
                if (!name) {
                    throw new ServerError("`name` cannot be empty", 400);
                }
                permissionData["name"] = name;
            }

            if (description) {
                description = `${description}`.trim();
                permissionData["description"] = description;
            }

            if (typeof userOwnershipConstraint === "boolean") {
                permissionData[
                    "user_ownership_constraint"
                ] = userOwnershipConstraint;
            }

            if (typeof orgUnitOwnershipConstraint === "boolean") {
                permissionData[
                    "org_unit_ownership_constraint"
                ] = orgUnitOwnershipConstraint;
            }

            if (typeof preAuthorisedConstraint === "boolean") {
                permissionData[
                    "pre_authorised_constraint"
                ] = preAuthorisedConstraint;
            }

            if (typeof allowExemption === "boolean") {
                permissionData["allow_exemption"] = allowExemption;
            }

            if (ownerId === null || isUuid(ownerId)) {
                permissionData["owner_id"] = ownerId;
            } else if (ownerId && !isUuid(ownerId)) {
                throw new ServerError("`ownerId` must be valid UUID", 400);
            }

            if (editBy === null || isUuid(editBy)) {
                permissionData["edit_by"] = editBy;
            } else if (editBy && !isUuid(editBy)) {
                throw new ServerError("`editBy` must be valid UUID", 400);
            }

            try {
                await client.query("BEGIN");

                const permissionUpdateData = {
                    ...permissionData,
                    edit_time: sqls` CURRENT_TIMESTAMP `
                };

                const permissionRecord = await updateTableRecord(
                    client,
                    "permissions",
                    id,
                    permissionUpdateData,
                    [
                        "name",
                        "resource_id",
                        "user_ownership_constraint",
                        "org_unit_ownership_constraint",
                        "pre_authorised_constraint",
                        "allow_exemption",
                        "description",
                        "owner_id",
                        "edit_by",
                        "edit_time"
                    ]
                );

                if (isArray(operationIds)) {
                    // operationIds property is provided
                    // i.e. user's intention is to update operations as well
                    // delete all current operation / permission relationship
                    await client.query(
                        ...sqls`DELETE FROM permission_operations WHERE permission_id=${id}`.toQuery()
                    );
                }

                if (operationIds?.length) {
                    const values = (operationIds as string[]).map(
                        (item) => sqls`(${id},${item})`
                    );

                    await client.query(
                        ...sqls`INSERT INTO permission_operations 
                    (permission_id, operation_id) VALUES 
                    ${SQLSyntax.csv(...values)}`.toQuery()
                    );
                }

                await client.query("COMMIT");
                return permissionRecord;
            } catch (e) {
                await client.query("ROLLBACK");
                throw e;
            }
        } finally {
            if (shouldReleaseClient) {
                client.release();
            }
        }
    }
}
