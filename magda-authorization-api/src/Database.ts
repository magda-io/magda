import createPool from "./createPool";
import { User } from "@magda/typescript-common/dist/authorization-api/model";
import { Maybe } from "tsmonad";
import arrayToMaybe from "@magda/typescript-common/dist/util/arrayToMaybe";
import * as pg from "pg";

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
