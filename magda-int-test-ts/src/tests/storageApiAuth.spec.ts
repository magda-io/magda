import {} from "mocha";
import { expect } from "chai";
import ServiceRunner from "../ServiceRunner.js";
import partial from "lodash/partial.js";
import { v4 as uuidV4 } from "uuid";
import AuthApiClient from "magda-typescript-common/src/authorization-api/ApiClient.js";
import {
    DEFAULT_ADMIN_USER_ID,
    DATA_STEWARDS_ROLE_ID
} from "magda-typescript-common/src/authorization-api/constants.js";
import getStorageUrl from "magda-typescript-common/src/getStorageUrl.js";
import {
    createOrgUnits,
    getRegistryClient as getRegistryClientWithJwtSecret,
    createTestDatasetByUser as createTestDatasetByUserWithAuthApiClientJwtSecret
} from "./testUtils.js";
import urijs from "urijs";
import fetch from "cross-fetch";
import FormData from "form-data";
import buildJwt from "magda-typescript-common/src/session/buildJwt.js";

const ENV_SETUP_TIME_OUT = 600000; // -- 10 mins
const jwtSecret = uuidV4();
const authApiClient = new AuthApiClient(
    "http://localhost:6104/v0",
    jwtSecret,
    DEFAULT_ADMIN_USER_ID
);

const getRegistryClient = partial(getRegistryClientWithJwtSecret, jwtSecret);
const createTestDatasetByUser = partial(
    createTestDatasetByUserWithAuthApiClientJwtSecret,
    authApiClient,
    jwtSecret
);

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
    let fileStorageUri = urijs(storageApiUrl).segmentCoded(bucketName);
    if (datasetId) {
        fileStorageUri = fileStorageUri.segmentCoded(datasetId);
    }
    if (distId) {
        fileStorageUri = fileStorageUri.segmentCoded(distId);
    }
    if (fileName) {
        fileStorageUri = fileStorageUri.segmentCoded(fileName);
    }
    const res = await fetch(fileStorageUri.toString(), config);
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
    let fileStorageUri = urijs(storageApiUrl).segmentCoded(bucketName);
    if (datasetId) {
        fileStorageUri = fileStorageUri.segmentCoded(datasetId);
    }
    if (distId) {
        fileStorageUri = fileStorageUri.segmentCoded(distId);
    }
    if (fileName) {
        fileStorageUri = fileStorageUri.segmentCoded(fileName);
    }
    const res = await fetch(fileStorageUri.toString(), config);
    return res;
}

async function createBucket(bucketName: string, userId?: string) {
    const config: RequestInit = {
        method: "put"
    };
    if (userId) {
        config.headers = {
            "X-Magda-Session": buildJwt(jwtSecret, userId)
        };
    }
    const res = await fetch(
        urijs(storageApiUrl).segmentCoded(bucketName).toString(),
        config
    );
    return res;
}

async function addPermissionToUser(
    userId: string,
    operationUri: string,
    constraints?: {
        ownershipConstraint?: boolean;
        orgUnitOwnershipConstraint?: boolean;
        preAuthorisedConstraint?: boolean;
    },
    resourceUri?: string
) {
    const runtimeResourceUri = resourceUri
        ? resourceUri
        : operationUri.substring(0, operationUri.lastIndexOf("/"));
    const role = await authApiClient.createRole(uuidV4());
    const permission = await authApiClient.createRolePermission(role.id, {
        name: uuidV4(),
        description: "test permission",
        resource_id: (await authApiClient.getResourceByUri(runtimeResourceUri))
            .id,
        user_ownership_constraint: constraints?.ownershipConstraint
            ? true
            : false,
        org_unit_ownership_constraint: constraints?.orgUnitOwnershipConstraint
            ? true
            : false,
        pre_authorised_constraint: constraints?.preAuthorisedConstraint
            ? true
            : false,
        operationIds: [(await authApiClient.getOperationByUri(operationUri)).id]
    });
    await authApiClient.addUserRoles(userId, [role.id]);
    return permission;
}

