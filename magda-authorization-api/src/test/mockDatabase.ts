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
import pg, { Pool } from "pg";
import mockApiKeyStore from "./mockApiKeyStore.js";
import { defaultAnonymousUserInfo } from "../Database.js";

const defaultPool = {
    query: async (query: string, params: any[]) => {
        return {
            rows: [] as any[]
        };
    }
} as Pool;

export default class MockDatabase {
    mockPool = defaultPool;
    systemApiKeys: APIKeyRecord[] = [];

    async getSystemManagedUserApiKeys(userId: string, name: string) {
        return this.systemApiKeys.filter(
            (key) => key.user_id === userId && key.name === name
        );
    }

    async createUserApiKey(
        userId: string,
        expiryTime?: Date,
        options: { name?: string; systemManaged?: boolean } = {}
    ) {
        const id = `00000000-0000-4000-8000-${String(
            this.systemApiKeys.length + 1
        ).padStart(12, "0")}`;
        this.systemApiKeys.push({
            id,
            user_id: userId,
            created_timestamp: new Date(),
            hash: "hidden",
            enabled: true,
            expiry_time: expiryTime,
            name: options.name,
            system_managed: options.systemManaged
        });
        return { id, key: "test-secret" };
    }

    async updateSystemManagedUserApiKeyExpiry(
        userId: string,
        name: string,
        apiKeyId: string,
        expiryTime: Date
    ) {
        const key = this.systemApiKeys.find(
            (item) =>
                item.user_id === userId &&
                item.name === name &&
                item.id === apiKeyId
        );
        if (!key) throw new Error("System managed API key not found");
        key.expiry_time = expiryTime;
    }

    async deleteSystemManagedUserApiKeys(
        userId: string,
        name: string,
        apiKeyId?: string
    ) {
        const before = this.systemApiKeys.length;
        this.systemApiKeys = this.systemApiKeys.filter(
            (key) =>
                !(
                    key.user_id === userId &&
                    key.name === name &&
                    (!apiKeyId || key.id === apiKeyId)
                )
        );
        return before - this.systemApiKeys.length;
    }

    setDbPool(pool: Pool) {
        this.mockPool = pool;
    }

    resetDbPool() {
        this.mockPool = defaultPool;
    }

    getPool(): Pool {
        return this.mockPool;
    }

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
                                source: item.source
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
                            sourceId: item.sourceId
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

    async deleteUser(userId: string): Promise<void> {
        const users = mockUserDataStore.getRecordByUserId(userId);
        if (users.length === 0) {
            return Promise.resolve();
        }
        mockUserDataStore.deleteUser(userId);
        return Promise.resolve();
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
