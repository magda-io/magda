import { Request, Response, NextFunction } from "express";
import { getUserId as getUserIdFromReq } from "../session/GetUserId.js";
import AuthDecisionQueryClient, {
    AuthDecisionReqConfig
} from "../opa/AuthDecisionQueryClient.js";
import AuthDecision, { isTrueEquivalent } from "../opa/AuthDecision.js";
import ServerError from "../ServerError.js";

export type AuthDecisionReqConfigOrConfigFuncParam =
    | AuthDecisionReqConfig
    | ((
          req: Request,
          res: Response,
          next: NextFunction
      ) =>
          | AuthDecisionReqConfig
          | null
          | Promise<AuthDecisionReqConfig | null>);

/**
 * Make auth decision based on auth decision request config.
 * Depends on the config provided, either partial eval (conditional decision on a set of records/objects)
 * Or unconditional decision for a single record / object will be returned via `res.locals.authDecision`.
 *
 * @export
 * @param {AuthDecisionQueryClient} authDecisionClient
 * @param {AuthDecisionReqConfigOrConfigFuncParam} configOrConfigFunc An auth decision config object or a function returns an auth decision config object.
 * When a function is supplied, the function can opt to:
 * - return an auth decision object based on incoming request.
 * - throw an Error
 * - send the response and return a `null` value to skip the rest of request processing.
 * - call `next` function and return a `null` value to skip the rest of processing of current middleware
 * @return {*}
 */
export function withAuthDecision(
    authDecisionClient: AuthDecisionQueryClient,
    configOrConfigFunc: AuthDecisionReqConfigOrConfigFuncParam
) {
    return async (req: Request, res: Response, next: () => void) => {
        try {
            const config =
                typeof configOrConfigFunc === "function"
                    ? await configOrConfigFunc(req, res, next)
                    : configOrConfigFunc;
            if (!config) {
                return;
            }
            const jwtToken = config?.jwtToken
                ? config.jwtToken
                : req.get("X-Magda-Session");
            const authDecision = await authDecisionClient.getAuthDecision(
                config,
                jwtToken
            );
            res.locals.authDecision = authDecision;
            res.locals.authDecisionConfig = config;
            next();
        } catch (e) {
            console.error(`withAuthDecision middleware error: ${e}`);
            if (e instanceof ServerError) {
                res.status(e.statusCode).send(e.message);
            } else {
                res.status(500).send(
                    `An error occurred while retrieving auth decision for the request: ${e}`
                );
            }
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
 * @param {AuthDecisionReqConfigOrConfigFuncParam} configOrConfigFunc
 * @param {boolean} [requiredDecision=true]
 * @return {*}
 */
export function requireUnconditionalAuthDecision(
    authDecisionClient: AuthDecisionQueryClient,
    configOrConfigFunc: AuthDecisionReqConfigOrConfigFuncParam,
    requiredDecision: boolean = true
) {
    return (req: Request, res: Response, next: () => void) => {
        withAuthDecision(authDecisionClient, configOrConfigFunc)(
            req,
            res,
            () => {
                const authDecision = res.locals.authDecision as AuthDecision;
                if (
                    authDecision?.hasResidualRules === false &&
                    isTrueEquivalent(authDecision?.result) == requiredDecision
                ) {
                    return next();
                } else {
                    res.status(403).send(
                        `you are not permitted to perform \`${res?.locals?.authDecisionConfig?.operationUri}\` on required resources.`
                    );
                }
            }
        );
    };
}

type InputDataOrFuncType =
    | ((req: Request, res: Response) => Record<string, any>)
    | Record<string, any>;

/**
 * require permission based on input data provided.
 * Different from withAuthDecision, its method always set `unknowns` = Nil i.e. it will always attempt to make unconditional decision.
 * It's for make decision for one single record / object. For partial eval for a set of records / objects, please use `withAuthDecision` or `requireUnconditionalAuthDecision`
 *
 * @export
 * @param {AuthDecisionQueryClient} authDecisionClient
 * @param {string} operationUri
 * @param {InputDataOrFuncType} [inputDataFunc] either a function that produce input data (auth decision context data) from `req` & `req` or a plain object
 * @return {*}
 */
export function requirePermission(
    authDecisionClient: AuthDecisionQueryClient,
    operationUri: string,
    inputDataOrFunc?: InputDataOrFuncType
) {
    return (req: Request, res: Response, next: () => void) => {
        try {
            const config = {
                operationUri,
                unknowns: []
            } as AuthDecisionReqConfig;
            if (inputDataOrFunc) {
                if (typeof inputDataOrFunc === "function") {
                    config.input = inputDataOrFunc(req, res);
                } else {
                    config.input = inputDataOrFunc;
                }
            }
            requireUnconditionalAuthDecision(authDecisionClient, config, true)(
                req,
                res,
                next
            );
        } catch (e) {
            console.error(`requirePermission middleware error: ${e}`);
            if (e instanceof ServerError) {
                res.status(e.statusCode).send(e.message);
            } else {
                res.status(500).send(
                    `requirePermission middleware error: ${e}`
                );
            }
        }
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
export function getUserId(jwtSecret: string) {
    return (req: Request, res: Response, next: () => void) => {
        getUserIdFromReq(req, jwtSecret).caseOf({
            just: (userId) => {
                res.locals.userId = userId;
                next();
            },
            nothing: () => {
                res.locals.userId = undefined;
                next();
            }
        });
    };
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
export const requireUserId = (jwtSecret: string) => (
    req: Request,
    res: Response,
    next: () => void
) =>
    getUserId(jwtSecret)(req, res, () => {
        if (!res.locals.userId) {
            res.status(403).send(
                "Anonymous users access are not permitted: userId is required."
            );
        } else {
            return next();
        }
    });
