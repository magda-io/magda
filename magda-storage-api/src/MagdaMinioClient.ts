import ObjectFromStore from "./ObjectFromStore.js";
import { CreateBucketResponse } from "./ObjectStoreClient.js";
import { Client, ClientOptions } from "minio";
import urijs from "urijs";
import { Readable } from "stream";

export default class MagdaMinioClient {
    public readonly client: Client;
    public readonly region: string;
    public readonly endPoint: string;
    public readonly port: number;
    public readonly useSSL: boolean;
    public readonly endPointBaseUrl: string;

    constructor({
        endPoint,
        port,
        useSSL,
        accessKey,
        secretKey,
        region = "unspecified-region"
    }: ClientOptions) {
        this.client = new Client({
            endPoint,
            port: typeof port === "string" ? parseInt(port, 10) : port,
            useSSL,
            accessKey,
            secretKey,
            region
        });
        this.region = region;
        this.endPoint = endPoint;
        this.port = typeof port === "string" ? parseInt(port, 10) : port;
        this.useSSL = useSSL;
        this.endPointBaseUrl = urijs({
            protocol: useSSL ? "https" : "http",
            hostname: endPoint,
            port: this.port || 80
        }).toString();
    }

    async createGetObjectPresignUrl(
        bucketName: string,
        objectName: string,
        expires?: number,
        requestDate?: Date
    ): Promise<string> {
        return await this.client.presignedGetObject(
            bucketName,
            objectName,
            expires,
            requestDate
        );
    }

    /**
     * return presigned url path that can be used to access externally.
     * Here we assume requests are proxied to minio at `/api/v0/storage/gateway`
     * e.g. /api/v0/storage/gateway/bucket1/folder1/folder2/object1?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=minio%2F20220323%2Funspecified-region%2Fs3%2Faws4_request&X-Amz-Date=20220323T020200Z&X-Amz-Expires=604800&X-Amz-SignedHeaders=host&X-Amz-Signature=1ace2877887b50a7b9befef1b7b89c5cf7e223f296c15bb176e16fb409e7159c
     *
     * @param {string} bucketName
     * @param {string} objectName
     * @param {number} [expires]
     * @param {HeadersParamType} [respHeaders]
     * @param {Date} [requestDate]
     * @return {*}
     * @memberof MagdaMinioClient
     */
    async createGetObjectPresignExternalUri(
        bucketName: string,
        objectName: string,
        expires?: number,
        requestDate?: Date
    ) {
        const result = await this.createGetObjectPresignUrl(
            bucketName,
            objectName,
            expires,
            requestDate
        );
        return (
            "/api/v0/storage/gateway" +
            result.substr(this.endPointBaseUrl.length)
        );
    }

    async createPutObjectPresignUrl(
        bucketName: string,
        objectName: string,
        expires?: number
    ): Promise<string> {
        return await this.client.presignedPutObject(
            bucketName,
            objectName,
            expires
        );
    }

    /**
     * return presigned url path that can be used to access externally.
     *
     * @param {string} bucketName
     * @param {string} objectName
     * @param {number} [expires]
     * @return {*}
     * @memberof MagdaMinioClient
     */
    async createPutObjectPresignExternalUri(
        bucketName: string,
        objectName: string,
        expires?: number
    ) {
        const result = await this.createPutObjectPresignUrl(
            bucketName,
            objectName,
            expires
        );
        return (
            "/api/v0/storage/gateway" +
            result.substr(this.endPointBaseUrl.length)
        );
    }

    async createBucket(bucket: string): Promise<CreateBucketResponse> {
        try {
            await this.client.makeBucket(bucket, this.region);
            return {
                message:
                    "Bucket " +
                    bucket +
                    " created successfully in " +
                    this.region +
                    " 🎉",
                success: true
            };
        } catch (err) {
            if (
                err instanceof Error &&
                "code" in err &&
                (err.code === "BucketAlreadyOwnedByYou" ||
                    err.code === "BucketAlreadyExists")
            ) {
                return {
                    message: "Bucket " + bucket + " already exists 👍",
                    success: false
                };
            } else {
                console.error("😢 Error creating bucket: ", err);
                throw err;
            }
        }
    }

    getFile(bucket: string, fileName: string): ObjectFromStore {
        return {
            createStream: async () => {
                try {
                    return await this.client.getObject(bucket, fileName);
                } catch (err) {
                    console.error(err);
                    throw new Error("Encountered Error while getting file");
                }
            },
            headers: async () => {
                try {
                    const stat = await this.client.statObject(bucket, fileName);
                    return {
                        "Content-Type": stat.metaData["content-type"],
                        "Content-Encoding": stat.metaData["content-encoding"],
                        "Cache-Control": stat.metaData["cache-control"],
                        "Content-Length": stat.size,
                        "Record-ID": stat.metaData["record-id"]
                    };
                } catch (err) {
                    throw err;
                }
            }
        };
    }

    /**
     * Build S3-style headers from a flat metadata map. Standard headers are
     * passed through; everything else is prefixed with `X-Amz-Meta-` so that a
     * later `statObject` exposes it under its bare name (matching how the
     * existing single-shot upload metadata is read back).
     */
    toS3MetaHeaders(
        metaData: Record<string, string | undefined>
    ): {
        [key: string]: string;
    } {
        const passthrough = new Set([
            "content-type",
            "content-encoding",
            "cache-control",
            "content-length"
        ]);
        const headers: { [key: string]: string } = {};
        for (const [key, value] of Object.entries(metaData)) {
            if (value === undefined || value === null || value === "") {
                continue;
            }
            if (passthrough.has(key.toLowerCase())) {
                headers[key] = String(value);
            } else {
                headers[`X-Amz-Meta-${key}`] = String(value);
            }
        }
        return headers;
    }

