import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
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

/**
 * The single grantable operation for a user's **own** Agent Workspace (#3858).
 * Lifecycle, runtime HTTP/WebSocket and skill-sync retry all require it. The
 * target Sandbox is always derived from the authenticated user, never from the
 * request, so the operation never reaches another user's Workspace.
 */
export const AGENT_WORKSPACE_ACCESS_OPERATION = "agentWorkspace/access";

export class AgentAuthorizationError extends Error {
    constructor(message: string, public readonly status: number) {
        super(message);
    }
}

export async function authenticateUserToken(
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
    const authenticated = (await response.json()) as { id?: string };
    if (authenticated.id !== payload.userId) {
        throw new AgentAuthorizationError("Invalid Magda session", 401);
    }
    return { id: payload.userId, sessionToken: token };
}

/**
 * Ask the policy engine whether the verified session holds
 * `agentWorkspace/access`. The decision carries no object input: the operation
 * is self-only and the caller never selects a Workspace. Global administrators
 * are allowed by the existing entrypoint administrator override.
 */
async function hasAgentWorkspaceAccess(
    token: string,
    options: AuthOptions
): Promise<boolean> {
    let response: globalThis.Response;
    try {
        // `unknowns=` requests a full (not partial) evaluation.
        response = await fetch(
            `${options.authApiUrl.replace(
                /\/$/,
                ""
            )}/opa/decision/${AGENT_WORKSPACE_ACCESS_OPERATION}?unknowns=`,
            {
                headers: { "X-Magda-Session": token },
                signal: AbortSignal.timeout(10_000)
            }
        );
    } catch (error) {
        console.error("Agent Workspace authorization lookup failed", error);
        throw new AgentAuthorizationError(
            "Unable to verify Agent Workspace access",
            503
        );
    }
    if (!response.ok) {
        throw new AgentAuthorizationError(
            "Unable to verify Agent Workspace access",
            503
        );
    }
    const decision = (await response.json().catch(() => undefined)) as
        | { hasResidualRules?: boolean; result?: unknown }
        | undefined;
    return decision?.hasResidualRules === false && decision.result === true;
}

export async function authenticateWorkspaceToken(
    token: string | undefined,
    options: AuthOptions
): Promise<AuthenticatedUser> {
    const user = await authenticateUserToken(token, options);
    if (!(await hasAgentWorkspaceAccess(user.sessionToken, options))) {
        throw new AgentAuthorizationError(
            "You do not have permission to access Agent Workspace",
            403
        );
    }
    return user;
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

export function createWorkspaceAuth(options: AuthOptions) {
    return createAuthMiddleware(authenticateWorkspaceToken, options);
}
