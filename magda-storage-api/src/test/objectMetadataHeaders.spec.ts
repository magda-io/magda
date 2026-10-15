import { expect } from "chai";
import MagdaMinioClient from "../MagdaMinioClient.js";

describe("MagdaMinioClient object metadata headers", () => {
    it("exposes trusted record and owner linkage through S3 metadata headers", async () => {
        const objectStore = new MagdaMinioClient({
            endPoint: "localhost",
            port: 9000,
            useSSL: false,
            accessKey: "test",
            secretKey: "test-secret"
        });
        (objectStore.client as any).statObject = async () => ({
            size: 123,
            metaData: {
                "content-type": "application/zip",
                "magda-record-id": "agent-skill-system-test",
                "magda-owner-id": "00000000-0000-4000-8000-000000000000"
            }
        });

        const headers = await objectStore
            .getFile("bucket", "skill.zip")
            .headers();
        expect(headers).to.include({
            "Content-Type": "application/zip",
            "Content-Length": 123,
            "X-Amz-Meta-magda-record-id": "agent-skill-system-test",
            "X-Amz-Meta-magda-owner-id": "00000000-0000-4000-8000-000000000000"
        });
    });
});
