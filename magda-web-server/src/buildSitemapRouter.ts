import * as express from "express";
import Registry from "@magda/typescript-common/dist/registry/RegistryClient";
const sm = require("sitemap");

// export  express;

export default function buildSitemapRouter(
    baseExternalUrl: string,
    baseRegistryUrl: string
): express.Router {
    console.log(baseRegistryUrl);
    const app = express();
    const registry = new Registry({ baseUrl: baseRegistryUrl });

    type CrawlPage = {
        afterToken: string;
    };

    async function doFullCrawl(afterToken?: string): Promise<CrawlPage[]> {
        const pageResult = await registry.getRecords(
            ["dcat-dataset-strings"],
            [],
            afterToken,
            false,
            1000
        );

        if (pageResult instanceof Error) {
            throw pageResult;
        }

        console.log("Crawling after " + pageResult.nextPageToken);
        const theRest = pageResult.nextPageToken
            ? await doFullCrawl(pageResult.nextPageToken)
            : [];

        return [{ afterToken }].concat(theRest);
    }

    app.get("/index.xml", (req, res) => {
        doFullCrawl()
            .then(result => {
                const datasetsPages = result.map(page => {
                    return (
                        baseExternalUrl +
                        "/datasets/afterToken/" +
                        page.afterToken
                    );
                });

                const smi = sm.createSitemapIndex({
                    urls: [baseExternalUrl + "/standard.xml"].concat(
                        datasetsPages
                    )
                });

                smi.toXML((err: Error, xml: string) => {
                    if (err) {
                        res.status(500).end();
                    }

                    res.header("Content-Type", "application/xml");
                    res.send(xml);
                });
            })
            .catch(e => {
                console.error(e);
                res.status(500).end();
            });
    });

    app.get("datasets/afterToken/:afterToken");

    return app;
}
