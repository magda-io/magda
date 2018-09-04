import SleutherOptions from "./SleutherOptions";
import { Application } from "express";
import Crawler from "./Crawler";

/**
 * @apiDefine GenericError
 * @apiError (Error 500) {String} Response "Failure"
 * @apiErrorExample {json} Response:
 * {
 *     isSuccess: false,
 *     errorMessage: "Unknown Error"
 * }
 */

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

/**
 * @apiGroup Minions
 * @api {post} /v0/minions/recrawl Make the minion recrawl the registry
 *
 * @apiDescription Make the minion recrawl the registry
 *
 * @apiSuccess (Success 200) {json} Response the minion recrawl status
 * @apiSuccessExample {json} Response:
 *  {
 *    isSuccess: true,
 *    isNewCrawler: true
 *  }
 * @apiUse GenericError
 */
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

    /**
     * @apiGroup Minions
     * @api {get} /v0/minions/crawlerProgress Get the minion recrawl progress
     *
     * @apiDescription Get the minion recrawl progress
     *
     * @apiSuccess (Success 200) {json} Response the minion recrawl progress
     * @apiSuccessExample {json} Response:
     *  {
     *    isSuccess: true,
     *    progress: {
     *       isCrawling: true,
     *       crawlingPageToken: "101",
     *       crawledRecordNumber: 100
     *    }
     *  }
     * @apiUse GenericError
     */
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
