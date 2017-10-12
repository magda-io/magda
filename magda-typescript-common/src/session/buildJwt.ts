const jwt = require("jsonwebtoken");

export default function buildJwt(jwtSecret: string, userId: string) {
    return jwt.sign({ userId }, jwtSecret);
}
