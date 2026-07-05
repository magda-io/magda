import express, { Request, Response, NextFunction } from "express";
import { require } from "@magda/esm-utils";
import { getUserId } from "magda-typescript-common/src/authorization-api/authMiddleware.js";
import ServerError from "magda-typescript-common/src/ServerError.js";
import { isValidS3ObjectKey } from "magda-typescript-common/src/getStorageUrl.js";
import { requireStorageObjectPermission } from "./storageAuthMiddlewares.js";
import { StorageObjectMetaData } from "./common.js";
import {
    signUploadToken,
    verifyUploadToken,
    UploadSession
} from "./multipartToken.js";
import type { ApiRouterOptions } from "./createApiRouter.js";

const bytes = require("bytes");

/**
 * Register the S3 multipart upload proxy endpoints on `router`. Must be called
 * BEFORE the global body parsers and the generic `/:bucket/*` routes so that
 * (a) the part route controls its own body parsing and (b) `multipart` is not
 * matched as a bucket name.
 *
 * Routes (all under `/v0/storage/multipart`):
 * - POST   /multipart/initiate/:bucket/*        (auth: storage/object/upload)
 * - PUT    /multipart/part/:bucket/*            (auth: valid uploadId token)
 * - GET    /multipart/parts/:bucket/*           (auth: valid uploadId token)
 * - POST   /multipart/complete/:bucket/*        (auth: valid token + storage/object/upload)
 * - DELETE /multipart/abort/:bucket/*           (auth: valid uploadId token)
 */
