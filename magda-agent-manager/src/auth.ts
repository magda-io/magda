import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { ADMIN_USERS_ROLE_ID } from "magda-typescript-common/src/authorization-api/constants.js";
import { AuthenticatedUser } from "./types.js";

declare global {
    namespace Express {
        interface Request {
            agentUser?: AuthenticatedUser;
        }
    }
}

export interface AuthOptions {
    jwtSecret: string;
    authApiUrl: string;
}

export class AgentAuthorizationError extends Error {
    constructor(message: string, public readonly status: number) {
        super(message);
    }
}

export async function authenticateAdminToken(
    token: string | undefined,
    options: AuthOptions
): Promise<AuthenticatedUser> {
    if (!token) {
        throw new AgentAuthorizationError("Magda authentication required", 401);
    }
    let payload: JwtPayload;
    try {
        payload = jwt.verify(token, options.jwtSecret, {
            algorithms: ["HS256"]
        }) as JwtPayload;
    } catch {
        throw new AgentAuthorizationError("Invalid Magda session", 401);
    }
    if (typeof payload.userId !== "string" || !payload.userId) {
        throw new AgentAuthorizationError("Invalid Magda session", 401);
    }
    let response: globalThis.Response;
    try {
        response = await fetch(
            `${options.authApiUrl.replace(/\/$/, "")}/public/users/whoami`,
            {
                headers: { "X-Magda-Session": token },
                signal: AbortSignal.timeout(10_000)
            }
        );
    } catch (error) {
        console.error("Agent Manager authorization lookup failed", error);
        throw new AgentAuthorizationError(
            "Unable to verify Agent Workspace access",
            503
        );
    }
    if (!response.ok) {
        throw new AgentAuthorizationError(
            "Unable to verify Agent Workspace access",
            response.status === 401 ? 401 : 503
        );
    }
    const user = (await response.json()) as {
        id?: string;
        roles?: Array<{ id?: string }>;
    };
    const isAdmin = user.roles?.some((role) => role.id === ADMIN_USERS_ROLE_ID);
    if (user.id !== payload.userId || !isAdmin) {
        throw new AgentAuthorizationError(
            "Agent Workspace is currently limited to administrators",
            403
        );
    }
    return { id: payload.userId, sessionToken: token };
}

export function createAdminAuth(options: AuthOptions) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            req.agentUser = await authenticateAdminToken(
                req.get("X-Magda-Session"),
                options
            );
            next();
        } catch (error) {
            const authError = error as AgentAuthorizationError;
            res.status(authError.status || 503).json({
                message:
                    authError.message ||
                    "Unable to verify Agent Workspace access"
            });
        }
    };
}
