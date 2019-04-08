import mockUserDataStore from "@magda/typescript-common/dist/test/mockUserDataStore";
import {
    User,
    Role,
    Permission
} from "@magda/typescript-common/dist/authorization-api/model";
import { Maybe } from "tsmonad";
import * as sinon from "sinon";
import arrayToMaybe from "@magda/typescript-common/dist/util/arrayToMaybe";
import Database from "../Database";

export default class MockDatabase {
    getUser(id: string): Promise<Maybe<User>> {
        return new Promise(function(resolve, reject) {
            resolve(
                arrayToMaybe(
                    mockUserDataStore.getRecordByUserId(id).map(
                        item =>
                            ({
                                id: item.id,
                                email: item.email,
                                displayName: item.displayName,
                                photoURL: item.photoURL,
                                source: item.source,
                                isAdmin: item.isAdmin
                            } as User)
                    )
                )
            );
        });
    }

    getUserByExternalDetails(
        source: string,
        sourceId: string
    ): Promise<Maybe<User>> {
        return new Promise(function(resolve, reject) {
            resolve(
                arrayToMaybe(
                    mockUserDataStore
                        .getRecordBySourceAndSourceId(source, sourceId)
                        .map(item => ({
                            id: item.id,
                            email: item.email,
                            displayName: item.displayName,
                            photoURL: item.photoURL,
                            source: item.source,
                            sourceId: item.sourceId,
                            isAdmin: item.isAdmin
                        }))
                )
            );
        });
    }

    async getUserRoles(id: string): Promise<Role[]> {
        return [];
    }

    async getUserPermissions(id: string): Promise<Permission[]> {
        return [];
    }

    async getRolePermissions(id: string): Promise<Permission[]> {
        return [];
    }

    createUser(user: User): Promise<User> {
        return new Promise(function(resolve, reject) {
            resolve(mockUserDataStore.createRecord(user));
        });
    }

    check() {}

    async getCurrentUserInfo(req: any, jwtSecret: string): Promise<User> {
        const db = sinon.createStubInstance(Database);
        db.getUserPermissions.callsFake(this.getUserPermissions);
        db.getRolePermissions.callsFake(this.getRolePermissions);
        db.getUserRoles.callsFake(this.getUserRoles);
        db.getUser.callsFake(this.getUser);
        db.getCurrentUserInfo.callThrough();
        return await db.getCurrentUserInfo(req, jwtSecret);
    }
}
