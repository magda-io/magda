import {} from "mocha";
import { expect } from "chai";
import ServiceRunner from "../ServiceRunner";
import { v4 as uuidV4 } from "uuid";
import AuthApiClient from "magda-typescript-common/src/authorization-api/ApiClient";
import { DEFAULT_ADMIN_USER_ID } from "magda-typescript-common/src/authorization-api/constants";
import RegistryApiClient from "magda-typescript-common/src/registry/AuthorizedRegistryClient";
import unionToThrowable from "magda-typescript-common/src/util/unionToThrowable";
import { OrgUnit } from "magda-typescript-common/src/authorization-api/model";
import { Record } from "magda-typescript-common/src/generated/registry/api";
import ServerError from "magda-typescript-common/src/ServerError";

const ENV_SETUP_TIME_OUT = 300000; // -- 5 mins
const jwtSecret = uuidV4();
const authApiClient = new AuthApiClient(
    "http://localhost:6104/v0",
    jwtSecret,
    DEFAULT_ADMIN_USER_ID
);

const getRegistryClient = (userId: string) =>
    new RegistryApiClient({
        baseUrl: "http://localhost:6101/v0",
        maxRetries: 0,
        tenantId: 0,
        jwtSecret: jwtSecret,
        userId
    });

describe("registry auth integration tests", () => {
    describe("Test Dataset Metadata Creation Workflow", function (this) {
        this.timeout(300000);
        const serviceRunner = new ServiceRunner();
        serviceRunner.enableRegistryApi = true;
        serviceRunner.jwtSecret = jwtSecret;
        serviceRunner.authApiDebugMode = false;

        let authenticatedUserId: string;
        let dataStewardUserId: string;

        const orgUnitRefs = {} as { [key: string]: OrgUnit };

        async function createOrgUnits() {
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

            const rootNode = await authApiClient.getRootOrgUnit();
            orgUnitRefs["Branch A"] = await authApiClient.createOrgNode(
                rootNode.id,
                {
                    name: "Branch A"
                }
            );
            orgUnitRefs["Branch B"] = await authApiClient.createOrgNode(
                rootNode.id,
                {
                    name: "Branch B"
                }
            );
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

        async function createTestDatasetByUser(
            userId: string,
            record?: Record
        ) {
            const userInfo = (await authApiClient.getUser(userId)).valueOrThrow(
                new Error(
                    `Invalid user id: ${userId}: cannot locate user info.`
                )
            );
            const datasetSetId = uuidV4();
            const recordData = record
                ? record
                : {
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
            if (!recordData?.aspects) {
                recordData.aspects = {};
            }

            if (!recordData.aspects?.["access-control"]) {
                recordData.aspects["access-control"] = {};
            }

            recordData.aspects["access-control"].ownerId = userId;
            if (userInfo?.orgUnitId) {
                recordData.aspects["access-control"].orgUnitId =
                    userInfo.orgUnitId;
            }

            let result = await getRegistryClient(userId).putRecord(recordData);
            expect(result).to.not.be.an.instanceof(Error);

            // test if the newly create dataset exists
            // we act as admin user
            result = await getRegistryClient(DEFAULT_ADMIN_USER_ID).getRecord(
                datasetSetId
            );

            expect(result).to.not.be.an.instanceof(Error);
            expect(unionToThrowable(result).id).to.equal(datasetSetId);
            return datasetSetId;
        }

        before(async function (this) {
            this.timeout(ENV_SETUP_TIME_OUT);
            await serviceRunner.create();
            await createOrgUnits();
            const authenticatedUser = await authApiClient.createUser({
                displayName: "Test AuthenticatedUser1",
                email: "authenticatedUser1@test.com",
                source: "internal",
                sourceId: uuidV4()
            });
            authenticatedUserId = authenticatedUser.id;
            const dataStewardUser = await authApiClient.createUser({
                displayName: "Test dataStewardUser",
                email: "dataStewward@test.com",
                source: "internal",
                sourceId: uuidV4(),
                orgUnitId: orgUnitRefs["Section B"].id
            });
            dataStewardUserId = dataStewardUser.id;
            // add data steward user role to the data steward user
            // "4154bf84-d36e-4551-9734-4666f5b1e1c0" is the default data steward role id
            await authApiClient.addUserRoles(dataStewardUserId, [
                "4154bf84-d36e-4551-9734-4666f5b1e1c0"
            ]);
        });

        after(async function (this) {
            this.timeout(ENV_SETUP_TIME_OUT);
            await serviceRunner.destroy();
        });

        it("should allow data steward user to create draft dataset", async () => {
            const datasetId = await createTestDatasetByUser(dataStewardUserId);

            // data steward can access the dataset
            let result = await getRegistryClient(dataStewardUserId).getRecord(
                datasetId
            );
            expect(result).to.not.be.an.instanceof(Error);
            expect(unionToThrowable(result).id).to.equal(datasetId);

            // authenticatedUser has no access to te draft dataset.
            result = await getRegistryClient(authenticatedUserId).getRecord(
                datasetId
            );
            expect(result).to.be.an.instanceof(Error);
            expect((result as ServerError).statusCode).to.equal(404);
        });
    });
});
