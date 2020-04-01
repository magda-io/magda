import express from "express";
import { OutgoingHttpHeaders } from "http";
import ObjectStoreClient from "./ObjectStoreClient";
import bodyParser from "body-parser";
import { mustBeAdmin } from "magda-typescript-common/src/authorization-api/authMiddleware";
import { getUserId } from "magda-typescript-common/src/session/GetUserId";
import AuthorizedRegistryClient, {
    AuthorizedRegistryOptions
} from "magda-typescript-common/src/registry/AuthorizedRegistryClient";
const { fileParser } = require("express-multipart-file-parser");
import unionToThrowable from "magda-typescript-common/src/util/unionToThrowable";

export interface ApiRouterOptions {
    registryApiUrl: string;
    objectStoreClient: ObjectStoreClient;
    authApiUrl: string;
    jwtSecret: string;
    tenantId: number;
    uploadLimit: string;
}

export default function createApiRouter(options: ApiRouterOptions) {
    const router: express.Router = express.Router();

    // JSON files are interpreted as text
    router.use(bodyParser.text({ type: ["text/*", "application/json"] }));
    router.use(
        bodyParser.raw({ type: ["image/*", "application/octet-stream"] })
    );

    // Liveness probe
    router.get("/status/live", function(_req, res) {
        return res.status(200).send("OK");
    });

    // Readiness probe
    router.get("/status/ready", function(_req, res) {
        return res.status(200).send("OK");
    });

    /**
     * @apiGroup Storage
     *
     * @api {PUT} /v0/{bucketid} Request to create a new bucket
     *
     * @apiDescription Creates a new bucket with a specified name. Restricted to admins only.
     *
     * @apiParam (Request body) {string} bucketid The name of the bucket to be created
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
        mustBeAdmin(options.authApiUrl, options.jwtSecret),
        async function(req, res) {
            const bucketId = req.params.bucketid;
            if (!bucketId) {
                return res
                    .status(400)
                    .send("Please specify a bucket name in the request URL.");
            }

            const encodedBucketname = encodeURIComponent(bucketId);
            try {
                const createBucketRes = await options.objectStoreClient.createBucket(
                    encodedBucketname
                );
                return res.status(201).send({
                    message: createBucketRes.message
                });
            } catch (err) {
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
     * @api {get} /v0/{bucket}/{fileid} Request to download an object in {bucket} with name {fileid}
     *
     * @apiDescription Downloads an object
     *
     * @apiParam (Request path) {string} bucket The name of the bucket under which the requested object is
     * @apiParam (Request path) {string} fileid The name of the object being requested
     *
     * @apiSuccessExample {binary} 200
     *      <Contents of a file>
     *
     * @apiErrorExample {text} 404
     *      "No such object with fileId {fileid} in bucket {bucket}"
     *
     * @apiErrorExample {text} 500
     *      "Unknown error"
     */
    router.get("/:bucket/:fileid", async function(req, res) {
        const fileId = req.params.fileid;
        const bucket = req.params.bucket;
        const encodedFilename = encodeURIComponent(fileId);
        const encodeBucketname = encodeURIComponent(bucket);

        const object = options.objectStoreClient.getFile(
            encodeBucketname,
            encodedFilename
        );

        let headers: OutgoingHttpHeaders;
        try {
            headers = await object.headers();
            Object.keys(headers).forEach(header => {
                const value = headers[header];
                if (value !== undefined) {
                    res.setHeader(header, value);
                }
            });
        } catch (err) {
            if (err.code === "NotFound") {
                return res
                    .status(404)
                    .send(
                        "No such object with fileId " +
                            fileId +
                            " in bucket " +
                            bucket
                    );
            } else {
                return res.status(500).send("Unknown error");
            }
        }
        const recordIdNum = res.getHeader("Record-ID");
        if (recordIdNum) {
            const recordId = recordIdNum.toString();

            const found = await checkRecord(req, recordId);
            if (found === 404) {
                return res.status(404).send("Could not retrieve the file.");
            } else if (found === 500) {
                return res.status(500).send("Internal server error");
            }
        }

        const stream = await object.createStream();
        if (stream) {
            stream.on("error", _e => {
                return res.status(500).send("Unknown error");
            });
            return stream.pipe(res);
        }

        // Shouldn't get here
        console.error("Stream is undefined. Here is the request: ", req);
        return res
            .status(500)
            .send(
                "Stream not found. Object may be corrupted. We are looking into this."
            );
    });

    async function checkRecord(
        req: express.Request,
        recordId: string
    ): Promise<200 | 404 | 500> {
        const maybeUserId = getUserId(req, options.jwtSecret);
        let userId = maybeUserId.valueOr(undefined);

        const registryOptions: AuthorizedRegistryOptions = {
            baseUrl: options.registryApiUrl,
            jwtSecret: options.jwtSecret,
            userId: userId,
            tenantId: options.tenantId,
            maxRetries: 0
        };
        const registryClient = new AuthorizedRegistryClient(registryOptions);
        const recordP = await registryClient.getRecord(
            recordId,
            undefined,
            undefined
        );

        try {
            const record = unionToThrowable(recordP);

            // We could just return true here, but we'll give ourself a bit of extra cover by
            // asserting that the id is correct
            return record.id === recordId ? 200 : 404;
        } catch (err) {
            if (err.e && err.e.response && err.e.response.statusCode === 404) {
                return 404;
            } else {
                console.error(
                    "Error occurred when trying to contact registry",
                    err.message
                );
                return 500;
            }
        }
    }

    // Browser uploads
    /**
     * @apiGroup Storage
     *
     * @api {post} /v0/upload/{bucket} Request to upload files to {bucket}
     *
     * @apiDescription Uploads a file. Restricted to admins only.
     *
     * @apiParam (Request path) {string} bucket The name of the bucket to which to upload to
     * @apiParam (Request query) {string} recordId A record id to associate this file with - a user will only
     *      be allowed to access this file if they're also allowed to access the associated record. Should be
     *      url encoded.
     *
     * @apiSuccessExample {string} 200 Successfully uploaded 2 files.
     * {
     *      "message": "Successfully uploaded 2 files.",
     *      "etags": ["cafbab71cd98120b777799598f0d4808-1","19a3cb5d5706549c2f1a57a27cf30e41-1"]
     * }
     *
     * @apiErrorExample {string} 500
     *      Internal server error.
     */
    router.post(
        "/upload/:bucket",
        fileParser({ rawBodyOptions: { limit: options.uploadLimit } }),
        mustBeAdmin(options.authApiUrl, options.jwtSecret),
        async (req: any, res) => {
            if (!req.files || req.files.length === 0) {
                return res.status(400).send("No files were uploaded.");
            }
            const recordId =
                req.query.recordId && decodeURIComponent(req.query.recordId);

            if (recordId) {
                const found = await checkRecord(req, recordId);
                if (found === 404) {
                    return res.status(400).send("Invalid record id");
                } else if (found === 500) {
                    return res.status(500).send("Internal server error");
                }
            }

            const bucket = req.params.bucket;
            const encodeBucketname = encodeURIComponent(bucket);
            const promises = (req.files as Array<any>).map((file: any) => {
                const metaData: any = {
                    "Content-Type": file.mimetype,
                    "Content-Length": file.buffer.byteLength
                };
                if (recordId) {
                    metaData["Record-ID"] = recordId;
                }
                const fileid = file.originalname;
                const encodedRootPath = encodeURIComponent(fileid);
                return options.objectStoreClient
                    .putFile(
                        encodeBucketname,
                        encodedRootPath,
                        file.buffer,
                        metaData
                    )
                    .then(etag => etag);
            });
            return Promise.all(promises)
                .then(etags => {
                    return res.status(200).send({
                        message:
                            "Successfully uploaded " +
                            etags.length +
                            " file(s).",
                        etags
                    });
                })
                .catch((err: Error) => {
                    console.error(err);
                    return res.status(500).send("Internal server error.");
                });
        }
    );

    /**
     * @apiGroup Storage
     *
     * @api {put} /v0/{bucket}/{fileid}?{recordId} Request to upload an object to {bucket} with name {fileid}
     *
     * @apiDescription Uploads an object. Restricted to admins only.
     *
     * @apiParam (Request path) {string} bucket The name of the bucket to which to upload to
     * @apiParam (Request path) {string} fileid The name of the object being uploaded
     * @apiParam (Request query) {string} recordId A record id to associate this file with - a user will only
     *      be allowed to access this file if they're also allowed to access the associated record. Should be
     *      url encoded.
     *
     * @apiSuccessExample {json} 200
     *    {
     *        "message":"File uploaded successfully",
     *        "etag":"edd88378a7900bf663a5fa386386b585-1"
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
        "/:bucket/:fileid",
        mustBeAdmin(options.authApiUrl, options.jwtSecret),
        async function(req, res) {
            const fileId = req.params.fileid;
            const bucket = req.params.bucket;
            const recordId =
                req.query.recordId && decodeURIComponent(req.query.recordId);
            const encodedRootPath = encodeURIComponent(fileId);
            const encodeBucketname = encodeURIComponent(bucket);
            const content = req.body;
            const contentType = req.headers["content-type"];
            const contentLength = req.headers["content-length"];

            if (!contentLength) {
                return res.status(400).json({ message: "No Content." });
            }

            if (recordId) {
                const found = await checkRecord(req, recordId);
                if (found === 404) {
                    return res.status(400).send("Invalid record id");
                } else if (found === 500) {
                    return res.status(500).send("Internal server error");
                }
            }

            const metaData: any = {
                "Content-Type": contentType,
                "Content-Length": contentLength
            };
            if (recordId) {
                metaData["Record-ID"] = recordId;
            }
            return options.objectStoreClient
                .putFile(encodeBucketname, encodedRootPath, content, metaData)
                .then(etag => {
                    return res.status(200).send({
                        message: "File uploaded successfully",
                        etag: etag
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
     * @api {delete} /v0/{bucket}/{fileid} Request to delete an object at {bucket} with name {fileid}
     *
     * @apiDescription Deletes an object. This is a hard delete, and cannot be undone.
     * Note that if the {fileid} does not exist, the request will not fail.
     *
     * @apiParam (Request body) {string} bucket The name of the bucket where the object resides
     * @apiParam (Request body) {string} fileid The name of the object to be deleted
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
    router.delete("/:bucket/:fileid", async function(req, res) {
        const fileId = req.params.fileid;
        const bucket = req.params.bucket;
        const encodedRootPath = encodeURIComponent(fileId);
        const encodeBucketname = encodeURIComponent(bucket);
        const deletionSuccess = await options.objectStoreClient.deleteFile(
            encodeBucketname,
            encodedRootPath
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
    });

    return router;
}
