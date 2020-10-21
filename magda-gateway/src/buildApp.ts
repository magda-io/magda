import cors, { CorsOptions } from "cors";
import express from "express";
import path from "path";
import ejs from "ejs";
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
} from "magda-typescript-common/src/express/status";
import createGenericProxyRouter from "./createGenericProxyRouter";
import createAuthRouter from "./createAuthRouter";
import createGenericProxy from "./createGenericProxy";
import createCkanRedirectionRouter from "./createCkanRedirectionRouter";
import createHttpsRedirectionMiddleware from "./createHttpsRedirectionMiddleware";
import createOpenfaasGatewayProxy from "./createOpenfaasGatewayProxy";
import Authenticator, { SessionCookieOptions } from "./Authenticator";
import defaultConfig from "./defaultConfig";
import { ProxyTarget } from "./createGenericProxyRouter";
import setupTenantMode from "./setupTenantMode";
import createPool from "./createPool";
import { AuthPluginBasicConfig } from "./createAuthPluginRouter";

// Tell typescript about the semi-private __express field of ejs.
declare module "ejs" {
    var __express: any;
}

type Route = {
    to: string;
    auth?: boolean;
};

type Routes = {
    [host: string]: Route;
};

export type Config = {
    listenPort: number;
    externalUrl: string;
    dbHost: string;
    dbPort: number;
    authDBHost: string;
    authDBPort: number;
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
    previewMap?: string;
    enableHttpsRedirection?: boolean;
    enableWebAccessControl?: boolean;
    webAccessUsername?: string;
    webAccessPassword?: string;
    enableAuthEndpoint?: boolean;
    facebookClientId?: string;
    facebookClientSecret?: string;
    googleClientId?: string;
    googleClientSecret?: string;
    aafClientUri?: string;
    aafClientSecret?: string;
    arcgisClientId?: string;
    arcgisClientSecret?: string;
    arcgisInstanceBaseUrl?: string;
    esriOrgGroup?: string;
    ckanUrl?: string;
    enableCkanRedirection?: boolean;
    ckanRedirectionDomain?: string;
    ckanRedirectionPath?: string;
    fetchTenantsMinIntervalInMs?: number;
    tenantUrl?: string;
    enableMultiTenants?: boolean;
    vanguardWsFedIdpUrl?: string;
    vanguardWsFedRealm?: string;
    vanguardWsFedCertificate?: string;
    openfaasGatewayUrl?: string;
    openfaasAllowAdminOnly?: boolean;
    enableInternalAuthProvider?: boolean;
    defaultCacheControl?: string;
    magdaAdminPortalName?: string;
};

export default function buildApp(app: express.Application, config: Config) {
    const tenantMode = setupTenantMode(config);

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
        dbPool
    });

    // Log everything
    app.use(require("morgan")("combined"));

    const probes: any = {};

    /**
     * Should use config.routes to setup probes
     * so that no prob will be setup when run locally for testing
     */
    _.forEach(routes, (value: any, key: string) => {
        // --- skip install status probs if statusCheck == false
        if (value && value.statusCheck === false) {
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

    // Configure view engine to render EJS templates.
    app.set("views", path.join(__dirname, "..", "views"));
    app.set("view engine", "ejs");
    app.engine(".ejs", ejs.__express); // This stops express trying to do its own require of 'ejs'

    const apiRouterOptions = {
        jwtSecret: config.jwtSecret,
        tenantMode,
        authenticator,
        defaultCacheControl: config.defaultCacheControl,
        routes
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
        app.use(
            "/auth",
            createAuthRouter({
                dbPool: createPool({
                    ...config,
                    database: "auth",
                    dbHost: config.authDBHost,
                    dbPort: config.authDBPort
                }),
                authenticator: authenticator,
                jwtSecret: config.jwtSecret,
                facebookClientId: config.facebookClientId,
                facebookClientSecret: config.facebookClientSecret,
                googleClientId: config.googleClientId,
                googleClientSecret: config.googleClientSecret,
                aafClientUri: config.aafClientUri,
                aafClientSecret: config.aafClientSecret,
                arcgisClientId: config.arcgisClientId,
                arcgisClientSecret: config.arcgisClientSecret,
                arcgisInstanceBaseUrl: config.arcgisInstanceBaseUrl,
                esriOrgGroup: config.esriOrgGroup,
                ckanUrl: config.ckanUrl,
                authorizationApi: config.authorizationApi,
                externalUrl: config.externalUrl,
                userId: config.userId,
                vanguardWsFedIdpUrl: config.vanguardWsFedIdpUrl,
                vanguardWsFedRealm: config.vanguardWsFedRealm,
                vanguardWsFedCertificate: config.vanguardWsFedCertificate,
                enableInternalAuthProvider: config.enableAuthEndpoint,
                plugins: config.authPluginConfigJson
            })
        );
    }

    if (config.openfaasGatewayUrl) {
        app.use(
            "/api/v0/openfaas",
            createOpenfaasGatewayProxy({
                gatewayUrl: config.openfaasGatewayUrl,
                allowAdminOnly: config.openfaasAllowAdminOnly,
                baseAuthUrl: config.authorizationApi,
                jwtSecret: config.jwtSecret,
                apiRouterOptions
            })
        );
    }

    app.use("/api/v0", createGenericProxyRouter(apiRouterOptions));

    if (extraWebRoutes && Object.keys(extraWebRoutes).length) {
        app.use(
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
            app.use(
                createCkanRedirectionRouter({
                    ckanRedirectionDomain: config.ckanRedirectionDomain,
                    ckanRedirectionPath: config.ckanRedirectionPath,
                    registryApiBaseUrlInternal: routes.registry.to,
                    tenantId: 0 // FIXME: Rather than being hard-coded to the default tenant, the CKAN router needs to figure out the correct tenant.
                })
            );
        }
    }

    // Proxy any other URL to magda-web
    app.use("/", createGenericProxy(config.web, apiRouterOptions));

    return app;
}
