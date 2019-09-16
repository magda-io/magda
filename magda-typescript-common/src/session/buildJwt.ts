const jwt = require("jsonwebtoken");

export default function buildJwt(
    jwtSecret: string,
    userId: string,
    session: any = {}
) {
    return jwt.sign({ userId, session }, jwtSecret);
}
