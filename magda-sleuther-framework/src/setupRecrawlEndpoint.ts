import SleutherOptions from "./SleutherOptions";
import { Application } from "express";
import Crawler from "./Crawler";

export default function setupRecrawlEndpoint(
    server: Application,
    options: SleutherOptions,
    crawler: Crawler
) {
    server.post("/recrawl", (request, response) => {
        if (crawler.isInProgress()) {
            response.status(200).send("in progress");
        } else {
            crawler.start();
            response.status(200).send("crawler started");
        }
    });

    server.get("/crawlerProgress", (request, response) => {
        response
            .status(200)
            .set("Content-Type", "application/json")
            .send(JSON.stringify(crawler.getProgess()));
    });
}
