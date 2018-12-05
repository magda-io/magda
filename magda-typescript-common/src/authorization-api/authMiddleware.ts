import { Request, Response } from "express";
import { getUserId, getUserIdHandling } from "../session/GetUserId";
import ApiClient from "./ApiClient";

export const mustBeLoggedIn = (jwtSecret: string) =>
    function(this: any, req: Request, res: Response, next: () => void) {
        getUserIdHandling(req, res, jwtSecret, (userId: string) => {
            this.userId = userId;
            next();
        });
    };

/**
 * Find the user making the request. Assign it to req passport style.
 */
export const getUser = (baseAuthUrl: string, jwtSecret: string) => (
    req: Request,
    res: Response,
    next: () => void
) => {
    getUserId(req, jwtSecret).caseOf({
        just: userId => {
            const apiClient = new ApiClient(baseAuthUrl, jwtSecret, userId);
            apiClient
                .getUser(userId)
                .then(maybeUser => {
                    maybeUser.caseOf({
                        just: user => {
                            req.user = user;
                            next();
                        },
                        nothing: next
                    });
                })
                .catch(() => next());
        },
        nothing: next
    });
};

export const mustBeAdmin = (baseAuthUrl: string, jwtSecret: string) => {
    const getUserInstance = getUser(baseAuthUrl, jwtSecret);
    return (req: Request, res: Response, next: () => void) => {
        getUserInstance(req, res, () => {
            if (req.user && req.user.isAdmin) {
                next();
            } else {
                console.warn("Rejecting because user is not an admin");
                res.status(401).send("Not authorized.");
            }
        });
    };
};