describe("storage api auth integration tests", () => {
    const testFileName = "test file with a very long name.csv";
    const testFileContent = 'a,b,c\n1,"a test string",3\n';

    const serviceRunner = new ServiceRunner();
    serviceRunner.enableAuthService = true;
    serviceRunner.enableRegistryApi = true;
    serviceRunner.enableStorageApi = true;
    serviceRunner.jwtSecret = jwtSecret;
    serviceRunner.authApiDebugMode = false;

    before(async function (this) {
        this.timeout(ENV_SETUP_TIME_OUT);
        await serviceRunner.create();
        await createOrgUnits(authApiClient);
    });

    after(async function (this) {
        this.timeout(ENV_SETUP_TIME_OUT);
        await serviceRunner.destroy();
    });

    describe("General access control tests (non-record related access control)", function () {
        it("should allow a user with storage/bucket/create permission to create a bucket", async () => {
            const testUser = await authApiClient.createUser({
                displayName: "Test User",
                email: "testuser@test.com",
                source: "internal",
                sourceId: uuidV4()
            });

            const testUserId = testUser.id;

            let res = await createBucket("test-bucket-123", testUserId);
            // test user has no access to create bucket now
            expect(res.status).to.equal(403);

            // grant no constraint permission to the test user
            await addPermissionToUser(testUserId, "storage/bucket/create");

            res = await createBucket("test-bucket-123", testUserId);
            // test user can create bucket now
            expect(res.status).to.equal(201);
        });

        it("should allow a user with storage/object/upload permission to upload", async () => {
            const testUser = await authApiClient.createUser({
                displayName: "Test User",
                email: "testuser@test.com",
                source: "internal",
                sourceId: uuidV4()
            });

            const testUserId = testUser.id;

            // attempt uploading file on behalf of test user
            const formData = new FormData();
            formData.append("test-file.csv", testFileContent, {
                filename: "test-file.csv",
                contentType: "text/csv"
            });

            const fetchUri = urijs(storageApiUrl)
                .segmentCoded("upload")
                .segmentCoded(serviceRunner.defaultBucket);

            const uploadRequestCfg = {
                method: "post",
                body: formData.getBuffer(),
                headers: {
                    ...formData.getHeaders(),
                    "X-Magda-Session": buildJwt(jwtSecret, testUserId)
                }
            };
            let res = await fetch(fetchUri.toString(), uploadRequestCfg);

            // test user has no access to upload the file now
            expect(res.status).to.equal(403);

            // grant no constraint permission to the test user
            await addPermissionToUser(testUserId, "storage/object/upload");

            res = await fetch(fetchUri.toString(), uploadRequestCfg);
            // test user can upload the file now
            expect(res.status).to.equal(200);

            // test file existence using an admin user
            res = await getFile(
                serviceRunner.defaultBucket,
                "magda://storage-api/test-file.csv",
                DEFAULT_ADMIN_USER_ID
            );

            expect(res.status).to.equal(200);
            expect(await res.text()).to.equal(testFileContent);
            expect(res.headers.get("content-type")).to.equal("text/csv");
        });

        it("should allow a user with storage/object/delete permission to delete an existing file", async () => {
            // upload a file as an admin user
            const formData = new FormData();
            formData.append("test-file.csv", testFileContent, {
                filename: "test-file.csv",
                contentType: "text/csv"
            });

            const fetchUri = urijs(storageApiUrl)
                .segmentCoded("upload")
                .segmentCoded(serviceRunner.defaultBucket);

            const uploadRequestCfg = {
                method: "post",
                body: formData.getBuffer(),
                headers: {
                    ...formData.getHeaders(),
                    "X-Magda-Session": buildJwt(
                        jwtSecret,
                        DEFAULT_ADMIN_USER_ID
                    )
                }
            };
            let res = await fetch(fetchUri.toString(), uploadRequestCfg);
            expect(res.status).to.equal(200);

            const testUser = await authApiClient.createUser({
                displayName: "Test User",
                email: "testuser@test.com",
                source: "internal",
                sourceId: uuidV4()
            });
            const testUserId = testUser.id;

            res = await deleteFile(
                serviceRunner.defaultBucket,
                "magda://storage-api/test-file.csv",
                testUserId
            );

            // test user has no access to delete the file now
            expect(res.status).to.equal(403);

            // grant no constraint permission to the test user
            await addPermissionToUser(testUserId, "storage/object/delete");

            res = await deleteFile(
                serviceRunner.defaultBucket,
                "magda://storage-api/test-file.csv",
                testUserId
            );
            // test user can delete the file now
            expect(res.status).to.equal(200);
        });
    });

    describe("Test Dataset Metadata Creation related Workflow", function () {
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

            // create arbitrary permission of test dataset & add to test user
            const permission = await addPermissionToUser(
                testUserId,
                "object/record/read",
                {
                    preAuthorisedConstraint: true
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
