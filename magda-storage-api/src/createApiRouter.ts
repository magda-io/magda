import express, { Request, Response } from "express";
import MagdaMinioClient from "./MagdaMinioClient";
import bodyParser from "body-parser";
import { getUserId } from "magda-typescript-common/src/authorization-api/authMiddleware";
import AuthorizedRegistryClient from "magda-typescript-common/src/registry/AuthorizedRegistryClient";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";
import {
    requireStorageBucketPermission,
    requireStorageObjectPermission
} from "./storageAuthMiddlewares";
import { StorageBucketMetaData, StorageObjectMetaData } from "./common";
import ServerError from "magda-typescript-common/src/ServerError";
export interface ApiRouterOptions {
    registryClient: AuthorizedRegistryClient;
    objectStoreClient: MagdaMinioClient;
    jwtSecret: string;
    tenantId: number;
    uploadLimit: string;
    authDecisionClient: AuthDecisionQueryClient;
}

export default function createApiRouter(options: ApiRouterOptions) {
    const router: express.Router = express.Router();

    // JSON files are interpreted as text
    router.use(bodyParser.text({ type: ["text/*", "application/json"] }));
    router.use(
        bodyParser.raw({ type: ["image/*", "application/octet-stream"] })
    );

    // Liveness probe
    router.get("/status/live", function (_req, res) {
        return res.status(200).send("OK");
    });

    // Readiness probe
    router.get("/status/ready", function (_req, res) {
        return res.status(200).send("OK");
    });

    /**
     * @apiGroup Storage
     *
     * @api {PUT} /v0/storage/buckets/{bucketid} Request to create a new bucket
     *
     * @apiDescription Creates a new bucket with a specified name. Restricted to admins only.
     *
     * @apiParam (Path) {string} bucketid The name of the bucket to be created
     * @apiParam (body) {string} [orgUnitId] (Optional) The id of the orgUnit that the bucket belongs to.
     * @apiParamExample {json} Request-Example:
     *     {
     *        "orgUnitId": "1e8aca17-2615-4cdf-91ec-f877cf9e6bdc"
     *     }
     *
     * @apiSuccessExample {json} 201
     *    {
     *        "message":"Bucket my-bucket created successfully in unspecified-region 🎉"
     *    }
     *
     * @apiSuccessExample {json} 201
     *    {
     *        "message": "Bucket my-bucket already exists 👍"
     *    }
     * @apiErrorExample {json} 500
     *    {
     *        "message": "Bucket creation failed. This has been logged and we are looking into this."
     *    }
     */
    router.put(
        "/:bucketid",
        getUserId(options.jwtSecret),
        requireStorageBucketPermission(
            options.authDecisionClient,
            options.objectStoreClient,
            "storage/bucket/create",
            async (req: Request, res: Response) => req?.params?.bucketid,
            async (req: Request, res: Response) => {
                const metaData: StorageBucketMetaData = {
                    region: options.objectStoreClient.region,
                    ownerId: res?.locals?.userId,
                    orgUnitId: req?.body?.orgUnitId
                };
                return metaData;
            }
        ),
        async function (req, res) {
            try {
                const bucketId = req.params.bucketid;
                if (!bucketId) {
                    return res
                        .status(400)
                        .send(
                            "Please specify a bucket name in the request URL."
                        );
                }

                const encodedBucketname = bucketId; //encodeURIComponent(bucketId);
                const createBucketRes = await options.objectStoreClient.createBucket(
                    encodedBucketname
                );
                return res.status(201).send({
                    message: createBucketRes.message
                });
            } catch (err) {
                console.error(err);
                return res.status(500).send({
                    message:
                        "Bucket creation failed. This has been logged and we are looking into this."
                });
            }
        }
    );

    /**
     * @apiDefine Storage Storage API
     */

    /**
     * @apiGroup Storage
     *
     * @api {get} /v0/storage/{bucket}/{path} Request to download an object in {bucket} at path {path}
     *
     * @apiDescription Downloads an object
     *
     * @apiParam (Request path) {string} bucket The name of the bucket under which the requested object is
     * @apiParam (Request path) {string} path The name of the object being requested
     *
     * @apiSuccessExample {binary} 200
     *      <Contents of a file>
     *
     * @apiErrorExample {text} 404
     *      "No such object with path {path} in bucket {bucket}"
     *
     * @apiErrorExample {text} 500
     *      "Unknown error"
     */
    router.get(
        "/:bucket/*",
        requireStorageObjectPermission(
            options.authDecisionClient,
            options.registryClient,
            options.objectStoreClient,
            "storage/object/read",
            // bucket name
            async (req: Request, res: Response) => req?.params?.bucket,
            // object id / path
            async (req: Request, res: Response) => req?.params?.[0],
            async (req: Request, res: Response) => undefined
        ),
        async function (req, res) {
            const path = req.params[0];
            const bucket = req.params.bucket;
            const encodeBucketname = encodeURIComponent(bucket);

            try {
                const object = options.objectStoreClient.getFile(
                    encodeBucketname,
                    path
                );

                const headers = await object.headers();
                if (typeof headers === "object") {
                    Object.keys(headers).forEach((headerName) => {
                        const value = headers[headerName];
                        if (typeof value !== "undefined") {
                            res.setHeader(headerName, headers[headerName]);
                        }
                    });
                }

                const stream = await object.createStream();
                if (stream) {
                    stream.on("error", (_e) => {
                        res.status(500).send("Unknown error");
                    });
                    stream.pipe(res);
                } else {
                    throw new ServerError("Failed to create stream.", 500);
                }
            } catch (e) {
                if (e?.code === "NotFound") {
                    res.status(404).send(
                        `Cannot locate storage object: ${bucket}/${path}`
                    );
                } else if (e instanceof ServerError) {
                    res.status(e.statusCode).send(e.message);
                } else {
                    res.status(500).send(`Failed to get storage object: ${e}`);
                }
            }
        }
    );

    /**
     * @apiGroup Storage
     *
     * @api {put} /v0/storage/{bucket}/{filePath}?{recordId} Request to upload an object to {bucket} with name {filePath}
     *
     * @apiDescription Uploads an object. Restricted to admins only.
     *
     * @apiParam (Request path) {string} bucket The name of the bucket to which to upload to
     * @apiParam (Request path) {string} filePath The path of the file to delete
     * @apiParam (Request query) {string} recordId A record id to associate this file with - a user will only
     *      be allowed to access this file if they're also allowed to access the associated record. Should be
     *      url encoded.
     * @apiParam (Request query) {string} [orgUnitId] (Optional) The id of the orgUnit that the bucket belongs to.
     *
     * @apiSuccessExample {json} 200
     *    {
     *        "message":"File uploaded successfully",
     *        "etag":"edd88378a7900bf663a5fa386386b585-1",
     *        "versionId": "xxxxxxxx"
     *    }
     *
     * @apiErrorExample {json} 400
     *    {
     *        "message":"No content.",
     *    }
     *
     * @apiErrorExample {json} 500
     *    {
     *        "message":"Encountered error while uploading file. This has been logged and we are looking into this."
     *    }
     */
    router.put(
        "/:bucket/*",
        getUserId(options.jwtSecret),
        requireStorageObjectPermission(
            options.authDecisionClient,
            options.registryClient,
            options.objectStoreClient,
            "storage/object/create",
            // retrieve bucket name
            async (req: Request, res: Response) => req?.params?.bucket,
            // retrieve object id / path
            async (req: Request, res: Response) => req?.params?.[0],
            // create auth decision context data
            async (req: Request, res: Response) => {
                const metaData: StorageObjectMetaData = {
                    recordId: req?.query?.recordId as string,
                    contentType: req?.headers?.["content-type"] as string,
                    cacheControl: req?.headers?.["cache-control"] as string,
                    ownerId: res?.locals?.userId,
                    orgUnitId: req?.query?.orgUnitId as string
                };
                const size = parseInt(
                    req?.headers?.["content-length"] as string
                );
                if (!isNaN(size)) {
                    metaData.size = size;
                }
                return metaData;
            }
        ),
        async function (req, res) {
            const path = req.params[0];
            const bucket = req.params.bucket;

            const recordId =
                req.query.recordId &&
                decodeURIComponent(req.query.recordId as string);

            const encodeBucketname = encodeURIComponent(bucket);
            const content = req.body;
            const contentType = req.headers["content-type"];
            const contentLength = parseInt(req?.headers?.["content-length"]);

            if (
                !isNaN(contentLength) &&
                !contentLength &&
                typeof req.body !== "string"
            ) {
                return res.status(400).json({ message: "No Content." });
            }

            const metaData: any = {
                "Content-Type": contentType,
                "Content-Length": contentLength
            };
            if (recordId) {
                metaData["magda-record-id"] = recordId;
            }
            if (res?.locals?.userId) {
                metaData["magda-user-id"] = res.locals.userId;
            }
            if (req?.query?.orgUnitId) {
                metaData["magda-org-unit-id"] = req.query.orgUnitId;
            }
            if (req?.headers?.["cache-control"]) {
                metaData["Cache-Control"] = req.headers["cache-control"];
            }
            return options.objectStoreClient
                .putFile(encodeBucketname, path, content, metaData)
                .then((uploadedObjectInfo) => {
                    return res.status(200).send({
                        message: "File uploaded successfully",
                        etag: uploadedObjectInfo.etag,
                        versionId: uploadedObjectInfo.versionId
                    });
                })
                .catch((err: Error) => {
                    console.error(err);
                    // Sending 500 for everything for the moment
                    return res.status(500).send({
                        message:
                            "Encountered error while uploading file. " +
                            "This has been logged and we are looking into this."
                    });
                });
        }
    );

    /**
     * @apiGroup Storage
     *
     * @api {delete} /v0/storage/{bucket}/{filePath} Request to delete an object at {bucket} with path {filePath}
     *
     * @apiDescription Deletes an object. This is a hard delete, and cannot be undone.
     * Note that if the {filePath} does not exist, the request will not fail.
     *
     * @apiParam (Request path) {string} bucket The name of the bucket where the object resides
     * @apiParam (Request path) {string} filePath The name of the object to be deleted
     *
     * @apiSuccessExample {json} 200
     *    {
     *        "message":"File deleted successfully",
     *    }
     *
     * @apiErrorExample {json} 500
     *    {
     *        "message": "Encountered error while deleting file. This has been logged and we are looking into this."
     *    }
     */
    router.delete(
        "/:bucket/*",
        requireStorageObjectPermission(
            options.authDecisionClient,
            options.registryClient,
            options.objectStoreClient,
            "storage/object/delete",
            // retrieve bucket name
            async (req: Request, res: Response) => req?.params?.bucket,
            // retrieve object id / path
            async (req: Request, res: Response) => req?.params?.[0],
            async (req: Request, res: Response) => undefined
        ),
        async function (req, res) {
            const filePath = req.params[0];
            const bucket = req.params.bucket;

            const encodeBucketname = encodeURIComponent(bucket);
            const deletionSuccess = await options.objectStoreClient.deleteFile(
                encodeBucketname,
                filePath
            );
            if (deletionSuccess) {
                return res.status(200).send({
                    message: "File deleted successfully"
                });
            }
            return res.status(500).send({
                message:
                    "Encountered error while deleting file." +
                    "This has been logged and we are looking into this."
            });
        }
    );

    return router;
}
