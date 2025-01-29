import express from "express";
import helmet, { HelmetOptions } from "helmet";

type ContentSecurityPolicyDirectiveValue = any;

function createHelmetRouter(
    helmConfig: HelmetOptions,
    perPathHelmetConfig?: Record<string, HelmetOptions>,
    csp?: ContentSecurityPolicyDirectiveValue
): express.Router {
    const router = express.Router();
    const defaultConfig: HelmetOptions = helmConfig ? { ...helmConfig } : {};
    if (typeof csp === "boolean") {
        // csp config is supported for backward compatibility and should be mapped to helmet's `contentSecurityPolicy.directives` option
        // However, in case a boolean is supplied, it should be treated as `contentSecurityPolicy` option
        defaultConfig.contentSecurityPolicy = csp;
    } else if (typeof csp === "object") {
        if (typeof defaultConfig?.contentSecurityPolicy !== "object") {
            defaultConfig.contentSecurityPolicy = {
                directives: {}
            };
        }
        if (!defaultConfig?.contentSecurityPolicy?.directives) {
            defaultConfig.contentSecurityPolicy.directives = {};
        }
        defaultConfig.contentSecurityPolicy.directives = {
            ...defaultConfig.contentSecurityPolicy.directives,
            ...csp
        };
    }
    const paths =
        typeof perPathHelmetConfig === "object"
            ? Object.keys(perPathHelmetConfig)
            : [];
    if (!(paths.length > 0)) {
        router.use(helmet(defaultConfig));
        return router;
    }
    paths.forEach((path) => {
        const config = {
            ...defaultConfig,
            ...(perPathHelmetConfig[path] as any)
        };
        const helmetMiddleware = helmet(config);
        router.use(path, (req, res, next) => {
            res.locals.helmetUsed = true;
            helmetMiddleware(req, res, next);
        });
    });
    const defaultHelmetMiddleware = helmet(defaultConfig);
    router.use((req, res, next) => {
        if (!res?.locals?.helmetUsed) {
            defaultHelmetMiddleware(req, res, next);
        } else {
            next();
        }
    });
    return router;
}

export default createHelmetRouter;
