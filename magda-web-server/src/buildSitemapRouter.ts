import * as express from "express";
import Registry from "@magda/typescript-common/dist/registry/RegistryClient";
const sm = require("sitemap");

// export  express;

export default function buildSitemapRouter(
    baseExternalUrl: string,
    baseRegistryUrl: string
): express.Router {
    const app = express();
    const registry = new Registry({ baseUrl: baseRegistryUrl });

    function handleError<T>(result: T | Error) {
        if (result instanceof Error) {
            throw result;
        } else {
            return result;
        }
    }

    app.get("/", (req, res) => {
        registry
            .getRecordsPageTokens(["dcat-dataset-strings"])
            .then(handleError)
            .then(async result => {
                const datasetsPages = result.map(token => {
                    return (
                        baseExternalUrl +
                        "/sitemap/dataset/afterToken/" +
                        token
                    );
                });

                const smi = sm.buildSitemapIndex({
                    urls: [baseExternalUrl + "/sitemap/main"].concat(
                        datasetsPages
                    )
                });

                res.header("Content-Type", "application/xml");
                res.send(smi);
            })
            .catch(e => {
                console.error(e);
                res.status(500).end();
            });
    });

    app.get("/main", (req, res) => {
        // For now we just put the homepage in here, seeing as everything except the datasets should be reachable
        // from either the home page or the datasets pages.
        const sitemap = sm.createSitemap({
            hostname: baseExternalUrl,
            cacheTime: 600000, // 600 sec - cache purge period
            urls: [
                {
                    url: `/`,
                    changefreq: "weekly"
                }
            ]
        });

        sitemap.toXML(function(err: Error, xml: string) {
            if (err) {
                return res.status(500).end();
            }
            res.header("Content-Type", "application/xml");
            res.send(xml);
        });
    });

    app.get("/dataset/afterToken/:afterToken", (req, res) => {
        const afterToken: string = req.params.afterToken;

        registry
            .getRecords(["dcat-dataset-strings"], null, afterToken, false)
            .then(handleError)
            .then(records => {
                const sitemap = sm.createSitemap({
                    hostname: baseExternalUrl,
                    cacheTime: 600000, // 600 sec - cache purge period
                    urls: records.records.map(record => ({
                        url: `/dataset/${encodeURIComponent(record.id)}`,
                        changefreq: "weekly"
                    }))
                });

                sitemap.toXML(function(err: Error, xml: string) {
                    if (err) {
                        return res.status(500).end();
                    }
                    res.header("Content-Type", "application/xml");
                    res.send(xml);
                });
            });
    });

    return app;
}
