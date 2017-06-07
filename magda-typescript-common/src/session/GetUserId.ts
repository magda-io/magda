import { Request } from "@types/express";
const jwt = require('jsonwebtoken');

export default function getUserId(req: Request): string {
    const jwtToken = req.header("X-Magda-Session");
    const { userId } = jwt.verify(jwtToken, process.env.JWT_SECRET);
    return userId;
}