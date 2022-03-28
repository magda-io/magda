import { Request, Response, NextFunction } from "express";
import { StorageBucketMetaData, StorageObjectMetaData } from "./common";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";
import MagdaMinioClient from "./MagdaMinioClient";
import { requireUnconditionalAuthDecision } from "magda-typescript-common/src/authorization-api/authMiddleware";
import AuthorizedRegistryClient from "magda-typescript-common/src/registry/AuthorizedRegistryClient";
import ServerError from "magda-typescript-common/src/ServerError";
import { BucketItemStat } from "minio";

type RecordContextData = {
    [key: string]: any;
};

export function requireStorageBucketPermission(
    authDecisionClient: AuthDecisionQueryClient,
    storageClient: MagdaMinioClient,
    operationUri: string,
    bucketNameRetrieveFunc: (req: Request, res: Response) => Promise<string>,
    metaDataRetrieveFunc?: (
        req: Request,
        res: Response
    ) => Promise<StorageBucketMetaData>
) {
    if (typeof operationUri !== "string" || !operationUri) {
        throw new Error("Invalid empty operationUri!");
    }

    const parts = operationUri.split("/");
    if (parts.length < 3) {
        throw new Error(`Invalid operationUri: ${operationUri}`);
    }
    const operationType = parts.pop();
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const bucketName = await bucketNameRetrieveFunc(req, res);
            const metaData = metaDataRetrieveFunc
                ? await metaDataRetrieveFunc(req, res)
                : {};
            if (operationType === "create") {
                requireUnconditionalAuthDecision(authDecisionClient, {
                    operationUri,
                    input: {
                        storage: {
                            bucket: {
                                ...(metaData ? metaData : {}),
                                name: bucketName
                            }
                        }
                    }
                })(req, res, next);
                return;
            }
            const tags = await storageClient.client.getBucketTagging(
                bucketName
            );
            const currentBucketContextData: any = {};
            if (tags?.length) {
                tags.forEach((tag) => {
                    const key = tag.Key.replace(/^magda-/, "");
                    const value = tag.Value;
                    currentBucketContextData[key] = value;
                });
            }
            currentBucketContextData.name = bucketName;
            if (operationType !== "update") {
                requireUnconditionalAuthDecision(authDecisionClient, {
                    operationUri,
                    input: {
                        storage: {
                            bucket: currentBucketContextData
                        }
                    }
                })(req, res, next);
            } else {
                // for update operation, make sure user has permission to the bucket before & after update
                requireUnconditionalAuthDecision(authDecisionClient, {
                    operationUri,
                    input: {
                        storage: {
                            bucket: currentBucketContextData
                        }
                    }
                })(req, res, () => {
                    requireUnconditionalAuthDecision(authDecisionClient, {
                        operationUri,
                        input: {
                            storage: {
                                bucket: {
                                    ...currentBucketContextData,
                                    ...(metaData ? metaData : {}),
                                    bucketName
                                }
                            }
                        }
                    })(req, res, next);
                });
            }
        } catch (e) {
            if (e instanceof ServerError) {
                res.status(e.statusCode).send(e.message);
            } else {
                res.status(500).send(`${e}`);
            }
        }
    };
}

async function createRecordContextData(
    registryClient: AuthorizedRegistryClient,
    recordId: string
): Promise<RecordContextData | undefined> {
    try {
        const record = await registryClient.getRecordInFull(recordId);
        const { aspects, ...contextData } = record;
        if (aspects && typeof aspects === "object") {
            Object.keys(aspects).forEach(
                (key) => ((contextData as any)[key] = aspects[key])
            );
        }
        return contextData;
    } catch (e) {
        const errorMsg = `Failed to retrieve record to construct auth decision context data: ${e}`;
        console.warn(errorMsg);
        if (e instanceof ServerError) {
            if (e.statusCode === 404) {
                return undefined;
            }
            throw e;
        }
        throw new ServerError(errorMsg, 500);
    }
}

