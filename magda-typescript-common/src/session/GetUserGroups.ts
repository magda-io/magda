import { Request, Response } from "express";
import { Maybe } from "tsmonad";
const jwt = require("jsonwebtoken");

export function getUserGroups(
    req: Request,
    jwtSecret: string
): Maybe<string[]> {
    const jwtToken = req.header("X-Magda-Session");

    if (jwtToken) {
        try {
            const { groups } = jwt.verify(jwtToken, jwtSecret);
            return Maybe.just(groups);
        } catch (e) {
            return Maybe.nothing<[]>();
        }
    } else {
        return Maybe.nothing<[]>();
    }
}

export function getUserGroupsHandling(
    req: Request,
    res: Response,
    jwtSecret: string,
    cb: (userGroups: string[]) => void
) {
    const userGroups = getUserGroups(req, jwtSecret);

    userGroups.caseOf({
        just: userGroups => {
            cb(userGroups);
        },
        nothing: () => {
            res.status(200).send("Not in any groups.");
        }
    });
}
