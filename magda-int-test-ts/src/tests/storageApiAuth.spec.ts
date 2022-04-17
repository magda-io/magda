import {} from "mocha";
//import { expect } from "chai";
//import fetchRequest from "magda-typescript-common/src/fetchRequest";
import ServiceRunner from "../ServiceRunner";
import partial from "lodash/partial";
import { v4 as uuidV4 } from "uuid";
import AuthApiClient from "magda-typescript-common/src/authorization-api/ApiClient";
//import RegistryApiClient from "magda-typescript-common/src/registry/AuthorizedRegistryClient";
import {
    DEFAULT_ADMIN_USER_ID,
    // AUTHENTICATED_USERS_ROLE_ID,
    DATA_STEWARDS_ROLE_ID
    //ANONYMOUS_USERS_ROLE_ID
} from "magda-typescript-common/src/authorization-api/constants";
//import unionToThrowable from "magda-typescript-common/src/util/unionToThrowable";
//import { CreateUserData } from "magda-typescript-common/src/authorization-api/model";
//import { Record } from "magda-typescript-common/src/generated/registry/api";
//import ServerError from "magda-typescript-common/src/ServerError";
//import isUuid from "magda-typescript-common/src/util/isUuid";
//import { AccessControlAspect } from "magda-typescript-common/src/registry/model";
import getStorageUrl from "magda-typescript-common/src/getStorageUrl";
import {
    createOrgUnits,
    getRegistryClient as getRegistryClientWithJwtSecret,
    //getOrgUnitIdByName as getOrgUnitIdByNameWithAuthApiClient,
    createTestDatasetByUser as createTestDatasetByUserWithAuthApiClientJwtSecret
    //createTestDistributionByUser as createTestDistributionByUserWithAuthApiClientJwtSecret
} from "./testUtils";
import urijs from "urijs";
import fetch from "isomorphic-fetch";
import FormData from "form-data";
import buildJwt from "magda-typescript-common/src/session/buildJwt";
import { expect } from "chai";

const ENV_SETUP_TIME_OUT = 300000; // -- 5 mins
const jwtSecret = uuidV4();
const authApiClient = new AuthApiClient(
    "http://localhost:6104/v0",
    jwtSecret,
    DEFAULT_ADMIN_USER_ID
);

const getRegistryClient = partial(getRegistryClientWithJwtSecret, jwtSecret);
// const getOrgUnitIdByName = partial(
//     getOrgUnitIdByNameWithAuthApiClient,
//     authApiClient
// );
const createTestDatasetByUser = partial(
    createTestDatasetByUserWithAuthApiClientJwtSecret,
    authApiClient,
    jwtSecret
);
// const createTestDistributionByUser = partial(
//     createTestDistributionByUserWithAuthApiClientJwtSecret,
//     authApiClient,
//     jwtSecret
// );

const storageApiUrl = "http://localhost:6121/v0";

async function getFile(
    bucketName: string,
    storageUrl: string,
    userId?: string
) {
    const [datasetId, distId, fileName] = urijs(storageUrl).segmentCoded();
    const config: RequestInit = {
        method: "get"
    };
    if (userId) {
        config.headers = {
            "X-Magda-Session": buildJwt(jwtSecret, userId)
        };
    }
    const res = await fetch(
        urijs(storageApiUrl)
            .segmentCoded(bucketName)
            .segmentCoded(datasetId)
            .segmentCoded(distId)
            .segmentCoded(fileName)
            .toString(),
        config
    );
    return res;
}

async function deleteFile(
    bucketName: string,
    storageUrl: string,
    userId?: string
) {
    const [datasetId, distId, fileName] = urijs(storageUrl).segmentCoded();
    const config: RequestInit = {
        method: "delete"
    };
    if (userId) {
        config.headers = {
            "X-Magda-Session": buildJwt(jwtSecret, userId)
        };
    }
    const res = await fetch(
        urijs(storageApiUrl)
            .segmentCoded(bucketName)
            .segmentCoded(datasetId)
            .segmentCoded(distId)
            .segmentCoded(fileName)
            .toString(),
        config
    );
    return res;
}