export default function registerMultipartRoutes(
    router: express.Router,
    options: ApiRouterOptions
) {
    const maxPartSizeBytes = bytes(options.maxPartSize) as number;
    const recommendedPartSizeBytes = bytes(
        options.recommendedPartSize
    ) as number;
    const MIN_PART_SIZE = 5 * 1024 * 1024;

    function requireValidUploadToken() {
        return (req: Request, res: Response, next: NextFunction) => {
            try {
                const token = req.query.uploadId as string;
                if (!token) {
                    throw new ServerError("Missing uploadId query param.", 400);
                }
                const uploadSession = verifyUploadToken(
                    token,
                    options.jwtSecret
                );
                const bucket = req.params.bucket;
                const objectKey = req.params[0];
                if (
                    uploadSession.bucket !== bucket ||
                    uploadSession.objectKey !== objectKey
                ) {
                    throw new ServerError(
                        "uploadId does not match the target object.",
                        401
                    );
                }
                res.locals.uploadSession = uploadSession;
                next();
            } catch (e) {
                if (e instanceof ServerError) {
                    res.status(e.statusCode).send({ message: e.message });
                } else {
                    res.status(401).send({ message: `Invalid uploadId: ${e}` });
                }
            }
        };
    }

    /**
     * @apiGroup Storage
     *
     * @api {post} /v0/storage/multipart/initiate/{bucket}/{path} Initiate a multipart upload
     *
     * @apiDescription Starts a resumable S3 multipart upload for a large object and
     * returns a signed `uploadId` token plus recommended part-size guidance. The
     * client then uploads the object in parts (see "Upload a multipart part"),
     * lists/resumes parts if needed, and finally completes (or aborts) the upload.
     *
     * Because each part is uploaded in its own request, the per-request body stays
     * small regardless of the total object size — so no ingress body-size increase
     * is required for arbitrarily large uploads.
     *
     * Authorization is enforced here (and again at "complete") using the same
     * `storage/object/upload` decision as the single-shot upload endpoints. In
     * addition to users who have `storage/object/upload` permission, a user also
     * has access when:
     * - the object is (to be) associated with a record via `recordId`, and
     * - the user has `object/record/create` or `object/record/update` permission to that record.
     *
     * The returned `uploadId` is a signed token that binds the upload session to
     * this user, bucket, and object key; supply it on all subsequent part / list /
     * complete / abort requests.
     *
     * @apiParam (Request path) {string} bucket The name of the bucket to upload to.
     * @apiParam (Request path) {string} path The object key (path) to create within the bucket.
     * @apiParam (Request query) {string} [recordId] A record id to associate the object with. A user will only be allowed to access the object if they're also allowed to access the associated record. Should be url encoded.
     * @apiParam (Request query) {string} [orgUnitId] (Optional) The id of the orgUnit that the object belongs to.
     * @apiParam (Request header) {string} [Content-Type] Content type to store with the object (applied on completion).
     *
     * @apiSuccessExample {json} 200
     *    {
     *        "uploadId": "eyJhbGciOiJIUzI1NiIsInR5cCI6Ik...(signed token)",
     *        "recommendedPartSize": "16mb",
     *        "recommendedPartSizeBytes": 16777216,
     *        "maxPartSize": "64mb",
     *        "maxPartSizeBytes": 67108864,
     *        "minPartSize": 5242880
     *    }
     *
     * @apiErrorExample {text} 400
     *      "object key: {path} is not valid storage object key."
     *
     * @apiErrorExample {json} 500
     *    {
     *        "message": "Failed to initiate multipart upload: {error}"
     *    }
     */
    // 1. INITIATE
    router.post(
        "/multipart/initiate/:bucket/*",
        getUserId(options.jwtSecret),
        requireStorageObjectPermission(
            options.authDecisionClient,
            options.registryClient,
            options.objectStoreClient,
            "storage/object/upload",
            async (req: Request) => req?.params?.bucket,
            async (req: Request) => {
                const objectKey = req?.params?.[0] ? req.params[0] : "";
                if (!objectKey || !isValidS3ObjectKey(objectKey)) {
                    throw new ServerError(
                        `object key: ${objectKey} is not valid storage object key.`,
                        400
                    );
                }
                return objectKey;
            },
            async (req: Request, res: Response) => {
                const metaData: StorageObjectMetaData = {
                    recordId: req?.query?.recordId as string,
                    contentType: req?.headers?.["content-type"] as string,
                    cacheControl: req?.headers?.["cache-control"] as string,
                    ownerId: res?.locals?.userId,
                    orgUnitId: req?.query?.orgUnitId as string
                };
                return metaData;
            }
        ),
        async (req: Request, res: Response) => {
            try {
                const bucket = req.params.bucket;
                const objectKey = req.params[0];
                const encodeBucketname = encodeURIComponent(bucket);
                const recordId = req.query.recordId
                    ? decodeURIComponent(req.query.recordId as string)
                    : undefined;
                const contentType = req.headers["content-type"] as string;
                const orgUnitId = req.query.orgUnitId as string;

                const metaHeaders = options.objectStoreClient.toS3MetaHeaders({
                    "Content-Type": contentType,
                    "Cache-Control": req.headers["cache-control"] as string,
                    "magda-record-id": recordId,
                    "magda-user-id": res.locals.userId,
                    "magda-org-unit-id": orgUnitId
                });

                const s3UploadId = await options.objectStoreClient.initiateMultipartUpload(
                    encodeBucketname,
                    objectKey,
                    metaHeaders
                );

                const uploadSession: UploadSession = {
                    bucket,
                    objectKey,
                    s3UploadId,
                    userId: res.locals.userId,
                    recordId,
                    orgUnitId,
                    contentType
                };
                const uploadId = signUploadToken(
                    uploadSession,
                    options.jwtSecret,
                    options.multipartUploadExpiry
                );

                res.status(200).send({
                    uploadId,
                    recommendedPartSize: options.recommendedPartSize,
                    recommendedPartSizeBytes,
                    maxPartSize: options.maxPartSize,
                    maxPartSizeBytes,
                    minPartSize: MIN_PART_SIZE
                });
            } catch (e) {
                if (e instanceof ServerError) {
                    res.status(e.statusCode).send({ message: e.message });
                } else {
                    res.status(500).send({
                        message: `Failed to initiate multipart upload: ${e}`
                    });
                }
            }
        }
    );

    /**
     * @apiGroup Storage
     *
     * @api {put} /v0/storage/multipart/part/{bucket}/{path} Upload a multipart part
     *
     * @apiDescription Uploads a single part of an in-progress multipart upload. The
     * raw part bytes are sent as the request body (any content type). Parts may be
     * uploaded in any order and, where the client supports it, concurrently.
     *
     * Each part except the last must be at least 5 MB (the S3 minimum), and a part
     * must not exceed the server's configured `maxPartSize` (returned by "initiate"),
     * otherwise the request is rejected with `413`. Capture the returned `etag` for
     * each part — it is required (paired with the part number) to complete the upload.
     *
     * This endpoint is authorized solely by the signed `uploadId` token issued at
     * "initiate" (no separate permission check runs per part).
     *
     * @apiParam (Request path) {string} bucket The bucket of the in-progress upload (must match the `uploadId`).
     * @apiParam (Request path) {string} path The object key of the in-progress upload (must match the `uploadId`).
     * @apiParam (Request query) {string} uploadId The signed upload session token returned by "initiate".
     * @apiParam (Request query) {number} partNumber The part number, an integer between 1 and 10000.
     * @apiParam (Request body) {binary} body The raw bytes of this part.
     *
     * @apiSuccessExample {json} 200
     *    {
     *        "partNumber": 1,
     *        "etag": "d41d8cd98f00b204e9800998ecf8427e"
     *    }
     *
     * @apiErrorExample {json} 400
     *    {
     *        "message": "partNumber must be an integer between 1 and 10000."
     *    }
     *
     * @apiErrorExample {json} 401
     *    {
     *        "message": "uploadId does not match the target object."
     *    }
     *
     * @apiErrorExample {json} 413
     *      (Part body exceeds the configured maxPartSize.)
     *
     * @apiErrorExample {json} 502
     *    {
     *        "message": "Failed to upload part: {error}"
     *    }
     */
    // 2. UPLOAD PART
    router.put(
        "/multipart/part/:bucket/*",
        requireValidUploadToken(),
        // Buffer at most ONE part in memory: express.raw caps the body at
        // maxPartSize (parts over the cap get a 413), so peak memory is
        // (concurrent in-flight parts × part size) — never the whole file.
        // minio's uploadPart requires a Buffer, so we can't stream the part.
        express.raw({ limit: options.maxPartSize, type: () => true }),
        async (req: Request, res: Response) => {
            try {
                const uploadSession: UploadSession = res.locals.uploadSession;
                const partNumber = parseInt(req.query.partNumber as string, 10);
                if (isNaN(partNumber) || partNumber < 1 || partNumber > 10000) {
                    return res.status(400).send({
                        message:
                            "partNumber must be an integer between 1 and 10000."
                    });
                }
                const body = req.body;
                if (!Buffer.isBuffer(body) || body.length === 0) {
                    return res
                        .status(400)
                        .send({ message: "Empty or missing part body." });
                }
                const encodeBucketname = encodeURIComponent(
                    uploadSession.bucket
                );
                const etag = await options.objectStoreClient.uploadPart(
                    encodeBucketname,
                    uploadSession.objectKey,
                    uploadSession.s3UploadId,
                    partNumber,
                    body
                );
                return res.status(200).send({ partNumber, etag });
            } catch (e) {
                if (e instanceof ServerError) {
                    return res
                        .status(e.statusCode)
                        .send({ message: e.message });
                } else {
                    return res.status(502).send({
                        message: `Failed to upload part: ${e}`
                    });
                }
            }
        }
    );

    /**
     * @apiGroup Storage
     *
     * @api {get} /v0/storage/multipart/parts/{bucket}/{path} List uploaded multipart parts
     *
     * @apiDescription Lists the parts that have already been uploaded for an
     * in-progress multipart upload. Useful for resuming an interrupted upload:
     * the client can skip parts already present and re-upload only the missing ones.
     *
     * Authorized solely by the signed `uploadId` token.
     *
     * @apiParam (Request path) {string} bucket The bucket of the in-progress upload (must match the `uploadId`).
     * @apiParam (Request path) {string} path The object key of the in-progress upload (must match the `uploadId`).
     * @apiParam (Request query) {string} uploadId The signed upload session token returned by "initiate".
     *
     * @apiSuccessExample {json} 200
     *    {
     *        "parts": [
     *            { "partNumber": 1, "etag": "d41d8cd98f00b204e9800998ecf8427e", "size": 16777216 },
     *            { "partNumber": 2, "etag": "e2fc714c4727ee9395f324cd2e7f331f", "size": 16777216 }
     *        ]
     *    }
     *
     * @apiErrorExample {json} 401
     *    {
     *        "message": "Invalid or expired uploadId: {error}"
     *    }
     *
     * @apiErrorExample {json} 500
     *    {
     *        "message": "Failed to list parts: {error}"
     *    }
     */
    // 3. LIST PARTS
    router.get(
        "/multipart/parts/:bucket/*",
        requireValidUploadToken(),
        async (_req: Request, res: Response) => {
            try {
                const uploadSession: UploadSession = res.locals.uploadSession;
                const encodeBucketname = encodeURIComponent(
                    uploadSession.bucket
                );
                const parts = await options.objectStoreClient.listParts(
                    encodeBucketname,
                    uploadSession.objectKey,
                    uploadSession.s3UploadId
                );
                res.status(200).send({ parts });
            } catch (e) {
                if (e instanceof ServerError) {
                    res.status(e.statusCode).send({ message: e.message });
                } else {
                    res.status(500).send({
                        message: `Failed to list parts: ${e}`
                    });
                }
            }
        }
    );

    /**
     * @apiGroup Storage
     *
     * @api {post} /v0/storage/multipart/complete/{bucket}/{path} Complete a multipart upload
     *
     * @apiDescription Finalizes an in-progress multipart upload, assembling the
     * uploaded parts into the final object and applying the metadata captured at
     * "initiate" (content type, record association, owner, org unit).
     *
     * The request body must list every uploaded part as `{partNumber, etag}` using
     * the etags returned by the "Upload a multipart part" responses. Parts may be
     * supplied in any order (the server sorts them by part number).
     *
     * In addition to the signed `uploadId` token, this endpoint re-runs the full
     * `storage/object/upload` authorization decision (the object materializes here),
     * so the request must be authenticated — supply the caller's session/API key —
     * and, if a `recordId` was provided at initiate, the user must have the
     * corresponding `object/record/create` or `object/record/update` permission.
     *
     * @apiParam (Request path) {string} bucket The bucket of the in-progress upload (must match the `uploadId`).
     * @apiParam (Request path) {string} path The object key of the in-progress upload (must match the `uploadId`).
     * @apiParam (Request query) {string} uploadId The signed upload session token returned by "initiate".
     * @apiParam (Request body) {Object[]} parts The uploaded parts.
     * @apiParam (Request body) {number} parts.partNumber The part number (1-10000).
     * @apiParam (Request body) {string} parts.etag The etag returned when the part was uploaded.
     *
     * @apiParamExample {json} Request-Example:
     *     {
     *        "parts": [
     *            { "partNumber": 1, "etag": "d41d8cd98f00b204e9800998ecf8427e" },
     *            { "partNumber": 2, "etag": "e2fc714c4727ee9395f324cd2e7f331f" }
     *        ]
     *     }
     *
     * @apiSuccessExample {json} 200
     *    {
     *        "message": "File uploaded successfully",
     *        "etag": "3858f62230ac3c915f300c664312c11f-2",
     *        "versionId": null
     *    }
     *
     * @apiErrorExample {json} 400
     *    {
     *        "message": "Request body must include a non-empty `parts` array."
     *    }
     *
     * @apiErrorExample {json} 401
     *    {
     *        "message": "Invalid or expired uploadId: {error}"
     *    }
     */
    // 4. COMPLETE
    router.post(
        "/multipart/complete/:bucket/*",
        requireValidUploadToken(),
        express.json(),
        requireStorageObjectPermission(
            options.authDecisionClient,
            options.registryClient,
            options.objectStoreClient,
            "storage/object/upload",
            async (req: Request) => req?.params?.bucket,
            async (req: Request) => req.params[0],
            async (_req: Request, res: Response) => {
                const uploadSession: UploadSession = res.locals.uploadSession;
                const metaData: StorageObjectMetaData = {
                    recordId: uploadSession.recordId,
                    contentType: uploadSession.contentType,
                    ownerId: uploadSession.userId,
                    orgUnitId: uploadSession.orgUnitId
                };
                return metaData;
            }
        ),
        async (req: Request, res: Response) => {
            try {
                const uploadSession: UploadSession = res.locals.uploadSession;
                const parts = req.body?.parts;
                if (!Array.isArray(parts) || !parts.length) {
                    return res.status(400).send({
                        message:
                            "Request body must include a non-empty `parts` array."
                    });
                }
                for (const p of parts) {
                    if (
                        typeof p?.partNumber !== "number" ||
                        typeof p?.etag !== "string"
                    ) {
                        return res.status(400).send({
                            message:
                                "Each part must have a numeric partNumber and a string etag."
                        });
                    }
                }
                const encodeBucketname = encodeURIComponent(
                    uploadSession.bucket
                );
                const result = await options.objectStoreClient.completeMultipartUpload(
                    encodeBucketname,
                    uploadSession.objectKey,
                    uploadSession.s3UploadId,
                    parts
                );
                return res.status(200).send({
                    message: "File uploaded successfully",
                    etag: result.etag,
                    versionId: result.versionId
                });
            } catch (e) {
                if (e instanceof ServerError) {
                    return res
                        .status(e.statusCode)
                        .send({ message: e.message });
                } else {
                    return res.status(400).send({
                        message: `Failed to complete multipart upload: ${e}`
                    });
                }
            }
        }
    );

    /**
     * @apiGroup Storage
     *
     * @api {delete} /v0/storage/multipart/abort/{bucket}/{path} Abort a multipart upload
     *
     * @apiDescription Aborts an in-progress multipart upload and discards any parts
     * that have already been uploaded. The operation is idempotent — aborting an
     * upload that no longer exists still returns `200`.
     *
     * Incomplete multipart uploads that are never completed or aborted are also
     * cleaned up automatically by a bucket lifecycle rule after
     * `incompleteUploadExpiryDays` (default 7).
     *
     * Authorized solely by the signed `uploadId` token.
     *
     * @apiParam (Request path) {string} bucket The bucket of the in-progress upload (must match the `uploadId`).
     * @apiParam (Request path) {string} path The object key of the in-progress upload (must match the `uploadId`).
     * @apiParam (Request query) {string} uploadId The signed upload session token returned by "initiate".
     *
     * @apiSuccessExample {json} 200
     *    {
     *        "aborted": true
     *    }
     *
     * @apiErrorExample {json} 401
     *    {
     *        "message": "Invalid or expired uploadId: {error}"
     *    }
     *
     * @apiErrorExample {json} 500
     *    {
     *        "message": "Failed to abort multipart upload: {error}"
     *    }
     */
    // 5. ABORT
    router.delete(
        "/multipart/abort/:bucket/*",
        requireValidUploadToken(),
        async (_req: Request, res: Response) => {
            try {
                const uploadSession: UploadSession = res.locals.uploadSession;
                const encodeBucketname = encodeURIComponent(
                    uploadSession.bucket
                );
                try {
                    await options.objectStoreClient.abortMultipartUpload(
                        encodeBucketname,
                        uploadSession.objectKey,
                        uploadSession.s3UploadId
                    );
                } catch (err) {
                    if ((err as any)?.code !== "NoSuchUpload") {
                        throw err;
                    }
                }
                res.status(200).send({ aborted: true });
            } catch (e) {
                if (e instanceof ServerError) {
                    res.status(e.statusCode).send({ message: e.message });
                } else {
                    res.status(500).send({
                        message: `Failed to abort multipart upload: ${e}`
                    });
                }
            }
        }
    );
}
