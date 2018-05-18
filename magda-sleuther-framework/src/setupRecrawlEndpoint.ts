import SleutherOptions from "./SleutherOptions";
import { Application } from "express";
import Crawler from "./Crawler";

export interface recrawlResponse {
    isSuccess: boolean;
    isNewCrawler?: boolean;
    errorMessage?: string;
}

export interface crawlerProgress {
    isSuccess: boolean;
    errorMessage?: string;
    progress?: {
        isCrawling: boolean;
        crawlingPageToken: string;
        crawledRecordNumber: number;
    };
}

export default function setupRecrawlEndpoint(
    server: Application,
    options: SleutherOptions,
    crawler: Crawler
) {
    server.post("/recrawl", (request, response) => {
        try {
            if (crawler.isInProgress()) {
                response.status(200).json({
                    isSuccess: true,
                    isNewCrawler: false
                });
            } else {
                crawler.start();
                response.status(200).json({
                    isSuccess: true,
                    isNewCrawler: true
                });
            }
        } catch (e) {
            response.status(500).json({
                isSuccess: false,
                errorMessage: e.message ? e.message : "Unknown Error"
            });
        }
    });

    server.get("/crawlerProgress", (request, response) => {
        try {
            const progress = crawler.getProgress();
            response.status(200).json({
                isSuccess: true,
                progress
            });
        } catch (e) {
            response.status(500).json({
                isSuccess: false,
                errorMessage: e.message ? e.message : "Unknown Error"
            });
        }
    });
}