describe("storage api auth integration tests", () => {
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

        it("should allow a data steward to upload files that are associated with a draft dataset", async () => {
            const dataStewardUser = await authApiClient.createUser({
                displayName: "Test dataStewardUser",
                email: "dataStewward@test.com",
                source: "internal",
                sourceId: uuidV4()
            });
            const dataStewardUserId = dataStewardUser.id;
            const dataStewardUserJwtToken = buildJwt(
                jwtSecret,
                dataStewardUserId
            );
            // add data steward user role to the data steward user
            await authApiClient.addUserRoles(dataStewardUserId, [
                DATA_STEWARDS_ROLE_ID
            ]);

            const datasetId = await createTestDatasetByUser(dataStewardUserId);
            // for a draft dataset, (to make it simple) we don't have to create a distribution record before upload the file.
            // But we do need to generate distribution id beforehand
            const distributionId = uuidV4();
            const fileStorageUrl = getStorageUrl(
                datasetId,
                distributionId,
                testFileName
            );
            const [
                processedDatasetId,
                processedDistId,
                processedfileName
            ] = urijs(fileStorageUrl).segmentCoded();

            const formData = new FormData();
            formData.append(processedfileName, testFileContent, {
                filename: processedfileName,
                contentType: "text/csv"
            });

            const fetchUri = urijs(storageApiUrl)
                .segmentCoded("upload")
                .segmentCoded(serviceRunner.defaultBucket)
                .segmentCoded(processedDatasetId)
                .segmentCoded(processedDistId)
                .search({ recordId: datasetId });

            // the data steward can upload a file that is associated with the dataset
            // as he has permission to update permission of the draft dataset
            let res = await fetch(fetchUri.toString(), {
                method: "post",
                body: formData.getBuffer(),
                headers: {
                    ...formData.getHeaders(),
                    "X-Magda-Session": dataStewardUserJwtToken
                }
            });

            expect(res.status).to.equal(200);
            expect(await res.json()).to.have.own.property("etag");

            // create a test user, by default, he only has access to public datatses
            // thus should has no access to datasetId. Consequently, no access to our test file
            const testUser = await authApiClient.createUser({
                displayName: "Test User",
                email: "testuser@test.com",
                source: "internal",
                sourceId: uuidV4()
            });

            const testUserId = testUser.id;

            res = await getFile(
                serviceRunner.defaultBucket,
                fileStorageUrl,
                testUserId
            );

            // test user has no access to read now
            expect(res.status).to.equal(403);

            // create arbitrary permission of test dataset
            const role = await authApiClient.createRole("test role");
            const permission = await authApiClient.createRolePermission(
                role.id,
                {
                    name: "arbitrary permission to datasetId",
                    description: "",
                    resource_id: (
                        await authApiClient.getResourceByUri("object/record")
                    ).id,
                    user_ownership_constraint: false,
                    org_unit_ownership_constraint: false,
                    pre_authorised_constraint: true,
                    operationIds: [
                        (
                            await authApiClient.getOperationByUri(
                                "object/record/read"
                            )
                        ).id
                    ]
                }
            );

            // add arbitrary permission to dataset with id datasetId
            let result = await getRegistryClient(
                DEFAULT_ADMIN_USER_ID
            ).patchRecordAspect(datasetId, "access-control", [
                {
                    op: "add",
                    path: "/preAuthorisedPermissionIds",
                    value: [permission.id]
                }
            ]);

            expect(result).to.not.be.an.instanceof(Error);

            // add test role to the test user
            await authApiClient.addUserRoles(testUserId, [role.id]);

            // try request the file again by test user
            res = await getFile(
                serviceRunner.defaultBucket,
                fileStorageUrl,
                testUserId
            );

            // test user has access now
            expect(res.status).to.equal(200);
            expect(await res.text()).to.equal(testFileContent);
            expect(res.headers.get("content-type")).to.equal("text/csv");
        });

        it("should allow a data steward to delete the file that he uploaded for a dataset", async () => {
            const dataStewardUser = await authApiClient.createUser({
                displayName: "Test dataStewardUser",
                email: "dataStewward@test.com",
                source: "internal",
                sourceId: uuidV4()
            });
            const dataStewardUserId = dataStewardUser.id;
            const dataStewardUserJwtToken = buildJwt(
                jwtSecret,
                dataStewardUserId
            );
            // add data steward user role to the data steward user
            await authApiClient.addUserRoles(dataStewardUserId, [
                DATA_STEWARDS_ROLE_ID
            ]);

            const datasetId = await createTestDatasetByUser(dataStewardUserId);
            // for a draft dataset, (to make it simple) we don't have to create a distribution record before upload the file.
            // But we do need to generate distribution id beforehand
            const distributionId = uuidV4();
            const fileStorageUrl = getStorageUrl(
                datasetId,
                distributionId,
                testFileName
            );
            const [
                processedDatasetId,
                processedDistId,
                processedfileName
            ] = urijs(fileStorageUrl).segmentCoded();

            const formData = new FormData();
            formData.append(processedfileName, testFileContent, {
                filename: processedfileName,
                contentType: "text/csv"
            });

            const fetchUri = urijs(storageApiUrl)
                .segmentCoded("upload")
                .segmentCoded(serviceRunner.defaultBucket)
                .segmentCoded(processedDatasetId)
                .segmentCoded(processedDistId)
                .search({ recordId: datasetId });

            // the data steward can upload a file that is associated with the dataset
            // as he has permission to update permission of the draft dataset
            let res = await fetch(fetchUri.toString(), {
                method: "post",
                body: formData.getBuffer(),
                headers: {
                    ...formData.getHeaders(),
                    "X-Magda-Session": dataStewardUserJwtToken
                }
            });

            expect(res.status).to.equal(200);
            expect(await res.json()).to.have.own.property("etag");

            // create a different user to try the deletion operation
            // it should fail
            const testUser = await authApiClient.createUser({
                displayName: "Test User",
                email: "testuser@test.com",
                source: "internal",
                sourceId: uuidV4()
            });

            // try to delete the file
            res = await deleteFile(
                serviceRunner.defaultBucket,
                fileStorageUrl,
                testUser.id
            );
            // test user should be rejected
            expect(res.status).to.equal(403);

            // try again with the data steward
            res = await deleteFile(
                serviceRunner.defaultBucket,
                fileStorageUrl,
                dataStewardUserId
            );
            // this time should work
            expect(res.status).to.equal(200);

            // now try get the file with admin user
            res = await getFile(
                serviceRunner.defaultBucket,
                fileStorageUrl,
                DEFAULT_ADMIN_USER_ID
            );
            // we should get 404 (non found) as it's deleted
            expect(res.status).to.equal(404);
        });
    });
});
