import * as httpProxy from "http-proxy";
import { tenantsTable, gatewayHostName } from "./index";

export default function createBaseProxy(): httpProxy {
    const MAGDA_ADMIN_PORTAL_NAME = "magda-admin-portal";
    const MAGDA_ADMIN_PORTAL_ID = -1;

    const proxy = httpProxy.createProxyServer({
        prependUrl: false
    } as httpProxy.ServerOptions);

    proxy.on("error", function(err: any, req: any, res: any) {
        res.writeHead(500, {
            "Content-Type": "text/plain"
        });

        console.error(err);

        res.end("Something went wrong.");
    });

    proxy.on("proxyRes", function(proxyRes, req, res) {
        // Add a default cache time of 60 seconds on GETs so the CDN can cache in times of high load.
        if (
            req.method === "GET" &&
            !proxyRes.headers["Cache-Control"] &&
            !proxyRes.headers["cache-control"] &&
            !req.headers["Cache-Control"] &&
            !req.headers["cache-control"]
        ) {
            proxyRes.headers["Cache-Control"] = "public, max-age=60";
        }
        /**
         * Remove security sensitive headers
         * `server` header is from scala APIs
         * Proxied content has to be filtered from here
         * while other content (produced locally by gateway) has been
         * taken care of by `app.disable("x-powered-by");` in index.js
         */
        Object.keys(proxyRes.headers).forEach(headerKey => {
            const headerKeyLowerCase = headerKey.toLowerCase();
            if (
                headerKeyLowerCase === "x-powered-by" ||
                headerKeyLowerCase === "server"
            ) {
                proxyRes.headers[headerKey] = undefined;
            }
        });
    });

    proxy.on("proxyReq", function(proxyReq, req, res) {
        proxyReq.setHeader("TenantId", "undefined");
        const host = req.headers.host;
        let endIndex = host.lastIndexOf(":");
        if (endIndex < 0) endIndex = host.length;

        let domainName = host.substring(0, endIndex);

        if (domainName == gatewayHostName || domainName == "localhost")
            domainName = MAGDA_ADMIN_PORTAL_NAME;

        if (domainName != MAGDA_ADMIN_PORTAL_NAME) {
            const tenant = tenantsTable.get(domainName);
            if (undefined == tenant || tenant.enabled == false) {
                res.writeHead(500, { "Content-Type": "text/plain" });
                res.end(
                    `Something went wrong when processing the tenant with the domain name of ${domainName}.`
                );
            } else {
                proxyReq.setHeader("TenantId", String(tenant.id));
            }
        } else {
            proxyReq.setHeader("TenantId", String(MAGDA_ADMIN_PORTAL_ID));
        }
    });

    return proxy;
}
