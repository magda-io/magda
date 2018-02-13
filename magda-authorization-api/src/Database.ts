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
}
