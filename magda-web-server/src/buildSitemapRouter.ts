import * as express from "express";
import Registry from "@magda/typescript-common/dist/registry/RegistryClient";
import * as URI from "urijs";
const sm = require("sitemap");

const DATASET_REQUIRED_ASPECTS = ["dcat-dataset-strings"];

export type SitemapRouterOptions = {
    baseExternalUrl: string;
    registry: Registry;
};

export default function buildSitemapRouter({
    baseExternalUrl,
    registry
}: SitemapRouterOptions): express.Router {
    const app = express();
    const baseExternalUri = new URI(baseExternalUrl);

    // Make sure every request is setting XML as the content type.
    app.use((req, res, next) => {
        res.header("Content-Type", "application/xml");
        next();
    });

    app.get("/", (req, res) => {
        catchError(
            res,
            registry
                .getRecordsPageTokens(DATASET_REQUIRED_ASPECTS)
                .then(handleError)
                .then(async result => {
                    const datasetsPages = result.map(token => {
                        return baseExternalUri
                            .clone()
                            .path(
                                URI.joinPaths(
                                    baseExternalUrl,
                                    "sitemap/dataset/afterToken",
                                    token.toString()
                                ).href()
                            )
                            .href();
                    });

                    const smi = sm.buildSitemapIndex({
                        urls: [
                            baseExternalUri
                                .clone()
                                .path(
                                    URI.joinPaths(
                                        baseExternalUrl,
                                        "sitemap/main"
                                    ).href()
                                )
                                .href()
                        ].concat(datasetsPages)
                    });

                    res.send(smi);
                })
        );
    });

    app.get("/main", (req, res) => {
        // For now we just put the homepage in here, seeing as everything except the datasets should be reachable
        // from either the home page or the datasets pages.
        const sitemap = sm.createSitemap({
            hostname: baseExternalUrl,
            cacheTime: 600000,
            urls: [
                {
                    url: ``,
                    changefreq: "weekly"
                }
            ]
        });

        sitemap.toXML(function(err: Error, xml: string) {
            if (err) {
                return res.status(500).end();
            }
            res.send(xml);
        });
    });

    app.get("/dataset/afterToken/:afterToken", (req, res) => {
        const afterToken: string = req.params.afterToken;

        catchError(
            res,
            registry
                .getRecords(DATASET_REQUIRED_ASPECTS, null, afterToken, false)
                .then(handleError)
                .then(records => {
                    const sitemap = sm.createSitemap({
                        hostname: baseExternalUrl,
                        cacheTime: 600000,
                        urls: records.records.map(record => ({
                            url: `/dataset/${encodeURIComponent(record.id)}`,
                            changefreq: "weekly"
                        }))
                    });

                    sitemap.toXML(function(err: Error, xml: string) {
                        if (err) {
                            return res.status(500).end();
                        }
                        res.send(xml);
                    });
                })
        );
    });

    /**
     * Handles `| Error` union type failures from the registry client.
     */
    function handleError<T>(result: T | Error) {
        if (result instanceof Error) {
            throw result;
        } else {
            return result;
        }
    }

    /**
     * Wraps around a promise - if the promise fails, logs the error
     * and ends the request with HTTP 500
     */
    function catchError<T>(res: express.Response, promise: Promise<T>) {
        return promise.catch(e => {
            console.error(e);
            res.status(500)
                .set("Content-Type", "text/plain")
                .send("Internal Server Error");
        });
    }

    return app;
}
