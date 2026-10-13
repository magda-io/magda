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

interface VerifiedUser {
    user: AuthenticatedUser;
    roles: Array<{ id?: string }>;
}

async function authenticateToken(
    token: string | undefined,
    options: AuthOptions
): Promise<VerifiedUser> {
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
            "Unable to verify Magda authentication",
            503
        );
    }
    if (!response.ok) {
        throw new AgentAuthorizationError(
            "Unable to verify Magda authentication",
            response.status === 401 ? 401 : 503
        );
    }
    const authenticated = (await response.json()) as {
        id?: string;
        roles?: Array<{ id?: string }>;
    };
    if (authenticated.id !== payload.userId) {
        throw new AgentAuthorizationError("Invalid Magda session", 401);
    }
    return {
        user: { id: payload.userId, sessionToken: token },
        roles: Array.isArray(authenticated.roles) ? authenticated.roles : []
    };
}

export async function authenticateUserToken(
    token: string | undefined,
    options: AuthOptions
): Promise<AuthenticatedUser> {
    return (await authenticateToken(token, options)).user;
}

export async function authenticateAdminToken(
    token: string | undefined,
    options: AuthOptions
): Promise<AuthenticatedUser> {
    const authenticated = await authenticateToken(token, options);
    const isAdmin = authenticated.roles.some(
        (role) => role.id === ADMIN_USERS_ROLE_ID
    );
    if (!isAdmin) {
        throw new AgentAuthorizationError(
            "Agent Workspace is currently limited to administrators",
            403
        );
    }
    return authenticated.user;
}

function createAuthMiddleware(
    authenticate: (
        token: string | undefined,
        options: AuthOptions
    ) => Promise<AuthenticatedUser>,
    options: AuthOptions
) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            req.agentUser = await authenticate(
                req.get("X-Magda-Session"),
                options
            );
            next();
        } catch (error) {
            const authError = error as AgentAuthorizationError;
            res.status(authError.status || 503).json({
                message:
                    authError.message || "Unable to verify Magda authentication"
            });
        }
    };
}

export function createAuthenticatedUserAuth(options: AuthOptions) {
    return createAuthMiddleware(authenticateUserToken, options);
}

export function createAdminAuth(options: AuthOptions) {
    return createAuthMiddleware(authenticateAdminToken, options);
}
