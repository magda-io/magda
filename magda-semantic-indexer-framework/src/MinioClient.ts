import { MinioConfig } from "./commonYargs.js";
import * as Minio from "minio";
import urijs from "urijs";
import { tmpdir } from "os";
import { v4 as uuidv4 } from "uuid";
import { join } from "path";
import { deleteTempFile } from "./helpers.js";

export class MinioClient {
    private client: Minio.Client;
    private config: MinioConfig;

    constructor(config: MinioConfig, accessKey: string, secretKey: string) {
        this.client = new Minio.Client({
            endPoint: config.endPoint,
            port: config.port,
            accessKey: accessKey,
            secretKey: secretKey,
            useSSL: config.useSSL,
            region: config.region
        });
        this.config = config;
    }

    async downloadFile(url: string): Promise<string> {
        const uri = urijs(url);
        const [datasetId, distributionId, fileName] = uri.segmentCoded();

        const objectName = `${datasetId}/${distributionId}/${fileName}`;

        const tempDir = tmpdir();
        const tempFileName = `${uuidv4()}`;
        const tempFilePath = join(tempDir, tempFileName);

        try {
            await this.client.fGetObject(
                this.config.defaultDatasetBucket,
                objectName,
                tempFilePath
            );
            return tempFilePath;
        } catch (err) {
            await deleteTempFile(tempFilePath);
            throw err;
        }
    }
}
