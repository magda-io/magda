import { Request, Response } from "express";
import { getUserIdHandling } from "../session/GetUserId";
import ApiClient from "./ApiClient";

export const mustBeLoggedIn = (jwtSecret: string) =>
    function(this: any, req: Request, res: Response, next: () => void) {
        getUserIdHandling(req, res, jwtSecret, (userId: string) => {
            this.userId = userId;
            next();
        });
    };

export const mustBeAdmin = (baseAuthUrl: string, jwtSecret: string) => (
    req: Request,
    res: Response,
    next: () => void
) => {
    const rejectNoAuth = () => res.status(401).send("Not authorized.");
    const apiClient = new ApiClient(baseAuthUrl);

    getUserIdHandling(req, res, jwtSecret, (userId: string) => {
        apiClient.getUser(userId).then(maybeUser => {
            maybeUser.caseOf({
                just: user => {
                    (req as any).user = user;
                    if (user.isAdmin) {
                        next();
                    } else {
                        console.warn(
                            `Rejecting because user ${user} is not admin`
                        );
                        rejectNoAuth();
                    }
                },
                nothing: () => {
                    console.warn("Rejecting because no user");
                    rejectNoAuth();
                }
            });
        });
    });
};
