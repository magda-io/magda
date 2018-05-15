import SleutherOptions from "./SleutherOptions";

export default function setupRecrawlEndpoint(
    options: SleutherOptions,
    recrawlFunc: () => Promise<void>,
    crawlerProgressFunc: () => {
        isCrawling: boolean;
        crawlingPageToken: string;
        crawledRecordNumber: number;
    }
) {
    const server = options.express();

    server.get("/recrawl", (request, response) => {
        if (crawlerProgressFunc().isCrawling) {
            response.status(200).send("in progress");
        } else {
            recrawlFunc();
            response.status(200).send("crawler started");
        }
    });

    server.get("/crawlerProgress", (request, response) => {
        response.status(200).send(JSON.stringify(crawlerProgressFunc()));
    });
}
