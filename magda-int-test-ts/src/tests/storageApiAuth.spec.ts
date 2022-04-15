import {} from "mocha";
import { expect } from "chai";
import ServiceRunner from "../ServiceRunner";
import partial from "lodash/partial";
import { v4 as uuidV4 } from "uuid";
import AuthApiClient from "magda-typescript-common/src/authorization-api/ApiClient";
import RegistryApiClient from "magda-typescript-common/src/registry/AuthorizedRegistryClient";
import {
    DEFAULT_ADMIN_USER_ID,
    AUTHENTICATED_USERS_ROLE_ID,
    DATA_STEWARDS_ROLE_ID,
    ANONYMOUS_USERS_ROLE_ID
} from "magda-typescript-common/src/authorization-api/constants";
import unionToThrowable from "magda-typescript-common/src/util/unionToThrowable";
import { CreateUserData } from "magda-typescript-common/src/authorization-api/model";
import { Record } from "magda-typescript-common/src/generated/registry/api";
import ServerError from "magda-typescript-common/src/ServerError";
import isUuid from "magda-typescript-common/src/util/isUuid";
import { AccessControlAspect } from "magda-typescript-common/src/registry/model";
import getStorageUrl from "magda-typescript-common/src/getStorageUrl";
import {
    createOrgUnits,
    getRegistryClient as getRegistryClientWithJwtSecret,
    getOrgUnitIdByName as getOrgUnitIdByNameWithAuthApiClient,
    createTestDatasetByUser as createTestDatasetByUserWithAuthApiClientJwtSecret,
    createTestDistributionByUser as createTestDistributionByUserWithAuthApiClientJwtSecret
} from "./testUtils";

const ENV_SETUP_TIME_OUT = 300000; // -- 5 mins
const jwtSecret = uuidV4();
const authApiClient = new AuthApiClient(
    "http://localhost:6104/v0",
    jwtSecret,
    DEFAULT_ADMIN_USER_ID
);

const getRegistryClient = partial(getRegistryClientWithJwtSecret, jwtSecret);
const getOrgUnitIdByName = partial(
    getOrgUnitIdByNameWithAuthApiClient,
    authApiClient
);
const createTestDatasetByUser = partial(
    createTestDatasetByUserWithAuthApiClientJwtSecret,
    authApiClient,
    jwtSecret
);
const createTestDistributionByUser = partial(
    createTestDistributionByUserWithAuthApiClientJwtSecret,
    authApiClient,
    jwtSecret
);

describe("storage api auth integration tests", () => {
    // we need to put actual test cases inside `before` as we need to org unit ids to generate our test case.
    describe("Test Dataset Metadata Creation related Workflow", function () {
        const serviceRunner = new ServiceRunner();
        serviceRunner.enableAuthService = true;
        serviceRunner.enableRegistryApi = true;
        serviceRunner.enableStorageApi = true;
        serviceRunner.jwtSecret = jwtSecret;
        serviceRunner.authApiDebugMode = false;

        const testFileName = "test file with a very long name.csv";
        const testFileContent = 'a,b,c\n1,"a test string",3\n';

        before(async function (this) {
            this.timeout(ENV_SETUP_TIME_OUT);
            await serviceRunner.create();
            await createOrgUnits(authApiClient);
        });

        after(async function (this) {
            this.timeout(ENV_SETUP_TIME_OUT);
            await serviceRunner.destroy();
        });

        it("should allow a data steward to upload file for draft dataset he created", async () => {
            const dataStewardUser = await authApiClient.createUser({
                displayName: "Test dataStewardUser",
                email: "dataStewward@test.com",
                source: "internal",
                sourceId: uuidV4()
            });
            const dataStewardUserId = dataStewardUser.id;
            // add data steward user role to the data steward user
            await authApiClient.addUserRoles(dataStewardUserId, [
                DATA_STEWARDS_ROLE_ID
            ]);

            const datasetId = await createTestDatasetByUser(dataStewardUserId);
            const distributionId = uuidV4();
            //const distribution = await createTestDistributionByUser(dataStewardUserId);
            getStorageUrl(datasetId, distributionId);
        });
    });
});
