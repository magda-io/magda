import createPool from "./createPool";
import {
    User,
    Role,
    Permission
} from "@magda/typescript-common/dist/authorization-api/model";
import { Maybe } from "tsmonad";
import arrayToMaybe from "@magda/typescript-common/dist/util/arrayToMaybe";
import * as pg from "pg";
import * as _ from "lodash";

export interface DatabaseOptions {
    dbHost: string;
    dbPort: number;
}

export default class Database {
    private pool: pg.Pool;

    constructor(options: DatabaseOptions) {
        this.pool = createPool(options);
    }

    getUser(id: string): Promise<Maybe<User>> {
        return this.pool
            .query(
                'SELECT id, "displayName", email, "photoURL", source, "isAdmin" FROM users WHERE "id" = $1',
                [id]
            )
            .then(res => arrayToMaybe(res.rows));
    }

    async getUserRoles(id: string): Promise<Role[]> {
        const result = await this.pool.query(
            `SELECT r.id, r.name, rp.permission_id
                FROM user_roles AS ur
                LEFT JOIN roles r ON r.id = ur.role_id
                LEFT JOIN role_permissions rp ON rp.role_id = ur.role_id
                WHERE ur.user_id = $1`,
            [id]
        );
        const list: any = {};
        result.rows.forEach(item => {
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

    async getUserPermissions(id: string): Promise<Permission[]> {
        const result = await this.pool.query(
            `SELECT p.id, p.name, p.resource_id, res.uri AS resource_uri, 
                p.user_ownership_constraint,
                p.org_unit_ownership_constraint,
                p.pre_authorised_constraint,
                op.id AS operation_id,
                op.name AS operation_name
                FROM role_permissions rp
                LEFT JOIN user_roles ur ON ur.role_id = rp.role_id
                LEFT JOIN permission_operations po ON po.permission_id = rp.permission_id
                LEFT JOIN operations op ON op.id = po.operation_id
                LEFT JOIN permissions p ON p.id = rp.permission_id
                LEFT JOIN resources res ON res.id = p.resource_id
                WHERE ur.user_id = $1`,
            [id]
        );
        return this.convertPermissionOperationRowsToPermissions(result);
    }

    private convertPermissionOperationRowsToPermissions(
        result: pg.QueryResult
    ): Permission[] {
        const list: any = {};
        result.rows.forEach(item => {
            const {
                operationId,
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
                    name: operationName
                });
            }
        });
        return Object.values(list);
    }

    async getRolePermissions(id: string): Promise<Permission[]> {
        const result = await this.pool.query(
            `SELECT p.id, p.name, p.resource_id, res.uri AS resource_uri,
            p.user_ownership_constraint,
            p.org_unit_ownership_constraint,
            p.pre_authorised_constraint,
            op.id AS operation_id,
            op.name AS operation_name
            FROM role_permissions rp 
            LEFT JOIN permission_operations po ON po.permission_id = rp.permission_id
            LEFT JOIN operations op ON op.id = po.operation_id
            LEFT JOIN permissions p ON p.id = rp.permission_id
            LEFT JOIN resources res ON res.id = p.resource_id
            WHERE rp.role_id = $1`,
            [id]
        );
        return this.convertPermissionOperationRowsToPermissions(result);
    }

    getUsers(): Promise<User[]> {
        return this.pool
            .query(
                `SELECT id, "displayName", email, "photoURL", source, "isAdmin" FROM users WHERE id <> '00000000-0000-4000-8000-000000000000'`
            )
            .then(res => res.rows);
    }

    async updateUser(userId: string, update: any): Promise<void> {
        await this.pool.query(`UPDATE users SET "isAdmin" = $1 WHERE id = $2`, [
            update.isAdmin || false,
            userId
        ]);
    }

    getUserByExternalDetails(
        source: string,
        sourceId: string
    ): Promise<Maybe<User>> {
        return this.pool
            .query(
                'SELECT id, "displayName", email, "photoURL", source, "sourceId", "isAdmin" FROM users WHERE "sourceId" = $1 AND source = $2',
                [sourceId, source]
            )
            .then(res => arrayToMaybe(res.rows));
    }

    createUser(user: User): Promise<User> {
        return this.pool
            .query(
                'INSERT INTO users(id, "displayName", email, "photoURL", source, "sourceId", "isAdmin") VALUES(uuid_generate_v4(), $1, $2, $3, $4, $5, $6) RETURNING id',
                [
                    user.displayName,
                    user.email,
                    user.photoURL,
                    user.source,
                    user.sourceId,
                    user.isAdmin
                ]
            )
            .then(result => result.rows[0]);
    }

    async check(): Promise<any> {
        await this.pool.query("SELECT id FROM users LIMIT 1");
        return {
            ready: true
        };
    }
}
