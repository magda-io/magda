import express from "express";
import Registry from "magda-typescript-common/src/registry/RegistryClient";
import URI from "urijs";
import ServerError from "magda-typescript-common/src/ServerError";
import { SitemapStream, SitemapIndexStream, ErrorLevel } from "sitemap";

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

    async function getPageTokens() {
        const now = new Date().getTime();
        if (
            pageTokens &&
            pageTokenQueryTime &&
            typeof pageTokenQueryTime === "number" &&
            now <= pageTokenQueryTime + cacheSeconds
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
            res.set("Content-Type", "application/xml");

            const smis = new SitemapIndexStream({ level: ErrorLevel.WARN });
            smis.pipe(res).on("error", (e) => {
                throw e;
            });
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
        } catch (e) {
            res.status(500)
                .set("Content-Type", "text/plain")
                .send(`Error when processing "/sitemap.xml": ${e}`);
        }
    });

    app.get("/sitemap/main.xml", (req, res) => {
        try {
            res.set("Content-Type", "application/xml");
            // For now we just put the homepage in here, seeing as everything except the datasets should be reachable
            // from either the home page or the datasets pages.
            const sms = new SitemapStream({
                level: ErrorLevel.WARN
            });
            sms.pipe(res).on("error", (e) => {
                throw e;
            });
            sms.write({
                url: baseExternalUri.toString(),
                changefreq: "daily"
            });
            sms.end();
        } catch (e) {
            res.status(500)
                .set("Content-Type", "text/plain")
                .send(`Error when processing "/sitemap/main.xml": ${e}`);
        }
    });

    app.get("/sitemap/dataset/afterToken/:afterToken.xml", async (req, res) => {
        try {
            res.set("Content-Type", "application/xml");
            const sms = new SitemapStream({
                level: ErrorLevel.WARN
            });
            sms.pipe(res).on("error", (e) => {
                throw e;
            });

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
        } catch (e) {
            res.status(500)
                .set("Content-Type", "text/plain")
                .send(
                    `Error when processing "/sitemap/dataset/afterToken/${req.params.afterToken}.xml": ${e}`
                );
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
