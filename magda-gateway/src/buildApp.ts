import { require } from "@magda/esm-utils";
import cors, { CorsOptions } from "cors";
import express from "express";
import helmet, {
    IHelmetConfiguration,
    IHelmetContentSecurityPolicyConfiguration
} from "helmet";
import compression from "compression";
import basicAuth from "express-basic-auth";
import _ from "lodash";

import {
    installStatusRouter,
    createServiceProbe
} from "magda-typescript-common/src/express/status.js";
import getBasePathFromUrl from "magda-typescript-common/src/getBasePathFromUrl.js";
import createGenericProxyRouter from "./createGenericProxyRouter.js";
import createAuthRouter from "./createAuthRouter.js";
import createCkanRedirectionRouter from "./createCkanRedirectionRouter.js";
import createHttpsRedirectionMiddleware from "./createHttpsRedirectionMiddleware.js";
import createOpenfaasGatewayProxy from "./createOpenfaasGatewayProxy.js";
import Authenticator, { SessionCookieOptions } from "./Authenticator.js";
import defaultConfig from "./defaultConfig.js";
import {
    ProxyTarget,
    DetailedProxyTarget
} from "./createGenericProxyRouter.js";
import setupTenantMode from "./setupTenantMode.js";
import createPool from "./createPool.js";
import { AuthPluginBasicConfig } from "./createAuthPluginRouter.js";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient.js";

type Route = {
    to: string;
    auth?: boolean;
    methods?: { method: string; target: string }[];
};

type Routes = {
    [host: string]: Route;
};

export type Config = {
    listenPort: number;
    externalUrl: string;
    dbHost: string;
    dbPort: number;
    proxyRoutesJson: {
        [localRoute: string]: ProxyTarget;
    };
    webProxyRoutesJson: {
        [localRoute: string]: ProxyTarget;
    };
    authPluginConfigJson: AuthPluginBasicConfig[];
    helmetJson: IHelmetConfiguration;
    cspJson: IHelmetContentSecurityPolicyConfiguration;
    corsJson: CorsOptions;
    cookieJson: SessionCookieOptions;
    authorizationApi: string;
    sessionSecret: string;
    jwtSecret: string;
    userId: string;
    web: string;
    defaultWebRouteConfig?: DetailedProxyTarget;
    previewMap?: string;
    enableHttpsRedirection?: boolean;
    enableWebAccessControl?: boolean;
    webAccessUsername?: string;
    webAccessPassword?: string;
    enableAuthEndpoint?: boolean;
    enableCkanRedirection?: boolean;
    ckanRedirectionDomain?: string;
    ckanRedirectionPath?: string;
    fetchTenantsMinIntervalInMs?: number;
    tenantUrl?: string;
    enableMultiTenants?: boolean;
    openfaasGatewayUrl?: string;
    defaultCacheControl?: string;
    magdaAdminPortalName?: string;
    proxyTimeout?: string;
    skipAuth?: boolean;
    registryQueryCacheMaxKeys: number;
    registryQueryCacheStdTTL: number;
};

