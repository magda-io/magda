import { Request, Response } from "express";
import {
    getUserId as getUserIdFromReq,
    getUserIdHandling
} from "../session/GetUserId";
import ApiClient from "./ApiClient";
import AuthDecisionQueryClient, {
    AuthDecisionReqConfig
} from "../opa/AuthDecisionQueryClient";
import AuthDecision, { isTrueEquivalent } from "../opa/AuthDecision";

export const mustBeLoggedIn = (jwtSecret: string) =>
    function (this: any, req: Request, res: Response, next: () => void) {
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
    getUserIdFromReq(req, jwtSecret).caseOf({
        just: (userId) => {
            const apiClient = new ApiClient(baseAuthUrl, jwtSecret, userId);
            apiClient
                .getUser(userId)
                .then((maybeUser) => {
                    maybeUser.caseOf({
                        just: (user) => {
                            req.user = {
                                // the default session data type is UserToken
                                // But any auth plugin provider could choose to customise the session by adding more fields
                                // avoid losing customise session data here
                                ...(req.user ? req.user : {}),
                                ...user
                            };
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
            if (req.user && (req.user as any).isAdmin) {
                next();
            } else {
                console.warn("Rejecting because user is not an admin");
                res.status(401).send("Not authorized.");
            }
        });
    };
};

/**
 * Make auth decision based on auth decision request config.
 * Depends on the config provided, either partial eval (conditional decision on a set of records/objects)
 * Or unconditional decision for a single record / object will be returned via `res.locals.authDecision`.
 *
 * @export
 * @param {AuthDecisionQueryClient} authDecisionClient
 * @param {AuthDecisionReqConfig} config
 * @return {*}
 */
export function withAuthDecision(
    authDecisionClient: AuthDecisionQueryClient,
    config: AuthDecisionReqConfig
) {
    return async (req: Request, res: Response, next: () => void) => {
        try {
            const jwtToken = req.get("X-Magda-Session");
            const authDecision = await authDecisionClient.getAuthDecision(
                jwtToken,
                config
            );
            res.locals.authDecision = authDecision;
            next();
        } catch (e) {
            console.error(`Failed to get auth decision: ${e}`);
            res.status(500).send(
                "An error occurred while retrieving auth decision for the request."
            );
        }
    };
}

/**
 * Require unconditional auth decision based on auth decision request config.
 * When making decision on a group of records/objects, this method makes sure
 * the user has permission to all records/objects regardless individual record / object's attributes.
 *
 * @export
 * @param {AuthDecisionQueryClient} authDecisionClient
 * @param {AuthDecisionReqConfig} config
 * @param {boolean} [requiredDecision=true]
 * @return {*}
 */
export function requireUnconditionalAuthDecision(
    authDecisionClient: AuthDecisionQueryClient,
    config: AuthDecisionReqConfig,
    requiredDecision: boolean = true
) {
    return (req: Request, res: Response, next: () => void) => {
        withAuthDecision(authDecisionClient, config)(req, res, () => {
            const authDecision = res.locals.authDecision as AuthDecision;
            if (
                authDecision?.hasResidualRules === false &&
                isTrueEquivalent(authDecision?.result) == requiredDecision
            ) {
                return next();
            } else {
                res.status(403).send(
                    `you are not permitted to perform \`${config.operationUri}\` on required resources.`
                );
            }
        });
    };
}

/**
 * require permission based on input data provided.
 * Different from withAuthDecision, its method always set `unknowns` = Nil i.e. it will always attempt to make unconditional decision.
 * It's for make decision for one single record / object. For partial eval for a set of records / objects, please use `withAuthDecision` or `requireUnconditionalAuthDecision`
 *
 * @export
 * @param {AuthDecisionQueryClient} authDecisionClient
 * @param {string} operationUri
 * @param {(req: Request, res: Response) => { [key: string]: any }} [inputDataFunc]
 * @return {*}
 */
export function requirePermission(
    authDecisionClient: AuthDecisionQueryClient,
    operationUri: string,
    inputDataFunc?: (req: Request, res: Response) => { [key: string]: any }
) {
    return (req: Request, res: Response, next: () => void) => {
        const config = {
            operationUri,
            unknowns: []
        } as AuthDecisionReqConfig;
        if (inputDataFunc) {
            config.input = inputDataFunc(req, res);
        }
        withAuthDecision(authDecisionClient, config)(req, res, () => {
            const authDecision = res.locals.authDecision as AuthDecision;
            if (authDecision?.hasResidualRules) {
                console.warn(`Failed to make unconditional auth decision for operation '${operationUri}'. 
                "Input: ${config?.input}. `);
                res.status(403).send(
                    `you are not permitted to perform '${operationUri}': no unconditional decision can be made.`
                );
            } else {
                if (isTrueEquivalent(authDecision?.result)) {
                    return next();
                } else {
                    res.status(403).send(
                        `you are not permitted to perform \`${config.operationUri}\` on required resources.`
                    );
                }
            }
        });
    };
}

/**
 * Try to locate userId from JwtToken.
 * If can't find JWT token, return undefined via `res.locals.userId`
 *
 * @export
 * @param {Request} req
 * @param {Response} res
 * @param {() => void} next
 */
export function getUserId(req: Request, res: Response, next: () => void) {
    getUserIdFromReq(req, req.get("X-Magda-Session")).caseOf({
        just: (userId) => {
            res.locals.userId = userId;
            next();
        },
        nothing: () => {
            res.locals.userId = undefined;
            next();
        }
    });
}

/**
 * get current user ID from JWT token
 * If can't locate userId, response 403 error
 *
 * @export
 * @param {Request} req
 * @param {Response} res
 * @param {() => void} next
 */
export function requireUserId(req: Request, res: Response, next: () => void) {
    getUserId(req, res, () => {
        if (!res.locals.userId) {
            res.status(403).send(
                "Anonymous users access are not permitted: userId is required."
            );
        } else {
            return next();
        }
    });
}
