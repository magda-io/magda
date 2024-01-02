import MinionOptions from "./MinionOptions.js";
import { Application } from "express";
import Crawler from "./Crawler.js";

/**
 * @apiDefine GenericErrorMinionJson
 * @apiError (Error 500 JSON Response Body) {Boolean} isSuccess Whether or not the operation is successfully done.
 * @apiError (Error 500 JSON Response Body) {Boolean} [isNewCrawler] indicate Whether it's a new cralwer process or existing crawling process is still no-going.
 * @apiError (Error 500 JSON Response Body) {String} errorMessage Free text error message. Only available when `isSuccess`=`false`
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
 * @apiUse GenericErrorMinionJson
 */
export default function setupRecrawlEndpoint(
    server: Application,
    options: MinionOptions,
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
                errorMessage: (e as any)?.message
                    ? (e as any).message
                    : "Unknown Error"
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
     * @apiUse GenericErrorMinionJson
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
                errorMessage: (e as any).message
                    ? (e as any).message
                    : "Unknown Error"
            });
        }
    });
}