export default function buildApp(app: express.Application, config: Config) {
    const baseUrl = getBasePathFromUrl(config?.externalUrl);
    const tenantMode = setupTenantMode(config);
    const mainRouter = express.Router();
    const proxyTimeout = parseInt(config?.proxyTimeout);
    console.log("proxyTimeout: ", proxyTimeout);

    let routes = _.isEmpty(config.proxyRoutesJson)
        ? defaultConfig.proxyRoutes
        : ((config.proxyRoutesJson as unknown) as Routes);

    if (!tenantMode.multiTenantsMode && routes) {
        // --- skip tenant api route if multiTenantsMode is off
        const filteredRoute = {} as any;
        Object.keys(routes)
            .filter((key) => key !== "tenant")
            .forEach((key) => (filteredRoute[key] = (routes as any)[key]));
        routes = filteredRoute;
    }

    const extraWebRoutes = config.webProxyRoutesJson
        ? ((config.webProxyRoutesJson as unknown) as Routes)
        : defaultConfig.extraWebRoutes;

    const dbPool = createPool(config);
    const authenticator = new Authenticator({
        sessionSecret: config.sessionSecret,
        cookieOptions: _.isEmpty(config.cookieJson) ? {} : config.cookieJson,
        authApiBaseUrl: config.authorizationApi,
        dbPool,
        externalUrl: config.externalUrl,
        appBasePath: baseUrl
    });

    const skipAuth = config.skipAuth === true ? true : false;
    const authDecisionClient = new AuthDecisionQueryClient(
        config.authorizationApi,
        skipAuth
    );

    console.log(`SkipAuth: ${skipAuth}`);

    // Log everything
    app.use(require("morgan")("combined"));

    const probes: any = {};

    /**
     * Should use config.routes to setup probes
     * so that no prob will be setup when run locally for testing
     */
    _.forEach(routes, (value: any, key: string) => {
        // --- only install status probs if statusCheck == true
        if (value?.statusCheck !== true) {
            return;
        }
        probes[key] = createServiceProbe(value.to);
    });
    installStatusRouter(app, { probes });

    // Redirect http url to https
    app.set("trust proxy", true);
    app.use(createHttpsRedirectionMiddleware(config.enableHttpsRedirection));

    // GZIP responses where appropriate
    app.use(compression());

    // Set sensible secure headers
    app.disable("x-powered-by");
    app.use(helmet(_.merge({}, defaultConfig.helmet, config.helmetJson)));
    app.use(
        helmet.contentSecurityPolicy(
            _.merge({}, defaultConfig.csp, config.cspJson)
        )
    );

    // Set up CORS headers for all requests
    const configuredCors = cors(
        _.merge({}, defaultConfig.cors, config.corsJson)
    );
    app.options("*", configuredCors);
    app.use(configuredCors);

    const apiRouterOptions = {
        jwtSecret: config.jwtSecret,
        tenantMode,
        authenticator,
        defaultCacheControl: config.defaultCacheControl,
        routes,
        proxyTimeout,
        authClient: authDecisionClient
    };

    // --- enable http basic authentication for all users
    if (config.enableWebAccessControl) {
        app.use(
            basicAuth({
                users: {
                    [config.webAccessUsername]: config.webAccessPassword
                },
                challenge: true,
                unauthorizedResponse: `You cannot access the system unless provide correct username & password.`
            })
        );
    }

    if (config.enableAuthEndpoint) {
        mainRouter.use(
            "/auth",
            createAuthRouter({
                authenticator: authenticator,
                plugins: config.authPluginConfigJson
            })
        );
    }

    if (config.openfaasGatewayUrl) {
        mainRouter.use(
            "/api/v0/openfaas",
            createOpenfaasGatewayProxy({
                gatewayUrl: config.openfaasGatewayUrl,
                authClient: authDecisionClient,
                apiRouterOptions
            })
        );
    }

    mainRouter.use("/api/v0", createGenericProxyRouter(apiRouterOptions));

    if (extraWebRoutes && Object.keys(extraWebRoutes).length) {
        mainRouter.use(
            "/",
            createGenericProxyRouter({
                ...apiRouterOptions,
                routes: extraWebRoutes
            })
        );
    }

    if (config.enableCkanRedirection) {
        if (!routes.registry) {
            console.error(
                "Cannot locate routes.registry for ckan redirection!"
            );
        } else {
            const registryReadOnlyApi = routes.registry?.methods?.find(
                (item) => item.method.toLowerCase() === "get"
            )?.target;
            mainRouter.use(
                createCkanRedirectionRouter({
                    ckanRedirectionDomain: config.ckanRedirectionDomain,
                    ckanRedirectionPath: config.ckanRedirectionPath,
                    registryApiBaseUrlInternal: registryReadOnlyApi
                        ? registryReadOnlyApi
                        : routes.registry?.to,
                    tenantId: 0, // FIXME: Rather than being hard-coded to the default tenant, the CKAN router needs to figure out the correct tenant.,
                    cacheStdTTL: config.registryQueryCacheStdTTL,
                    cacheMaxKeys: config.registryQueryCacheMaxKeys
                })
            );
        }
    }

    const defaultWebRouteConfig = (config.defaultWebRouteConfig
        ? config.defaultWebRouteConfig
        : { methods: ["GET"] }) as DetailedProxyTarget;
    if (!defaultWebRouteConfig.to) {
        defaultWebRouteConfig.to = config.web;
    }
    // Proxy any other URL to default web route, usually, magda-web
    mainRouter.use(
        createGenericProxyRouter({
            ...apiRouterOptions,
            routes: { "/": defaultWebRouteConfig }
        })
    );

    if (baseUrl === "/") {
        app.use(mainRouter);
    } else {
        app.use(baseUrl, mainRouter);
    }

    return app;
}
