import {} from "mocha";
import { expect } from "chai";
import jwt from "jsonwebtoken";
import ServerError from "magda-typescript-common/src/ServerError.js";
import {
    signUploadToken,
    verifyUploadToken,
    UploadSession
} from "../multipartToken.js";

describe("multipartToken", () => {
    const secret = "test-secret";
    const session: UploadSession = {
        bucket: "magda-datasets",
        objectKey: "ds1/dist1/file.csv",
        s3UploadId: "s3-upload-id-123",
        userId: "user-1",
        recordId: "record-1",
        orgUnitId: "org-1",
        contentType: "text/csv"
    };

    it("round-trips a session through sign/verify", () => {
        const token = signUploadToken(session, secret, "1h");
        const decoded = verifyUploadToken(token, secret);
        expect(decoded).to.deep.equal(session);
    });

    it("rejects a token signed with a different secret", () => {
        const token = signUploadToken(session, secret, "1h");
        expect(() => verifyUploadToken(token, "wrong-secret")).to.throw(
            ServerError
        );
    });

    it("rejects an expired token", () => {
        const token = signUploadToken(session, secret, "-1s");
        expect(() => verifyUploadToken(token, secret)).to.throw(ServerError);
    });

    it("rejects a valid JWT that is not a multipart upload token", () => {
        const token = jwt.sign({ hello: "world" }, secret);
        expect(() => verifyUploadToken(token, secret)).to.throw(ServerError);
    });
});
