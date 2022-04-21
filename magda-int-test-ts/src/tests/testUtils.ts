import { expect } from "chai";
import { v4 as uuidV4 } from "uuid";
import { OrgUnit } from "magda-typescript-common/src/authorization-api/model";
import AuthApiClient from "magda-typescript-common/src/authorization-api/ApiClient";
import RegistryApiClient from "magda-typescript-common/src/registry/AuthorizedRegistryClient";
import { DEFAULT_ADMIN_USER_ID } from "magda-typescript-common/src/authorization-api/constants";
import unionToThrowable from "magda-typescript-common/src/util/unionToThrowable";
import { Record } from "magda-typescript-common/src/generated/registry/api";
import { AccessControlAspect } from "magda-typescript-common/src/registry/model";
import merge from "lodash/merge";

export async function createOrgUnits(authApiClient: AuthApiClient) {
    /**
     * Create org unit as followings:
     *
     *         +---------+
     *         |   Root  |
     *         | 1     12|
     *         +----+----+
     *              |
     *     +--------+--------+
     *     |                 |
     * +----+----+       +----+----+
     * | Branch A|       | Branch B|
     * | 2     3 |       | 4     11|
     * +---------+       +----+----+
     *                        |
     *         +-------------------------+
     *         |             |            |
     *     +----+----+  +----+----+  +----+----+
     *     |Section A|  |Section B|  |Section C|
     *     | 5     6 |  | 7     8 |  | 9     10|
     *     +---------+  +---------+  +---------+
     */

    const orgUnitRefs = {} as { [key: string]: OrgUnit };
    const rootNode = await authApiClient.getRootOrgUnit();

    orgUnitRefs["Branch A"] = await authApiClient.createOrgNode(rootNode.id, {
        name: "Branch A"
    });
    orgUnitRefs["Branch B"] = await authApiClient.createOrgNode(rootNode.id, {
        name: "Branch B"
    });
    orgUnitRefs["Section A"] = await authApiClient.createOrgNode(
        orgUnitRefs["Branch B"].id,
        {
            name: "Section A"
        }
    );
    orgUnitRefs["Section B"] = await authApiClient.createOrgNode(
        orgUnitRefs["Branch B"].id,
        {
            name: "Section B"
        }
    );
    orgUnitRefs["Section C"] = await authApiClient.createOrgNode(
        orgUnitRefs["Branch B"].id,
        {
            name: "Section C"
        }
    );
}

export async function getOrgUnitIdByName(
    authApiClient: AuthApiClient,
    name: string
): Promise<string> {
    const orgUnits = await authApiClient.getOrgUnitsByName(name);
    if (!orgUnits?.length) {
        throw new Error(`cannot locate orgUnit with name: ${name}`);
    }
    return orgUnits[0].id;
}

export const getRegistryClient = (jwtSecret: string, userId?: string) => {
    if (userId) {
        return new RegistryApiClient({
            baseUrl: "http://localhost:6101/v0",
            maxRetries: 0,
            tenantId: 0,
            jwtSecret: jwtSecret,
            userId
        });
    } else {
        // registry client that acts as ANONYMOUS_USERS
        return new RegistryApiClient({
            baseUrl: "http://localhost:6101/v0",
            maxRetries: 0,
            tenantId: 0
        });
    }
};

export async function createTestDatasetByUser(
    authApiClient: AuthApiClient,
    jwtSecret: string,
    userId: string,
    record?: Record,
    accessControlAspect?: AccessControlAspect
) {
    const userInfo = (await authApiClient.getUser(userId)).valueOrThrow(
        new Error(`Invalid user id: ${userId}. Cannot locate user info.`)
    );
    const datasetSetId = uuidV4();
    const defaultRecordData = {
        id: datasetSetId,
        name: "test dataset",
        aspects: {
            "dataset-draft": {
                dataset: {
                    name: "test dataset"
                },
                data: "{}",
                timestamp: "2022-04-11T12:52:24.278Z"
            },
            publishing: {
                state: "draft"
            },
            "access-control": {}
        },
        tenantId: 0,
        sourceTag: "",
        // authnReadPolicyId is deprecated and to be removed
        authnReadPolicyId: ""
    };
    const recordData = record
        ? merge(defaultRecordData, record)
        : defaultRecordData;

    if (!recordData?.aspects) {
        recordData.aspects = {};
    }

    if (!recordData.aspects?.["access-control"]) {
        recordData.aspects["access-control"] = {};
    }

    if (accessControlAspect) {
        recordData.aspects["access-control"] = {
            ...accessControlAspect
        };
    } else {
        // when accessControlAspect is not specify, set to the user's user id & orgUnit id
        recordData.aspects["access-control"].ownerId = userId;
        if (userInfo?.orgUnitId) {
            recordData.aspects["access-control"].orgUnitId = userInfo.orgUnitId;
        }
    }

    recordData.id = datasetSetId;

    let result = await getRegistryClient(jwtSecret, userId).putRecord(
        recordData
    );
    expect(result).to.not.be.an.instanceof(Error);

    // test if the newly create dataset exists
    // we act as admin user
    result = await getRegistryClient(
        jwtSecret,
        DEFAULT_ADMIN_USER_ID
    ).getRecord(datasetSetId);

    expect(result).to.not.be.an.instanceof(Error);
    expect(unionToThrowable(result).id).to.equal(datasetSetId);
    return datasetSetId;
}

export async function createTestDistributionByUser(
    authApiClient: AuthApiClient,
    jwtSecret: string,
    userId: string,
    accessControlAspect?: AccessControlAspect
) {
    return await createTestDatasetByUser(
        authApiClient,
        jwtSecret,
        userId,
        {
            id: "",
            name: "test dist",
            aspects: {
                "dcat-distribution-strings": {
                    title: "a test distribution",
                    description: "this is a test distribution"
                },
                "access-control": {}
            },
            tenantId: 0,
            sourceTag: "",
            // authnReadPolicyId is deprecated and to be removed
            authnReadPolicyId: ""
        },
        accessControlAspect
    );
}
