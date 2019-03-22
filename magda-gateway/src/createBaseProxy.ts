import * as httpProxy from "http-proxy";
import groupBy = require("lodash/groupBy");

const DO_NOT_PROXY_HEADERS = [
    "Host",
    "X-Forwarded-Host",
    "Proxy-Connection",
    "Connection",
    "Keep-Alive",
    "Transfer-Encoding",
    "TE",
    "Trailer",
    "Proxy-Authorization",
    "Proxy-Authenticate",
    "Upgrade",
    "Expires",
    "pragma",
    "Strict-Transport-Security",
    "Authorization",
    "Cookie"
];

const headerLookup = groupBy(
    DO_NOT_PROXY_HEADERS.map(x => x.toLowerCase()),
    (x: string) => x
);

export default function createBaseProxy(): httpProxy {
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

    proxy.on("proxyReq", function(proxyReq, req, res) {
        // Presume that we've already got whatever auth details we need out of the request and so remove it now.
        // If we keep it it causes scariness upstream - like anything that goes through the TerriaJS proxy will
        // be leaking auth details to wherever it proxies to.
        for (let headerName of proxyReq.getHeaderNames()) {
            if (!!headerLookup[headerName.toLowerCase()]) {
                proxyReq.removeHeader(headerName);
            }
        }
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

    return proxy;
}
