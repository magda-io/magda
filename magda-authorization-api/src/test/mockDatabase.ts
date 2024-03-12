import mockUserDataStore from "magda-typescript-common/src/test/mockUserDataStore.js";
import {
    User,
    Role,
    Permission,
    APIKeyRecord
} from "magda-typescript-common/src/authorization-api/model.js";
import { Maybe } from "@magda/tsmonad";
import sinon from "sinon";
import arrayToMaybe from "magda-typescript-common/src/util/arrayToMaybe.js";
import Database from "../Database.js";
import NestedSetModelQueryer, { NodeRecord } from "../NestedSetModelQueryer.js";
import pg from "pg";
import mockApiKeyStore from "./mockApiKeyStore.js";
import { defaultAnonymousUserInfo } from "../Database.js";

export default class MockDatabase {
    getUser(id: string): Promise<Maybe<User>> {
        return new Promise(function (resolve, reject) {
            resolve(
                arrayToMaybe(
                    mockUserDataStore.getRecordByUserId(id).map(
                        (item) =>
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
        return new Promise(function (resolve, reject) {
            resolve(
                arrayToMaybe(
                    mockUserDataStore
                        .getRecordBySourceAndSourceId(source, sourceId)
                        .map((item) => ({
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
        return new Promise(function (resolve, reject) {
            resolve(mockUserDataStore.createRecord(user));
        });
    }

    check() {}

    async getDefaultAnonymousUserInfo(): Promise<User> {
        const user: User = { ...defaultAnonymousUserInfo };
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
        const db = sinon.createStubInstance(Database);
        db.getUserPermissions.callsFake(this.getUserPermissions);
        db.getRolePermissions.callsFake(this.getRolePermissions);
        db.getUserRoles.callsFake(this.getUserRoles);
        db.getUser.callsFake(this.getUser);
        db.getCurrentUserInfo.callThrough();
        db.getDefaultAnonymousUserInfo.callsFake(
            this.getDefaultAnonymousUserInfo
        );
        return await db.getCurrentUserInfo(req, jwtSecret);
    }

    getOrgQueryer() {
        const orgQueryer: NestedSetModelQueryer = {
            getNodeById: async (
                id: string,
                fields: string[] = null,
                client: pg.PoolClient = null
            ): Promise<Maybe<NodeRecord>> => {
                return Promise.resolve(Maybe.nothing());
            },
            getAllChildren: (
                parentNodeId: string,
                includeMyself: boolean = false,
                fields: string[] = null,
                client: pg.Client = null
            ): Promise<NodeRecord[]> => {
                return Promise.resolve([]);
            }
        } as NestedSetModelQueryer;
        return orgQueryer;
    }

    async getUserApiKeyById(apiKeyId: string): Promise<APIKeyRecord> {
        return mockApiKeyStore.getRecordById(apiKeyId);
    }

    async updateApiKeyAttempt(apiKeyId: string, isSuccessfulAttempt: Boolean) {
        return mockApiKeyStore.updateApiKeyAttempt(
            apiKeyId,
            isSuccessfulAttempt
        );
    }

    updateApiKeyAttemptNonBlocking(
        apiKeyId: string,
        isSuccessfulAttempt: Boolean
    ) {
        this.updateApiKeyAttempt(apiKeyId, isSuccessfulAttempt).catch((e) =>
            console.error("failed to update api key timestamp: " + e)
        );
    }
}
