import httpProxy from "http-proxy";
import express from "express";
import { IncomingHttpHeaders } from "http";

import groupBy = require("lodash/groupBy");

import {
    MAGDA_TENANT_ID_HEADER,
    MAGDA_ADMIN_PORTAL_ID
} from "magda-typescript-common/src/registry/TenantConsts";
import { GenericProxyRouterOptions } from "./createGenericProxyRouter";

const DO_NOT_PROXY_HEADERS = [
    "Proxy-Authorization",
    "Proxy-Authenticate",
    "Authorization",
    "Cookie",
    "Cookie2",
    "Set-Cookie",
    "Set-Cookie2"
];

const doNotProxyHeaderLookup = groupBy(
    DO_NOT_PROXY_HEADERS.map((x) => x.toLowerCase()),
    (x: string) => x
);

/**
 * For maximum compatibility, we don't assume header name will be all lowercase here.
 * We already tried to cover the situation that the header name might be in different case by accessing either:
 * `Cache-Control` or `cache-control`.
 * This function make it more generic and cover the `cache-Control` case as well.
 *
 * @param {IncomingHttpHeaders} headers
 * @param {string} headerName
 * @returns
 */
function getHeaderValue(headers: IncomingHttpHeaders, headerName: string) {
    const headerKeys = Object.keys(headers);
    // use `for` so we can break & return value easier
    for (let i = 0; i < headerKeys.length; i++) {
        if (headerKeys[i].toLowerCase() === headerName.toLowerCase()) {
            return headers[headerKeys[i]];
        }
    }
    return undefined;
}

/**
 * Set header value by header name
 * This function will make sure any existing header value (even with different cases) is overwritten
 *
 * @param {IncomingHttpHeaders} headers
 * @param {string} headerName
 * @param {string} value
 * @returns
 */
function setHeaderValue(
    headers: IncomingHttpHeaders,
    headerName: string,
    value: string
) {
    const headerKeys = Object.keys(headers);
    // use `for` so we can break & return value easier
    for (let i = 0; i < headerKeys.length; i++) {
        if (headerKeys[i].toLowerCase() === headerName.toLowerCase()) {
            headers[headerKeys[i]] = undefined;
            headers[headerName] = value;
            return;
        }
    }
    headers[headerName] = value;
}

