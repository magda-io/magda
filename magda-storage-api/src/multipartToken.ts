import jwt from "jsonwebtoken";
import ServerError from "magda-typescript-common/src/ServerError.js";

/**
 * The context of an in-progress multipart upload, carried inside the signed
 * `uploadId` token so storage-api stays stateless.
 */
export interface UploadSession {
    bucket: string;
    objectKey: string;
    s3UploadId: string;
    userId?: string;
    recordId?: string;
    orgUnitId?: string;
    contentType?: string;
}

const TOKEN_TYPE = "magda-multipart-upload";

/**
 * Sign an upload session into a JWT used as the opaque `uploadId`.
 * @param expiresIn any `jsonwebtoken` expiry expression, e.g. "24h".
 */
export function signUploadToken(
    session: UploadSession,
    secret: string,
    expiresIn: string
): string {
    return jwt.sign({ typ: TOKEN_TYPE, session }, secret, {
        expiresIn
    } as jwt.SignOptions);
}

/**
 * Verify + decode an `uploadId` token. Throws `ServerError(401)` if the token
 * is missing/invalid/expired or is not a multipart upload token.
 */
export function verifyUploadToken(
    token: string,
    secret: string
): UploadSession {
    let payload: any;
    try {
        payload = jwt.verify(token, secret);
    } catch (e) {
        throw new ServerError(`Invalid or expired uploadId: ${e}`, 401);
    }
    if (!payload || payload.typ !== TOKEN_TYPE || !payload.session) {
        throw new ServerError(
            "uploadId is not a valid multipart upload token.",
            401
        );
    }
    return payload.session as UploadSession;
}
