import { Probe } from "@magda/typescript-common/dist/express/status";
import ObjectFromStore from "./ObjectFromStore";
import ObjectStoreClient from "./ObjectStoreClient";
import { Stream } from "stream";

const Minio = require("minio");

export default class MagdaMinioClient implements ObjectStoreClient {
    private readonly bucket: string;
    private readonly client: any;

    constructor({ endPoint, port, useSSL, accessKey, secretKey, bucket }: any) {
        this.bucket = bucket;
        this.client = new Minio.Client({
            endPoint,
            port,
            useSSL,
            accessKey,
            secretKey
        });
    }

    readonly statusProbe: Probe = () => {
        return this.client
            .bucketExists(this.bucket)
            .then((err: Error, exists: boolean) => {
                if (err) {
                    return {
                        ready: false,
                        error: "Bucket Probe returned an error."
                    };
                }
                if (exists) {
                    return { ready: true };
                } else {
                    return {
                        ready: false,
                        error: "Bucket does not exist."
                    };
                }
            });
    };

    getFile(fileName: string): any {
        let size = 0;
        this.client.getObject(this.bucket, fileName, function(
            err: Error,
            dataStream: Stream
        ) {
            if (err) {
                return console.log(err);
            }
            dataStream.on("data", chunk => {
                console.log("Here is chunk");
                console.log(chunk);
                size += chunk.length;
            });
            dataStream.on("end", () => {
                console.log("End. Total size = " + size);
            });
            dataStream.on("error", (err: Error) => {
                console.log(err);
            });
        });

        // const file = this.bucket.file(name);
        // return {
        //     createStream() {
        //         return file.createReadStream();
        //     },
        //     headers() {
        //         return file.getMetadata().then(([metadata]) => {
        //             return {
        //                 "Content-Type": metadata.contentType,
        //                 "Content-Encoding": metadata.contentEncoding,
        //                 "Cache-Control": metadata.cacheControl,
        //                 "Content-Length": metadata.size
        //             };
        //         });
        //     }
        // };
    }
}
