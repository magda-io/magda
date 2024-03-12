import express from "express";
import Registry from "magda-typescript-common/src/registry/RegistryClient.js";
import URI from "urijs";
import ServerError from "magda-typescript-common/src/ServerError.js";
import {
    SitemapStream,
    SitemapIndexStream,
    streamToPromise,
    ErrorLevel
} from "sitemap";

const DATASET_REQUIRED_ASPECTS = ["dcat-dataset-strings"];

export type SitemapRouterOptions = {
    baseExternalUrl: string;
    registry: Registry;
    cacheSeconds: number;
};

let pageTokens: string[] | null = null;
let pageTokenQueryTime: number | null = null;

export default function buildSitemapRouter({
    baseExternalUrl,
    registry,
    cacheSeconds
}: SitemapRouterOptions): express.Router {
    const app = express();
    const baseExternalUri = new URI(baseExternalUrl);

    pageTokens = null;
    pageTokenQueryTime = null;

    async function getPageTokens() {
        const now = new Date().getTime();
        if (
            pageTokens &&
            pageTokenQueryTime &&
            typeof pageTokenQueryTime === "number" &&
            now <= pageTokenQueryTime + cacheSeconds * 1000
        ) {
            return pageTokens;
        }
        const result = await registry.getRecordsPageTokens(
            DATASET_REQUIRED_ASPECTS
        );
        pageTokens = handleError(result);
        pageTokenQueryTime = now;
        return pageTokens;
    }

    app.get("/sitemap.xml", async (req, res) => {
        try {
            const smis = new SitemapIndexStream({ level: ErrorLevel.WARN });
            const dataPromise = streamToPromise(smis);
            smis.write({
                url: baseExternalUri
                    .clone()
                    .path(
                        URI.joinPaths(
                            baseExternalUrl,
                            "sitemap/main.xml"
                        ).toString()
                    )
                    .toString()
            });
            const tokens = await getPageTokens();
            tokens.map((token) => {
                smis.write({
                    url: baseExternalUri
                        .clone()
                        .path(
                            URI.joinPaths(
                                baseExternalUrl,
                                "sitemap/dataset/afterToken",
                                token.toString() + ".xml"
                            ).toString()
                        )
                        .toString()
                });
            });
            smis.end();
            const data = await dataPromise;
            res.status(200)
                .set("Content-Type", "application/xml")
                .send(data.toString());
        } catch (e) {
            const msg = `Error when processing "/sitemap.xml": ${e}`;
            console.error(msg);
            res.status(500).set("Content-Type", "text/plain").send(msg);
        }
    });

    app.get("/sitemap/main.xml", async (req, res) => {
        try {
            // For now we just put the homepage in here, seeing as everything except the datasets should be reachable
            // from either the home page or the datasets pages.
            const sms = new SitemapStream({
                level: ErrorLevel.WARN
            });
            const dataPromise = streamToPromise(sms);
            sms.write({
                url: baseExternalUri.toString(),
                changefreq: "daily"
            });
            sms.end();
            const data = await dataPromise;
            res.status(200)
                .set("Content-Type", "application/xml")
                .send(data.toString());
        } catch (e) {
            const msg = `Error when processing "/sitemap/main.xml": ${e}`;
            res.status(500).set("Content-Type", "text/plain").send(msg);
        }
    });

    app.get("/sitemap/dataset/afterToken/:afterToken.xml", async (req, res) => {
        try {
            const sms = new SitemapStream({
                level: ErrorLevel.WARN
            });
            const dataPromise = streamToPromise(sms);

            const afterToken: string = req.params.afterToken;
            const result = await registry.getRecords(
                DATASET_REQUIRED_ASPECTS,
                null,
                afterToken,
                false
            );
            const records = handleError(result);
            records?.records?.forEach((record) =>
                sms.write({
                    url: baseExternalUri
                        .clone()
                        .path(
                            URI.joinPaths(
                                baseExternalUrl,
                                `/dataset/${encodeURIComponent(record.id)}`
                            ).toString()
                        )
                        .toString(),
                    changefreq: "weekly"
                })
            );
            sms.end();
            const data = await dataPromise;
            res.status(200)
                .set("Content-Type", "application/xml")
                .send(data.toString());
        } catch (e) {
            const msg = `Error when processing "/sitemap/dataset/afterToken/${req.params.afterToken}.xml": ${e}`;
            res.status(500).set("Content-Type", "text/plain").send(msg);
        }
    });

    /**
     * Handles `| Error` union type failures from the registry client.
     */
    function handleError<T>(result: T | Error | ServerError) {
        if (result instanceof ServerError) {
            throw result;
        } else if (result instanceof Error) {
            throw result;
        } else {
            return result;
        }
    }

    return app;
}
