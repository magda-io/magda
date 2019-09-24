import { Request } from "express";
import { Maybe } from "tsmonad";
const jwt = require("jsonwebtoken");

export function getUserSession(req: Request, jwtSecret: string): Maybe<any> {
    const jwtToken = req.header("X-Magda-Session");

    if (jwtToken) {
        try {
            const { session } = jwt.verify(jwtToken, jwtSecret);
            return Maybe.just(session);
        } catch (e) {
            return Maybe.nothing<{}>();
        }
    } else {
        return Maybe.nothing<{}>();
    }
}
