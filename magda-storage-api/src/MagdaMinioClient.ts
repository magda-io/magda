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
            .bucketExists(this.bucket, (err: boolean | null, exists: boolean) => {
                if (err) {
                    return Promise.resolve({
                        ready: false,
                        error: "Bucket Probe returned an error."
                    });
                }
                if (exists) {
                    return Promise.resolve({ ready: true });
                } else {
                    return Promise.resolve({
                        ready: false,
                        error: "Bucket does not exist."
                    });
                }
            });
    };

    getFile(fileName: string): ObjectFromStore {
        const streamP = this.client.getObject(this.bucket, fileName, function(
            err: Error,
            dataStream: Stream
        ) {
            if (err) {
                return Promise.reject('Encountered Error while getting file');
            }
            return Promise.resolve(dataStream);
        });
        const statP = this.client.statObject(this.bucket, fileName, (err: Error, stat: any) => {
            console.log('stat: ', stat);
            return Promise.resolve(stat);
        });
        console.log('statP: ', statP);
        return {
            createStream() {
                return streamP.then(function(stream: Stream) {
                    return stream;
                });
            },
            headers() {
                return statP.then((stat: any) => Promise.resolve({
                    "Content-Type": stat.metaData['content-type'],
                    "Content-Encoding": stat.metaData['content-encoding'],
                    "Cache-Control": stat.metaData['cache-control'],
                    "Content-Length": stat.size
                }));
            }
        }
    }
}
