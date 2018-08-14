import * as httpProxy from "http-proxy";

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

    proxy.on("proxyRes", function(proxyRes, req, res) {
        // Add a default cache time of 60 seconds on GETs so the CDN can cache in times of high load.
        if (
            req.method === "GET" &&
            !proxyRes.headers["Cache-Control"] &&
            !proxyRes.headers["cache-control"]
        ) {
            proxyRes.headers["Cache-Control"] = "public, max-age=60";
        }
        Object.keys(proxyRes.headers).forEach(headerKey => {
            headerKey = headerKey.toLowerCase();
            if (headerKey === "x-powered-by" || headerKey === "server") {
                delete proxyRes.headers[headerKey];
            }
        });
    });

    return proxy;
}
