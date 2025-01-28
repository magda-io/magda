import express from "express";
import helmet, { HelmetOptions } from "helmet";

type ContentSecurityPolicyOptions = HelmetOptions["contentSecurityPolicy"];

function perPathHelmet(
    helmConfig: HelmetOptions,
    perPathHelmetConfig?: Record<string, HelmetOptions>,
    csp?: ContentSecurityPolicyOptions
): express.RequestHandler {
    const defaultConfig: HelmetOptions = helmConfig ? { ...helmConfig } : {};
    if (csp) {
        if (typeof csp === "object") {
            defaultConfig.contentSecurityPolicy = {
                ...(typeof defaultConfig?.contentSecurityPolicy === "object"
                    ? defaultConfig.contentSecurityPolicy
                    : {}),
                ...csp
            };
        } else {
            defaultConfig.contentSecurityPolicy = csp;
        }
    }
    const paths =
        typeof perPathHelmetConfig === "object"
            ? Object.keys(perPathHelmetConfig)
            : [];
    if (!(paths.length > 0)) {
        return helmet(defaultConfig);
    }
    const perPathHelmetHandlers: Record<string, express.RequestHandler> = {};
    paths.forEach((path) => {
        perPathHelmetHandlers[path] = helmet({
            ...defaultConfig,
            ...(perPathHelmetConfig[path] as any)
        });
    });
    const perPathHelmetHandler: express.RequestHandler = (req, res, next) => {
        const fullPath: string =
            (req.baseUrl === "/" ? "" : req.baseUrl) + req.path;
        if (perPathHelmetHandlers[fullPath]) {
            perPathHelmetHandlers[fullPath](req, res, next);
            return;
        } else {
            helmet(defaultConfig)(req, res, next);
            return;
        }
    };
    return perPathHelmetHandler;
}

export default perPathHelmet;
