import {} from "mocha";
import { expect } from "chai";
import ServiceRunner from "../ServiceRunner.js";
import partial from "lodash/partial.js";
import { v4 as uuidV4 } from "uuid";
import fetch from "cross-fetch";
import urijs from "urijs";
import AuthApiClient from "magda-typescript-common/src/authorization-api/ApiClient.js";
import {
    DEFAULT_ADMIN_USER_ID,
    DATA_STEWARDS_ROLE_ID
} from "magda-typescript-common/src/authorization-api/constants.js";
import buildJwt from "magda-typescript-common/src/session/buildJwt.js";
import {
    createOrgUnits,
    getOrgUnitIdByName as getOrgUnitIdByNameWithAuthApiClient
} from "./testUtils.js";

/**
 * Services filter objects with partial evaluations of the bundled OPA policies:
 * the decision API translates the residual rules (e.g. into SQL or search queries).
 * A rule that calls a built-in function (e.g. `regex.match`, `startswith`, `sprintf`) on the unknown object's
 * attributes makes the residual rules untranslatable, and the decision API responds 500 for every affected user
 * (see https://github.com/magda-io/magda/issues/3869).
 *
 * This test asks for a partial evaluation of every operation that services partially evaluate, as a user who
 * holds every kind of constrained permission on every resource, so that every constrained rule is reached.
 * When you add a new partial evaluation caller (e.g. `withAuthDecision` / `requireUnconditionalAuthDecision`
 * without the object's data), add its operation below.
 */
const PARTIALLY_EVALUATED_OPERATIONS = [
    // registry
    "object/record/read",
    "object/record/update",
    "object/record/delete",
    "object/aspect/read",
    "object/aspect/delete",
    "object/event/read",
    "object/webhook/read",
    "object/webhook/delete",
    // search API
    "object/dataset/draft/read",
    "object/dataset/published/read",
    "object/dataset/*/read",
    "object/distribution/draft/read",
    "object/distribution/published/read",
    "object/distribution/*/read",
    // indexer
    "api/indexer/reindex/snapshot",
    // authorization API
    "authObject/apiKey/create",
    "authObject/apiKey/read",
    "authObject/operation/read",
    "authObject/orgUnit/read",
    "authObject/permission/read",
    "authObject/resource/read",
    "authObject/role/read",
    "authObject/user/create",
    "authObject/user/read",
    "object/accessGroup/create",
    // content API
    "object/content/read",
    "object/content/update",
    "object/content/delete",
    // admin API (connectors)
    "object/connector/create",
    "object/connector/read",
    "object/connector/update",
    "object/connector/delete",
    // OpenFaaS functions
    "object/faas/function/create",
    "object/faas/function/read",
    "object/faas/function/update",
    "object/faas/function/delete",
    "object/faas/function/invoke",
    // tenants
    "object/tenant/create",
    "object/tenant/read"
];

// stock "Agent Workspace Users" role created by the V2_4 auth DB migration
const AGENT_WORKSPACE_USERS_ROLE_ID = "00000000-3854-4200-8000-000000000001";

const ENV_SETUP_TIME_OUT = 600000; // -- 10 mins
const jwtSecret = uuidV4();
const authApiBaseUrl = "http://localhost:6104/v0";
const authApiClient = new AuthApiClient(
    authApiBaseUrl,
    jwtSecret,
    DEFAULT_ADMIN_USER_ID
);
const getOrgUnitIdByName = partial(
    getOrgUnitIdByNameWithAuthApiClient,
    authApiClient
);

async function getAsAdmin(path: string): Promise<any[]> {
    const res = await fetch(
        urijs(authApiBaseUrl + path)
            .search({ limit: 10000 })
            .toString(),
        {
            headers: {
                "X-Magda-Session": buildJwt(jwtSecret, DEFAULT_ADMIN_USER_ID)
            }
        }
    );
    expect(res.status).to.equal(200);
    return await res.json();
}

describe("Partial evaluation of the bundled OPA policies", function () {
    const serviceRunner = new ServiceRunner();
    serviceRunner.enableAuthService = true;
    serviceRunner.jwtSecret = jwtSecret;
    serviceRunner.authApiDebugMode = false;

    let userId: string;

    before(async function (this) {
        this.timeout(ENV_SETUP_TIME_OUT);
        await serviceRunner.create();
        await createOrgUnits(authApiClient);

        const user = await authApiClient.createUser({
            displayName: "Test User with all constrained permissions",
            email: "constrained@test.com",
            source: "internal",
            sourceId: uuidV4(),
            orgUnitId: await getOrgUnitIdByName("Branch B")
        });
        userId = user.id;

        // every kind of constrained permission on every resource & operation
        const constraints = [
            { user_ownership_constraint: true },
            { org_unit_ownership_constraint: true },
            { pre_authorised_constraint: true },
            { org_unit_ownership_constraint: true, allow_exemption: true }
        ];
        const roleIds = [DATA_STEWARDS_ROLE_ID, AGENT_WORKSPACE_USERS_ROLE_ID];
        for (const resource of await getAsAdmin("/public/resources")) {
            const operations = await getAsAdmin(
                `/public/resources/${resource.id}/operations`
            );
            if (!operations.length) {
                continue;
            }
            for (const constraint of constraints) {
                const role = await authApiClient.createRole(uuidV4());
                await authApiClient.createRolePermission(role.id, {
                    name: uuidV4(),
                    description: "",
                    resource_id: resource.id,
                    operationIds: operations.map((op: any) => op.id),
                    user_ownership_constraint: false,
                    org_unit_ownership_constraint: false,
                    pre_authorised_constraint: false,
                    ...constraint
                } as any);
                roleIds.push(role.id);
            }
        }
        await authApiClient.addUserRoles(userId, roleIds);
    });

    after(async function (this) {
        this.timeout(ENV_SETUP_TIME_OUT);
        await serviceRunner.destroy();
    });

    for (const operationUri of PARTIALLY_EVALUATED_OPERATIONS) {
        it(`should produce translatable residual rules for \`${operationUri}\``, async () => {
            // the object's data is not supplied, so the decision endpoint partially evaluates the policy
            const res = await fetch(
                `${authApiBaseUrl}/opa/decision/${operationUri}`,
                {
                    headers: {
                        "X-Magda-Session": buildJwt(jwtSecret, userId)
                    }
                }
            );
            const body = await res.text();
            expect(res.status, body).to.equal(200);
            expect(JSON.parse(body).hasResidualRules).to.be.a("boolean");
        });
    }
});