export default function createBaseProxy(
    options: GenericProxyRouterOptions
): httpProxy {
    const proxyOptions: httpProxy.ServerOptions = {
        ignorePath: true,
        changeOrigin: true
    };

    if (
        typeof options.proxyTimeout === "number" &&
        !isNaN(options.proxyTimeout)
    ) {
        proxyOptions.proxyTimeout = options.proxyTimeout;
        proxyOptions.timeout = options.proxyTimeout;
    }

    const proxy = httpProxy.createProxyServer(proxyOptions);

    (proxy as any).before(
        "web",
        "stream",
        (req: any, _res: any, _options: any) => {
            if (req.headers.expect) {
                req.__expectHeader = req.headers.expect;
                delete req.headers.expect;
            }
        }
    );

    proxy.on("error", function (err: any, req: any, res: any) {
        res.writeHead(500, {
            "Content-Type": "text/plain"
        });

        console.error(err);

        res.end("Something went wrong.");
    });

    proxy.on("proxyReq", function (proxyReq, req, res) {
        // as we set `ignorePath`=true, we need append req.path to proxyReq.path
        // we need to use req.url to include query string
        if (req.url !== "/") {
            if (
                proxyReq.path[proxyReq.path.length - 1] === "/" &&
                req.url[0] === "/"
            ) {
                proxyReq.path = proxyReq.path + req.url.substr(1);
            } else {
                proxyReq.path = proxyReq.path + req.url;
            }
        }

        // Presume that we've already got whatever auth details we need out of the request and so remove it now.
        // If we keep it it causes scariness upstream - like anything that goes through the TerriaJS proxy will
        // be leaking auth details to wherever it proxies to.
        if ((req as any).__expectHeader) {
            proxyReq.setHeader("Expect", (req as any).__expectHeader);
        }

        const headerNames = proxyReq.getHeaderNames();
        for (let i = 0; i < headerNames.length; i++) {
            const headerName = headerNames[i];
            if (!!doNotProxyHeaderLookup[headerName]) {
                proxyReq.removeHeader(headerName);
            }
        }
    });

    proxy.on("proxyRes", function (proxyRes, req, res) {
        const reqCacheControlHeaderVal = getHeaderValue(
            req.headers,
            "Cache-Control"
        );
        if (
            typeof reqCacheControlHeaderVal === "string" &&
            reqCacheControlHeaderVal.toLowerCase().indexOf("no-cache") !== -1
        ) {
            // when incoming request specifically ask for a no-cache response
            // we set the following header to make sure not only CDN will not cache it but also web browser will not cache it
            setHeaderValue(
                proxyRes.headers,
                "Cache-Control",
                "max-age=0, no-cache, must-revalidate, proxy-revalidate"
            );
            setHeaderValue(
                proxyRes.headers,
                "Expires",
                "Thu, 01 Jan 1970 00:00:00 GMT"
            );
            setHeaderValue(
                proxyRes.headers,
                "Last-Modified",
                // toGMTString is deprecated but `Last-Modified` requires that format:
                // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Last-Modified
                // A test case will be added to make sure we know when the function is not available at runtime
                (new Date() as any)["toGMTString"]()
            );
        } else if (
            // Add a default cache time of 60 seconds on GETs so the CDN can cache in times of high load.
            // the default cache header can be configured to a different value via helm
            req.method === "GET" &&
            options.defaultCacheControl &&
            !reqCacheControlHeaderVal &&
            !getHeaderValue(proxyRes.headers, "Cache-Control")
        ) {
            proxyRes.headers["Cache-Control"] = options.defaultCacheControl;
        }

        /**
         * Remove security sensitive headers
         * `server` header is from scala APIs
         * Proxied content has to be filtered from here
         * while other content (produced locally by gateway) has been
         * taken care of by `app.disable("x-powered-by");` in index.js
         */
        Object.keys(proxyRes.headers).forEach((headerKey) => {
            const headerKeyLowerCase = headerKey.toLowerCase();
            if (
                headerKeyLowerCase === "x-powered-by" ||
                headerKeyLowerCase === "server"
            ) {
                proxyRes.headers[headerKey] = undefined;
            }
        });
    });

    proxy.on("proxyReq", async function (proxyReq, req, res) {
        if (options.tenantMode.multiTenantsMode === true) {
            const theRequest = <express.Request>req;
            const domainName = theRequest.hostname.toLowerCase();

            if (domainName === options.tenantMode.magdaAdminPortalName) {
                proxyReq.setHeader(
                    MAGDA_TENANT_ID_HEADER,
                    MAGDA_ADMIN_PORTAL_ID
                );
            } else {
                const tenant = options.tenantMode.tenantsLoader.tenantsTable.get(
                    domainName
                );

                if (tenant !== undefined) {
                    proxyReq.setHeader(MAGDA_TENANT_ID_HEADER, tenant.id);
                } else {
                    // If await reloadTenants() then set header, an error message will occur:
                    //   "Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent to the client"
                    // So we just let user try again.
                    // See https://github.com/nodejitsu/node-http-proxy/issues/1328
                    options.tenantMode.tenantsLoader.reloadTenants();
                    res.writeHead(400, { "Content-Type": "text/plain" });
                    res.end(
                        `Unable to process ${domainName} right now. Please try again shortly.`
                    );
                }
            }
        } else {
            proxyReq.setHeader(MAGDA_TENANT_ID_HEADER, MAGDA_ADMIN_PORTAL_ID);
        }
    });

    return proxy;
}