    /**
     * Stream a byte range of an object. `length` of 0 means "read to the end".
     */
    async getPartialObject(
        bucket: string,
        objectName: string,
        offset: number,
        length: number
    ): Promise<Readable> {
        return await this.client.getPartialObject(
            bucket,
            objectName,
            offset,
            length
        );
    }

    /**
     * Start a multipart upload. Returns the S3 uploadId.
     * `initiateNewMultipartUpload` is marked `@internal` in the minio typings,
     * hence the cast.
     */
    async initiateMultipartUpload(
        bucket: string,
        objectName: string,
        metaHeaders: { [key: string]: string }
    ): Promise<string> {
        return await (this.client as any).initiateNewMultipartUpload(
            bucket,
            objectName,
            metaHeaders
        );
    }

    /**
     * Upload a single part (a Buffer) and return its ETag.
     *
     * NOTE: minio v8's public `client.uploadPart` parses the ETag out of the
     * response *body* (expecting a `CopyPartResult` XML element). A plain
     * (non-copy) UploadPart returns an empty body with the ETag in the response
     * `etag` *header*, so that code path throws
     * "Cannot read properties of undefined (reading 'ETag')". We therefore issue
     * the PUT part request directly (same request shape minio builds internally)
     * and read the ETag from the response header.
     */
    async uploadPart(
        bucket: string,
        objectName: string,
        uploadId: string,
        partNumber: number,
        body: Buffer
    ): Promise<string> {
        const query = `uploadId=${uploadId}&partNumber=${partNumber}`;
        const res: any = await (this.client as any).makeRequestAsyncOmit(
            {
                method: "PUT",
                bucketName: bucket,
                objectName,
                query,
                headers: { "Content-Length": body.length }
            },
            body
        );
        const rawEtag: string | undefined =
            res?.headers?.etag ?? res?.headers?.ETag;
        if (!rawEtag) {
            throw new Error(
                `uploadPart did not return an ETag for part ${partNumber} of ${bucket}/${objectName}`
            );
        }
        // strip the surrounding quotes S3 wraps ETags in
        return rawEtag.replace(/^"/, "").replace(/"$/, "");
    }

    /**
     * List the parts already uploaded for a multipart upload (for resume).
     * `listParts` is `protected` in the minio typings, hence the cast.
     */
    async listParts(
        bucket: string,
        objectName: string,
        uploadId: string
    ): Promise<{ partNumber: number; etag: string; size: number }[]> {
        const parts: any[] = await (this.client as any).listParts(
            bucket,
            objectName,
            uploadId
        );
        return parts.map((p) => ({
            partNumber: p.part,
            etag: p.etag,
            size: p.size
        }));
    }

    /**
     * Complete a multipart upload from a list of {partNumber, etag}.
     */
    async completeMultipartUpload(
        bucket: string,
        objectName: string,
        uploadId: string,
        parts: { partNumber: number; etag: string }[]
    ): Promise<{ etag: string; versionId: string | null }> {
        const etags = parts
            .slice()
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((p) => ({ part: p.partNumber, etag: p.etag }));
        return await this.client.completeMultipartUpload(
            bucket,
            objectName,
            uploadId,
            etags
        );
    }

    /**
     * Abort a multipart upload, discarding any uploaded parts.
     */
    async abortMultipartUpload(
        bucket: string,
        objectName: string,
        uploadId: string
    ): Promise<void> {
        await this.client.abortMultipartUpload(bucket, objectName, uploadId);
    }

    /**
     * Ensure the bucket has a lifecycle rule that auto-aborts incomplete
     * multipart uploads after `days`. Non-fatal: logs a warning on failure
     * (e.g. gateway modes that don't support lifecycle config).
     */
    async ensureIncompleteUploadExpiryRule(
        bucket: string,
        days: number
    ): Promise<void> {
        try {
            await this.client.setBucketLifecycle(bucket, {
                Rule: [
                    {
                        ID: "magda-abort-incomplete-multipart-uploads",
                        Status: "Enabled",
                        Filter: { Prefix: "" },
                        AbortIncompleteMultipartUpload: {
                            DaysAfterInitiation: days
                        }
                    }
                ]
            } as any);
        } catch (err) {
            console.warn(
                `Could not set incomplete-multipart-upload lifecycle rule on bucket ${bucket}:`,
                err
            );
        }
    }

    /**
     * Uploads a file to the specified bucket.
     *
     * Note: Prior to Minio v8, this method manually converted content to a stream.
     * With Minio v8+, the client can handle various content types directly:
     * - Buffer (from multipart file uploads)
     * - String (from PUT request body)
     * - Stream (if provided directly)
     *
     * Content size is tracked via metadata["Content-Length"] rather than being
     * passed explicitly to the Minio client.
     *
     * @param bucket The bucket to upload to
     * @param objectName The name/path of the object in the bucket
     * @param content The content to upload (Buffer, string, or stream)
     * @param metaData Optional metadata for the object
     */
    async putFile(
        bucket: string,
        objectName: string,
        content: any,
        metaData?: object
    ): Promise<any> {
        try {
            return await this.client.putObject(
                bucket,
                objectName,
                content,
                undefined,
                metaData
            );
        } catch (err) {
            console.error("Error uploading file:", err);
            throw err;
        }
    }

    /**
     *
     * @param bucket Bucket to remove the object from
     * @param objectName Name of the object in the bucket
     * @returns Whether or not deletion has been successful
     */
    async deleteFile(bucket: string, objectName: string): Promise<boolean> {
        try {
            await this.client.removeObject(bucket, objectName);
            return true;
        } catch (err) {
            console.error("Error deleting file:", err);
            throw err;
        }
    }
}
