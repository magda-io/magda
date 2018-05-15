import SleutherOptions from "./SleutherOptions";

export default function setupRecrawlEndpoint(
    options: SleutherOptions,
    recrawlFunc: () => Promise<void>,
    isCrawling: () => boolean
) {
    const server = options.express();

    server.get("/recrawl", (request, response) => {
        if (isCrawling()) {
            response.status(200).send("in progress");
        } else {
            recrawlFunc();
            response.status(200).send("crawler started");
        }
    });

    server.get("/isCrawling", (request, response) => {
        response.status(200).send(isCrawling() ? "true" : "false");
    });
}
