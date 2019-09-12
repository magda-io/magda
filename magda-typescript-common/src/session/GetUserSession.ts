import { Request, Response } from "express";
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

export function getUserGroupsHandling(
    req: Request,
    res: Response,
    jwtSecret: string,
    cb: (session: any) => void
) {
    const session = getUserSession(req, jwtSecret);

    session.caseOf({
        just: session => {
            cb(session);
        },
        nothing: () => {
            res.status(200).send("No session info available.");
        }
    });
}
