import { Request, Response, NextFunction, RequestHandler } from "express";
import GenericError from "magda-typescript-common/src/authorization-api/GenericError";
import buildJwtFromReq from "magda-typescript-common/src/session/buildJwtFromReq";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";
import { isTrueEquivalent } from "magda-typescript-common/src/opa/AuthDecision";

const createApiAccessControlMiddleware = (
    authDecisionClient: AuthDecisionQueryClient,
    baseRoute: string,
    jwtSecret: string,
    enabled: boolean
): RequestHandler => async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (!enabled) {
        return next();
    }
    try {
        const apiRequestPath =
            baseRoute[baseRoute.length - 1] === "/"
                ? baseRoute + req.path.substring(1)
                : baseRoute + req.path;
        const apiRequestMethod = req.method.toUpperCase();
        const operationUri = `api${
            apiRequestPath[apiRequestPath.length - 1] === "/"
                ? apiRequestPath + apiRequestMethod
                : apiRequestPath + "/" + apiRequestMethod
        }`;

        const authDecision = await authDecisionClient.getAuthDecision(
            { operationUri },
            buildJwtFromReq(req, jwtSecret)
        );

        if (
            authDecision?.hasResidualRules === false &&
            isTrueEquivalent(authDecision?.result)
        ) {
            return next();
        } else {
            res.status(403).send(
                `you are not permitted to perform \`${operationUri}\` on required resources.`
            );
        }
    } catch (e) {
        console.error(e);

        if (e instanceof GenericError) {
            res.status(e.statusCode).send(e.message);
        } else {
            res.sendStatus(500);
        }
    }
};

export default createApiAccessControlMiddleware;
