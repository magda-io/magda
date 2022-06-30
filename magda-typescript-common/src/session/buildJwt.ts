const jwt = require("jsonwebtoken");

/**
 * build a JWT token
 *
 * @export
 * @param {string} jwtSecret the secret key used to sign JWT token
 * @param {string} userId the userId that is to be encoded into JWT token as claim data
 * @param {*} [session={}] extra data to be encoded into JWT token
 * @param {number} [expiresIn] Token Expiration (exp claim). In seconds. Must be larger than 0.
 * @return {*}
 */
export default function buildJwt(
    jwtSecret: string,
    userId: string,
    session: any = {},
    expiresIn?: number
) {
    return jwt.sign(
        { userId, session },
        jwtSecret,
        expiresIn && expiresIn > 0
            ? {
                  expiresIn
              }
            : undefined
    );
}
