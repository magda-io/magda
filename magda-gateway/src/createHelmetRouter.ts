import express from "express";
import helmet, { HelmetOptions } from "helmet";

type ContentSecurityPolicyDirectiveValue = any;

// helmet v8 behaviour for CSP directive values:
//   null for any directive other than default-src → explicitly disables that directive (no default applied)
//   null for default-src → throws; must use the dangerouslyDisableDefaultSrc Symbol instead
//   false → throws for all directives
// So we only need to remap defaultSrc: null to the Symbol; all other nulls are valid.
const dangerouslyDisableDefaultSrc = ((helmet.contentSecurityPolicy as unknown) as {
    dangerouslyDisableDefaultSrc: symbol;
}).dangerouslyDisableDefaultSrc;

function sanitizeCspDirectives(
    directives: Record<string, unknown>
): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(directives).map(([key, val]) => [
            key,
            key === "defaultSrc" && val === null
                ? dangerouslyDisableDefaultSrc
                : val
        ])
    );
}

function sanitizeHelmetConfig(config: HelmetOptions): HelmetOptions {
    const csp = config?.contentSecurityPolicy;
    if (
        csp &&
        typeof csp === "object" &&
        csp.directives &&
        typeof csp.directives === "object"
    ) {
        return {
            ...config,
            contentSecurityPolicy: {
                ...csp,
                directives: sanitizeCspDirectives(
                    csp.directives as Record<string, unknown>
                ) as typeof csp.directives
            }
        };
    }
    return config;
}

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
    const sanitizedDefaultConfig = sanitizeHelmetConfig(defaultConfig);
    const paths =
        typeof perPathHelmetConfig === "object"
            ? Object.keys(perPathHelmetConfig)
            : [];
    if (!(paths.length > 0)) {
        router.use(helmet(sanitizedDefaultConfig));
        return router;
    }
    paths.forEach((path) => {
        const config = sanitizeHelmetConfig({
            ...defaultConfig,
            ...(perPathHelmetConfig[path] as any)
        });
        const helmetMiddleware = helmet(config);
        router.use(path, (req, res, next) => {
            res.locals.helmetUsed = true;
            helmetMiddleware(req, res, next);
        });
    });
    const defaultHelmetMiddleware = helmet(sanitizedDefaultConfig);
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
