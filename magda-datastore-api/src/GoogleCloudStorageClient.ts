import ObjectStoreClient from "./ObjectStoreClient";
import { Bucket, Storage } from "@google-cloud/storage";
import { Probe } from "@magda/typescript-common/dist/express/status";

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

    getFile(name: string): NodeJS.ReadableStream {
        const file = this.bucket.file(name);
        return file.createReadStream();
    }
}
