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
});