export function requireStorageObjectPermission(
    authDecisionClient: AuthDecisionQueryClient,
    registryClient: AuthorizedRegistryClient,
    storageClient: MagdaMinioClient,
    operationUri: string,
    bucketNameRetrieveFunc: (req: Request, res: Response) => Promise<string>,
    objectNameRetrieveFunc: (req: Request, res: Response) => Promise<string>,
    metaDataRetrieveFunc?: (
        req: Request,
        res: Response
    ) => Promise<StorageObjectMetaData>,
    onStorageObjectNotFound?: (
        req: Request,
        res: Response,
        next: NextFunction
    ) => void
) {
    if (typeof operationUri !== "string" || !operationUri) {
        throw new Error("Invalid empty operationUri!");
    }

    const parts = operationUri.split("/");
    if (parts.length < 3) {
        throw new Error(`Invalid operationUri: ${operationUri}`);
    }
    const operationType = parts.pop();

    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const bucketName = await bucketNameRetrieveFunc(req, res);
            const objectName = await objectNameRetrieveFunc(req, res);
            const metaData = metaDataRetrieveFunc
                ? await metaDataRetrieveFunc(req, res)
                : {};

            let stateData: BucketItemStat | null;

            try {
                stateData = await storageClient.client.statObject(
                    bucketName,
                    objectName
                );
            } catch (e) {
                if (e?.code === "NotFound") {
                    stateData = null;
                    if (
                        (operationType === "read" ||
                            operationType === "delete") &&
                        onStorageObjectNotFound
                    ) {
                        // if operationType == "read" or operationType == "delete"
                        // optionally let onStorageObjectNotFound decide response and end processing earlier
                        onStorageObjectNotFound(req, res, next);
                        return;
                    }
                } else {
                    throw new ServerError(
                        `Cannot fetch storage object metadata: ${e}`,
                        400
                    );
                }
            }

            const objectMetaData: StorageObjectMetaData = stateData
                ? {
                      size: stateData?.size,
                      ownerId: stateData?.metaData?.["magda-owner-id"],
                      orgUnitId: stateData?.metaData?.["magda-org-unit-id"],
                      recordId: stateData?.metaData?.["magda-record-id"]
                          ? stateData.metaData["magda-record-id"]
                          : // for backward compatibility before v2.0.0
                            stateData?.metaData?.["record-id"],
                      contentType: stateData?.metaData?.["content-type"],
                      contentEncoding:
                          stateData?.metaData?.["content-encoding"],
                      cacheControl: stateData?.metaData?.["cache-control"]
                  }
                : {};

            const currentContextData: any = {
                storage: {
                    object: {
                        ...objectMetaData,
                        bucketName,
                        name: objectName
                    }
                }
            };

            if (objectMetaData?.recordId) {
                currentContextData.object = {
                    record: await createRecordContextData(
                        registryClient,
                        objectMetaData?.recordId
                    )
                };
            }

            if (operationType === "read" || operationType === "delete") {
                requireUnconditionalAuthDecision(authDecisionClient, {
                    operationUri,
                    input: currentContextData
                })(req, res, next);
                return;
            }

            if (operationType == "upload") {
                const newRecordContextData = metaData?.recordId
                    ? await createRecordContextData(
                          registryClient,
                          metaData.recordId
                      )
                    : {};

                const newContextData = { ...currentContextData };
                newContextData.object = {
                    record: newRecordContextData
                };
                newContextData.storage.object = {
                    ...newContextData.storage.object,
                    ...(metaData ? metaData : {})
                };

                if (!stateData) {
                    // storage object doesn't exist, we are creating the storage object
                    // thus, we should use newContextData (contains object metadata proposed to create)
                    requireUnconditionalAuthDecision(authDecisionClient, {
                        operationUri,
                        input: newContextData
                    })(req, res, next);
                    return;
                }
                // storage object exist, upload operation will replace the existing object, make sure user has permission to the object before & after upload
                requireUnconditionalAuthDecision(authDecisionClient, {
                    operationUri,
                    input: currentContextData
                })(req, res, async () => {
                    requireUnconditionalAuthDecision(authDecisionClient, {
                        operationUri,
                        input: newContextData
                    })(req, res, next);
                });
            } else {
                throw new ServerError(
                    `Unknown operation: ${operationUri}`,
                    400
                );
            }
        } catch (e) {
            if (e instanceof ServerError) {
                res.status(e.statusCode).send(e.message);
            } else {
                res.status(500).send(`${e}`);
            }
        }
    };
}
