import ObjectFromStore from "./ObjectFromStore.js";
import { CreateBucketResponse } from "./ObjectStoreClient.js";
import { Stream, Readable } from "stream";
import * as Minio from "minio";
import { UploadedObjectInfo } from "minio";
import urijs from "urijs";

type HeadersParamType = {
    [key: string]: string | number;
};

export default class MagdaMinioClient {
    public readonly client: Minio.Client;
    public readonly region: string;
    public readonly endPoint: string;
    public readonly port: string;
    public readonly useSSL: boolean;
    public readonly endPointBaseUrl: string;

    constructor({
        endPoint,
        port,
        useSSL,
        accessKey,
        secretKey,
        region = "unspecified-region"
    }: any) {
        this.client = new Minio.Client({
            endPoint,
            port,
            useSSL,
            accessKey,
            secretKey,
            region
        });
        this.region = region;
        this.endPoint = endPoint;
        this.port = port;
        this.useSSL = useSSL;
        this.endPointBaseUrl = urijs({
            protocol: useSSL ? "https" : "http",
            hostname: endPoint,
            port: port ? port : 80
        }).toString();
    }

    async createGetObjectPresignUrl(
        bucketName: string,
        objectName: string,
        expires?: number,
        respHeaders?: HeadersParamType,
        requestDate?: Date
    ): Promise<string> {
        let result: string;
        if (requestDate) {
            result = await this.client.presignedGetObject(
                bucketName,
                objectName,
                expires,
                respHeaders,
                requestDate
            );
        } else if (respHeaders) {
            result = await this.client.presignedGetObject(
                bucketName,
                objectName,
                expires,
                respHeaders
            );
        } else if (respHeaders) {
            result = await this.client.presignedGetObject(
                bucketName,
                objectName,
                expires
            );
        } else if (expires) {
            result = await this.client.presignedGetObject(
                bucketName,
                objectName,
                expires
            );
        } else {
            result = await this.client.presignedGetObject(
                bucketName,
                objectName
            );
        }
        return result;
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
        respHeaders?: HeadersParamType,
        requestDate?: Date
    ) {
        const result = await this.createGetObjectPresignUrl(
            bucketName,
            objectName,
            expires,
            respHeaders,
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
        let result: string;
        if (expires) {
            result = await this.client.presignedPutObject(
                bucketName,
                objectName,
                expires
            );
        } else {
            result = await this.client.presignedPutObject(
                bucketName,
                objectName
            );
        }
        return result;
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

    createBucket(bucket: string): Promise<CreateBucketResponse> {
        return new Promise((resolve, reject) => {
            return this.client.makeBucket(bucket, this.region, (err: Error) => {
                if (err) {
                    if (
                        (err as any).code === "BucketAlreadyOwnedByYou" ||
                        (err as any).code === "BucketAlreadyExists"
                    ) {
                        return resolve({
                            message: "Bucket " + bucket + " already exists 👍",
                            success: false
                        });
                    } else {
                        console.error("😢 Error creating bucket: ", err);
                        return reject(err);
                    }
                }
                return resolve({
                    message:
                        "Bucket " +
                        bucket +
                        " created successfully in " +
                        this.region +
                        " 🎉",
                    success: true
                });
            });
        });
    }

    getFile(bucket: string, fileName: string): ObjectFromStore {
        return {
            createStream: () => {
                return new Promise((resolve, reject) => {
                    return this.client.getObject(
                        bucket,
                        fileName,
                        (err: Error, dataStream: Stream) => {
                            if (err) {
                                console.error(err);
                                return reject(
                                    "Encountered Error while getting file"
                                );
                            }
                            return resolve(dataStream);
                        }
                    );
                });
            },
            headers: async () => {
                const stat: any = await new Promise((resolve, reject) => {
                    return this.client.statObject(
                        bucket,
                        fileName,
                        (err: Error, stat: any) => {
                            if (err) {
                                reject(err);
                            }
                            return resolve(stat);
                        }
                    );
                });

                return {
                    "Content-Type": stat.metaData["content-type"],
                    "Content-Encoding": stat.metaData["content-encoding"],
                    "Cache-Control": stat.metaData["cache-control"],
                    "Content-Length": stat.size,
                    "Record-ID": stat.metaData["record-id"]
                };
            }
        };
    }

    putFile(
        bucket: string,
        objectName: string,
        content: any,
        metaData?: object
    ): Promise<UploadedObjectInfo> {
        return new Promise((resolve, reject) => {
            const contentSize = content.length;
            const contentStream = new Readable();

            /*  https://stackoverflow.com/questions/12755997/how-to-create-streams-from-string-in-node-js/22085851#22085851
                (Update: in v0.10.26 through v9.2.1 so far, a call to push directly
                from the REPL prompt will crash with a not implemented exception
                if you didn't set _read. It won't crash inside a function or a script.
                If inconsistency makes you nervous, include the noop.)
            */
            // tldr; otherwise .push crashes in some versions of node with a 'not implemented' error
            contentStream._read = () => {};
            contentStream.push(content);
            contentStream.push(null);

            return this.client.putObject(
                bucket,
                objectName,
                contentStream,
                contentSize,
                metaData,
                (err: Error, uploadedObjectInfo: UploadedObjectInfo) => {
                    if (err) {
                        return reject(err);
                    }
                    return resolve(uploadedObjectInfo);
                }
            );
        });
    }

    /**
     *
     * @param bucket Bucket to remove the object from
     * @param objectName Name of the object in the bucket
     * @returns Whether or not deletion has been successful
     */
    deleteFile(bucket: string, objectName: string): Promise<boolean> {
        return new Promise((resolve, _reject) => {
            return this.client.removeObject(bucket, objectName, function (
                err: any
            ) {
                if (err) {
                    console.error("Unable to remove object: ", err);
                    return resolve(false);
                }
                return resolve(true);
            });
        });
    }
}
