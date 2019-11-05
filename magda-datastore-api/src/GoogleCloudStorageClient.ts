import { Bucket, Storage } from "@google-cloud/storage";
import { Probe } from "@magda/typescript-common/dist/express/status";
import ObjectFromStore from "./ObjectFromStore";
import ObjectStoreClient from "./ObjectStoreClient";

export default class GoogleCloudStorageClient implements ObjectStoreClient {
    private readonly bucket: Bucket;

    constructor(bucket: string, keyFile?: string) {
        this.bucket = new Storage({
            keyFilename: keyFile
        }).bucket(bucket);
    }

    readonly statusProbe: Probe = () => {
        return this.bucket.exists().then(status => {
            return status[0]
                ? { ready: true }
                : {
                      ready: false,
                      error: "Google Cloud Storage bucket does not exist"
                  };
        });
    };

    getFile(name: string): ObjectFromStore {
        const file = this.bucket.file(name);
        return {
            createStream() {
                return file.createReadStream();
            },
            headers() {
                return file.getMetadata().then(([metadata]) => {
                    return {
                        "Content-Type": metadata.contentType,
                        "Content-Encoding": metadata.contentEncoding,
                        "Cache-Control": metadata.cacheControl,
                        "Content-Length": metadata.size
                    };
                });
            }
        };
    }
}
