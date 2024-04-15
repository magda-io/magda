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

    /**
     * @apiGroup Sitemaps
     * @api {get} /sitemap.xml Sitemaps entrypoint
     * @apiDescription A [sitemaps protocol interface](https://www.sitemaps.org/protocol.html) that is prepared for external search engines to harvest datasets from Magda.
     * The sitemap index is produced based on the live data in the metadata store database. By default, the sitemap index will be cached for 86400 seconds (24 hours).
     * This setting can be adjusted via `sitemapCacheSeconds` of [web-server](https://github.com/magda-io/magda/tree/main/deploy/helm/internal-charts/web-server) module helm chart.
     * Please note: due to the cache and the search engine indexing delay, the total number of datasets in the sitemap index may be different from the dataset total count from the search API.
     * This sitemaps endpoint is recorded on the default /robots.txt endpoint that follows the [Robots Exclusion Standard](https://en.wikipedia.org/wiki/Robots_exclusion_standard#About_the_standard).
     *
     * @apiSuccessExample {json} 200
     *    <?xml version="1.0" encoding="UTF-8"?>
     *      <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
     *          <sitemap>
     *              <loc>https://example.com/sitemap/main.xml</loc>
     *          </sitemap>
     *          <sitemap>
     *              <loc>https://example.com/sitemap/dataset/afterToken/0.xml</loc>
     *          </sitemap>
     *       </sitemapindex>
     *
     */
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

    /**
     * @apiGroup Sitemaps
     * @api {get} /sitemap/main.xml Sitemaps main index
     * @apiDescription List
     *
     * @apiSuccessExample {json} 200
     *    <?xml version="1.0" encoding="UTF-8"?>
     *      <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
     *          <sitemap>
     *              <loc>https://example.com/sitemap/main.xml</loc>
     *          </sitemap>
     *          <sitemap>
     *              <loc>https://example.com/sitemap/dataset/afterToken/0.xml</loc>
     *          </sitemap>
     *       </sitemapindex>
     *
     */
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
