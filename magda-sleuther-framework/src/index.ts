import * as express from "express";

import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";
import { RecordsPage } from "@magda/typescript-common/dist/registry/RegistryClient";
import unionToThrowable from "@magda/typescript-common/dist/util/unionToThrowable";
import AsyncPage, {
    forEachAsync
} from "@magda/typescript-common/dist/AsyncPage";
import SleutherOptions from "./SleutherOptions";
import setupWebhookEndpoint from "./setupWebhookEndpoint";
import setupRecrawlEndpoint from "./setupRecrawlEndpoint";
import startApiEndpoints from "./startApiEndpoints";
import isWebhookRegistered from "./isWebhookRegistered";
import registerWebhook from "./registerWebhook";
import resumeWebhook from "./resumeWebhook";

let isCrawling: boolean = false;
let crawlingPageToken: string = "";
let crawledRecordNumber: number = 0;

function resetCrawler() {
    isCrawling = false;
    crawlingPageToken = "";
    crawledRecordNumber = 0;
}

function getCrawlerProgess() {
    return { isCrawling, crawlingPageToken, crawledRecordNumber };
}

export default async function sleuther(
    options: SleutherOptions
): Promise<void> {
    checkOptions(options);
    const registry = new Registry({
        baseUrl: options.argv.registryUrl,
        jwtSecret: options.argv.jwtSecret,
        userId: options.argv.userId,
        maxRetries: options.maxRetries
    });

    options.express = options.express || (() => express());

    setupWebhookEndpoint(options, registry);
    setupRecrawlEndpoint(options, crawlExistingRecords, getCrawlerProgess);
    startApiEndpoints(options);

    await putAspectDefs();

    const webhookRegistered = await isWebhookRegistered(options, registry);

    if (webhookRegistered) {
        console.info("Webhook is already registered");
        await resumeWebhook(options, registry);
    } else {
        console.info("No webhook was registered");
        await registerWebhook(options, registry);

        await crawlExistingRecords();
    }

    function checkOptions(options: SleutherOptions) {
        if (options.argv.listenPort <= 0 || options.argv.listenPort > 65535) {
            throw new Error(
                `Default port of ${options.argv.listenPort} is invalid`
            );
        }

        if (options.id === "") {
            throw new Error(`id is unspecified`);
        }

        if (options.argv.internalUrl === "") {
            throw new Error(`Internal url is unspecified`);
        }

        if (options.argv.registryUrl === "") {
            throw new Error(`Registry url is unspecified`);
        }

        if (options.argv.jwtSecret === "") {
            throw new Error(`JWT secret is unspecified`);
        }

        if (options.argv.userId === "") {
            throw new Error(`User id is unspecified`);
        }

        const containsBlank = (strings: string[]) =>
            strings.some(string => string === "");

        if (containsBlank(options.aspects)) {
            throw new Error(
                `Aspects ${options.aspects} contains a blank aspect`
            );
        }

        if (containsBlank(options.optionalAspects)) {
            throw new Error(
                `Aspects ${options.optionalAspects} contains a blank aspect`
            );
        }
    }

    async function putAspectDefs() {
        const aspectDefsToAdd = options.writeAspectDefs;
        console.info(
            `Adding aspect defs ${aspectDefsToAdd.map(def => def.name)}`
        );

        const addPromises = aspectDefsToAdd.map(aspectDef =>
            registry.putAspectDefinition(aspectDef)
        );

        return Promise.all(addPromises)
            .then(failIfErrors)
            .then(result => {
                console.info("Successfully added aspect defs");
                return result;
            });
    }

    function failIfErrors<T>(results: Array<T | Error>) {
        const failed = results.filter(
            (result: T | Error) => result instanceof Error
        );

        if (failed.length > 0) {
            throw failed[0];
        } else {
            return results;
        }
    }

    async function crawlExistingRecords() {
        try {
            if (isCrawling) return;
            isCrawling = true;

            console.info("Crawling existing records in registry");

            const registryPage = AsyncPage.create<RecordsPage<Record>>(
                previous => {
                    if (previous && previous.records.length === 0) {
                        console.info("No more records left");
                        // Last page was an empty page, no more records left
                        return undefined;
                    } else {
                        crawlingPageToken =
                            previous && previous.nextPageToken
                                ? previous.nextPageToken
                                : "";

                        console.info(
                            "Crawling after token " +
                                (previous && previous.nextPageToken
                                    ? previous.nextPageToken
                                    : "<first page>")
                        );

                        // TODO: Retry with reduced limit if entity size too large error.
                        return registry
                            .getRecords<Record>(
                                options.aspects,
                                options.optionalAspects,
                                previous && previous.nextPageToken,
                                true,
                                10
                            )
                            .then(unionToThrowable)
                            .then(page => {
                                crawledRecordNumber += page.records.length;
                                console.info(
                                    `Crawled ${page.records.length} records`
                                );
                                return page;
                            });
                    }
                }
            ).map((page: RecordsPage<Record>) => page.records);

            await forEachAsync(
                registryPage,
                options.concurrency || 1,
                (record: Record) => options.onRecordFound(record, registry)
            );

            resetCrawler();
        } catch (e) {
            resetCrawler();
            throw e;
        }
    }
}
