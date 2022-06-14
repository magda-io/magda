import {} from "mocha";
import { expect } from "chai";
import ServiceRunner from "../ServiceRunner";
import { v4 as uuidV4 } from "uuid";
import AuthApiClient from "magda-typescript-common/src/authorization-api/ApiClient";
import { DEFAULT_ADMIN_USER_ID } from "magda-typescript-common/src/authorization-api/constants";

const ENV_SETUP_TIME_OUT = 600000; // -- 10 mins
const jwtSecret = uuidV4();
const authApiClient = new AuthApiClient(
    "http://localhost:6104/v0",
    jwtSecret,
    DEFAULT_ADMIN_USER_ID
);

describe("Permission related API integration tests", () => {
    describe("Test {post} /v0/auth/roles/:roleId/permissions/:permissionId Assign a permission to a role", function () {
        const serviceRunner = new ServiceRunner();
        serviceRunner.enableAuthService = true;
        serviceRunner.enableRegistryApi = false;
        serviceRunner.jwtSecret = jwtSecret;
        serviceRunner.authApiDebugMode = false;

        before(async function (this) {
            this.timeout(ENV_SETUP_TIME_OUT);
            await serviceRunner.create();
        });

        after(async function (this) {
            this.timeout(ENV_SETUP_TIME_OUT);
            await serviceRunner.destroy();
        });

        it("should add the permission to role correctly ", async () => {
            const testRole = await authApiClient.createRole(
                "test role",
                "test role description"
            );
            const operation = await authApiClient.getOperationByUri(
                "object/record/read"
            );
            const permission = await authApiClient.createPermission({
                name: "test permission",
                description: "test permission",
                operationIds: [operation.id],
                resource_id: operation.resource_id,
                user_ownership_constraint: false,
                org_unit_ownership_constraint: false,
                pre_authorised_constraint: false
            });

            const res = await fetch(
                `http://localhost:6104/v0/public/roles/${testRole.id}/permissions/${permission.id}`,
                authApiClient.getMergeRequestInitOption({ method: "post" })
            );

            expect(res.ok).to.be.true;
            const data = await res.json();
            expect(data.result).to.be.true;

            const permissions = await authApiClient.getRolePermissions(
                testRole.id
            );
            expect(permissions.length).to.equal(1);
            expect(permissions[0].id).to.equal(permission.id);
        });

        it("should response result=false when try to add existing permission to the same role ", async () => {
            const testRole = await authApiClient.createRole(
                "test role 1",
                "test role description 1"
            );
            const operation = await authApiClient.getOperationByUri(
                "object/record/read"
            );
            const permission = await authApiClient.createPermission({
                name: "test permission",
                description: "test permission",
                operationIds: [operation.id],
                resource_id: operation.resource_id,
                user_ownership_constraint: false,
                org_unit_ownership_constraint: false,
                pre_authorised_constraint: false
            });

            let res = await fetch(
                `http://localhost:6104/v0/public/roles/${testRole.id}/permissions/${permission.id}`,
                authApiClient.getMergeRequestInitOption({ method: "post" })
            );

            expect(res.ok).to.be.true;
            let data = await res.json();
            expect(data.result).to.be.true;

            let permissions = await authApiClient.getRolePermissions(
                testRole.id
            );
            expect(permissions.length).to.equal(1);
            expect(permissions[0].id).to.equal(permission.id);

            res = await fetch(
                `http://localhost:6104/v0/public/roles/${testRole.id}/permissions/${permission.id}`,
                authApiClient.getMergeRequestInitOption({ method: "post" })
            );

            expect(res.ok).to.be.true;
            data = await res.json();
            expect(data.result).to.be.false;

            permissions = await authApiClient.getRolePermissions(testRole.id);
            expect(permissions.length).to.equal(1);
            expect(permissions[0].id).to.equal(permission.id);
        });
    });

    describe("Test {delete} /v0/auth/roles/:roleId/permissions/:permissionId Remove a permission from a role", function () {
        const serviceRunner = new ServiceRunner();
        serviceRunner.enableAuthService = true;
        serviceRunner.enableRegistryApi = false;
        serviceRunner.jwtSecret = jwtSecret;
        serviceRunner.authApiDebugMode = false;

        before(async function (this) {
            this.timeout(ENV_SETUP_TIME_OUT);
            await serviceRunner.create();
        });

        after(async function (this) {
            this.timeout(ENV_SETUP_TIME_OUT);
            await serviceRunner.destroy();
        });

        it("should delete the permission record as well when it's not assigned to other roles by default", async () => {
            const testRole = await authApiClient.createRole(
                "test role",
                "test role description"
            );
            const operation = await authApiClient.getOperationByUri(
                "object/record/read"
            );
            const permission = await authApiClient.createPermission({
                name: "test permission",
                description: "test permission",
                operationIds: [operation.id],
                resource_id: operation.resource_id,
                user_ownership_constraint: false,
                org_unit_ownership_constraint: false,
                pre_authorised_constraint: false
            });

            let res = await fetch(
                `http://localhost:6104/v0/public/roles/${testRole.id}/permissions/${permission.id}`,
                authApiClient.getMergeRequestInitOption({ method: "post" })
            );

            expect(res.ok).to.be.true;
            const data = await res.json();
            expect(data.result).to.be.true;

            // check permission record
            res = await fetch(
                `http://localhost:6104/v0/public/permissions/${permission.id}`,
                authApiClient.getMergeRequestInitOption({ method: "get" })
            );
            // permission record should exist
            expect(res.ok).to.be.true;
            expect((await res.json()).id).to.equal(permission.id);

            res = await fetch(
                `http://localhost:6104/v0/public/roles/${testRole.id}/permissions/${permission.id}`,
                authApiClient.getMergeRequestInitOption({ method: "delete" })
            );

            expect(res.ok).to.be.true;
            expect((await res.json()).result).to.be.true;

            // check permission record again
            res = await fetch(
                `http://localhost:6104/v0/public/permissions/${permission.id}`,
                authApiClient.getMergeRequestInitOption({ method: "get" })
            );
            // permission record should not exist
            expect(res.status).to.equal(404);
        });

        it("should not delete the permission record when it's assigned to another roles by default", async () => {
            const testRole = await authApiClient.createRole(
                "test role",
                "test role description"
            );

            const testRole2 = await authApiClient.createRole(
                "test role2",
                "test role2 description"
            );

            const operation = await authApiClient.getOperationByUri(
                "object/record/read"
            );

            const permission = await authApiClient.createPermission({
                name: "test permission",
                description: "test permission",
                operationIds: [operation.id],
                resource_id: operation.resource_id,
                user_ownership_constraint: false,
                org_unit_ownership_constraint: false,
                pre_authorised_constraint: false
            });

            // assign to test role
            let res = await fetch(
                `http://localhost:6104/v0/public/roles/${testRole.id}/permissions/${permission.id}`,
                authApiClient.getMergeRequestInitOption({ method: "post" })
            );

            expect(res.ok).to.be.true;
            expect((await res.json()).result).to.be.true;

            // assign to test role 2
            res = await fetch(
                `http://localhost:6104/v0/public/roles/${testRole2.id}/permissions/${permission.id}`,
                authApiClient.getMergeRequestInitOption({ method: "post" })
            );
            expect(res.ok).to.be.true;
            expect((await res.json()).result).to.be.true;

            // check permission record
            res = await fetch(
                `http://localhost:6104/v0/public/permissions/${permission.id}`,
                authApiClient.getMergeRequestInitOption({ method: "get" })
            );
            // permission record should exist
            expect(res.ok).to.be.true;
            expect((await res.json()).id).to.equal(permission.id);

            res = await fetch(
                `http://localhost:6104/v0/public/roles/${testRole.id}/permissions/${permission.id}`,
                authApiClient.getMergeRequestInitOption({ method: "delete" })
            );

            expect(res.ok).to.be.true;
            expect((await res.json()).result).to.be.true;

            // check permission record again
            res = await fetch(
                `http://localhost:6104/v0/public/permissions/${permission.id}`,
                authApiClient.getMergeRequestInitOption({ method: "get" })
            );
            // permission record should exist
            expect(res.ok).to.be.true;
            expect((await res.json()).id).to.equal(permission.id);

            // permission still assigned to test role 2
            let permissions = await authApiClient.getRolePermissions(
                testRole2.id
            );
            expect(permissions.length).to.equal(1);
            expect(permissions[0].id).to.equal(permission.id);
        });

        it("should not delete the permission record when it's not assigned to other roles but deletePermission = false", async () => {
            const testRole = await authApiClient.createRole(
                "test role",
                "test role description"
            );
            const operation = await authApiClient.getOperationByUri(
                "object/record/read"
            );
            const permission = await authApiClient.createPermission({
                name: "test permission",
                description: "test permission",
                operationIds: [operation.id],
                resource_id: operation.resource_id,
                user_ownership_constraint: false,
                org_unit_ownership_constraint: false,
                pre_authorised_constraint: false
            });

            let res = await fetch(
                `http://localhost:6104/v0/public/roles/${testRole.id}/permissions/${permission.id}`,
                authApiClient.getMergeRequestInitOption({ method: "post" })
            );

            expect(res.ok).to.be.true;
            expect((await res.json()).result).to.be.true;

            // check permission record
            res = await fetch(
                `http://localhost:6104/v0/public/permissions/${permission.id}`,
                authApiClient.getMergeRequestInitOption({ method: "get" })
            );
            // permission record should exist
            expect(res.ok).to.be.true;
            expect((await res.json()).id).to.equal(permission.id);

            res = await fetch(
                `http://localhost:6104/v0/public/roles/${testRole.id}/permissions/${permission.id}?deletePermission=false`,
                authApiClient.getMergeRequestInitOption({ method: "delete" })
            );

            expect(res.ok).to.be.true;
            expect((await res.json()).result).to.be.true;

            // check permission record again
            res = await fetch(
                `http://localhost:6104/v0/public/permissions/${permission.id}`,
                authApiClient.getMergeRequestInitOption({ method: "get" })
            );
            // permission record should still exist (as deletePermission=false)
            expect(res.ok).to.be.true;
            expect((await res.json()).id).to.equal(permission.id);
        });
    });

    describe("Test other permission APIs", function () {
        const serviceRunner = new ServiceRunner();
        serviceRunner.enableAuthService = true;
        serviceRunner.enableRegistryApi = false;
        serviceRunner.jwtSecret = jwtSecret;
        serviceRunner.authApiDebugMode = false;

        before(async function (this) {
            this.timeout(ENV_SETUP_TIME_OUT);
            await serviceRunner.create();
        });

        after(async function (this) {
            this.timeout(ENV_SETUP_TIME_OUT);
            await serviceRunner.destroy();
        });

        it("should {post} /v0/auth/roles/:roleId/permissions create a permission and add to a role correctly", async () => {
            const testRole = await authApiClient.createRole(
                "test role",
                "test role description"
            );
            const operation = await authApiClient.getOperationByUri(
                "object/record/read"
            );

            let res = await fetch(
                `http://localhost:6104/v0/public/roles/${testRole.id}/permissions`,
                authApiClient.getMergeRequestInitOption({
                    method: "post",
                    body: JSON.stringify({
                        name: "test permission",
                        description: "test permission",
                        operationIds: [operation.id],
                        resource_id: operation.resource_id,
                        user_ownership_constraint: false,
                        org_unit_ownership_constraint: false,
                        pre_authorised_constraint: false
                    })
                })
            );

            expect(res.ok).to.be.true;
            const permission = await res.json();
            expect(permission.name).to.equal("test permission");

            // check permission record
            res = await fetch(
                `http://localhost:6104/v0/public/roles/${testRole.id}/permissions?id=${permission.id}`,
                authApiClient.getMergeRequestInitOption({ method: "get" })
            );
            // permission record should exist
            expect(res.ok).to.be.true;
            expect((await res.json())[0].id).to.equal(permission.id);
        });

        it("should {put} /v0/auth/permissions/:permissionId update a permission correctly", async () => {
            const operation = await authApiClient.getOperationByUri(
                "object/record/read"
            );

            const operation2 = await authApiClient.getOperationByUri(
                "object/record/create"
            );

            const permission = await authApiClient.createPermission({
                name: "test permission",
                description: "test permission",
                operationIds: [operation.id],
                resource_id: operation.resource_id,
                user_ownership_constraint: false,
                org_unit_ownership_constraint: false,
                pre_authorised_constraint: false
            });

            // check permission record
            let res = await fetch(
                `http://localhost:6104/v0/public/permissions/${permission.id}`,
                authApiClient.getMergeRequestInitOption({ method: "get" })
            );
            // permission record should exist
            expect(res.ok).to.be.true;
            let permissionData = await res.json();
            expect(permissionData).to.deep.include({
                ...permission,
                operations: [operation]
            });

            res = await fetch(
                `http://localhost:6104/v0/public/permissions/${permission.id}`,
                authApiClient.getMergeRequestInitOption({
                    method: "put",
                    body: JSON.stringify({
                        name: "test permission2",
                        description: "test permission",
                        operationIds: [operation.id, operation2.id],
                        pre_authorised_constraint: true
                    })
                })
            );
            expect(res.ok).to.be.true;

            // check permission record
            res = await fetch(
                `http://localhost:6104/v0/public/permissions/${permission.id}`,
                authApiClient.getMergeRequestInitOption({ method: "get" })
            );
            // permission record should exist
            expect(res.ok).to.be.true;
            permissionData = await res.json();
            expect(permissionData).to.deep.include({
                ...permission,
                operations: [operation2, operation],
                name: "test permission2",
                pre_authorised_constraint: true,
                edit_time: permissionData.edit_time
            });

            res = await fetch(
                `http://localhost:6104/v0/public/permissions/${permission.id}`,
                authApiClient.getMergeRequestInitOption({
                    method: "put",
                    body: JSON.stringify({
                        name: "test permission3",
                        description: "test permission",
                        operationIds: [operation2.id],
                        pre_authorised_constraint: true,
                        user_ownership_constraint: true
                    })
                })
            );
            expect(res.ok).to.be.true;

            // check permission record
            res = await fetch(
                `http://localhost:6104/v0/public/permissions/${permission.id}`,
                authApiClient.getMergeRequestInitOption({ method: "get" })
            );
            // permission record should exist
            expect(res.ok).to.be.true;
            permissionData = await res.json();
            expect(permissionData).to.deep.include({
                ...permission,
                operations: [operation2],
                name: "test permission3",
                pre_authorised_constraint: true,
                user_ownership_constraint: true,
                edit_time: permissionData.edit_time
            });
        });
    });
});
