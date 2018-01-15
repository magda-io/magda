import * as _ from "lodash";
import * as express from "express";

import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";
import unionToThrowable from "@magda/typescript-common/dist/util/unionToThrowable";

import SleutherOptions from "./SleutherOptions";
import getWebhookUrl from "./getWebhookUrl";
import AsyncPage, {
    forEachAsync
} from "@magda/typescript-common/dist/AsyncPage";

export default function setupWebhookEndpoint(
    options: SleutherOptions,
    registry: Registry
) {
    const server = options.express();
    server.use(require("body-parser").json({ limit: "50mb" }));

    server.post(
        "/hook",
        (request: express.Request, response: express.Response) => {
            const payload = request.body;

            const recordsPage = AsyncPage.single(payload.records);
            const megaPromise = forEachAsync(
                recordsPage,
                options.concurrency || 1,
                (record: Record) => options.onRecordFound(record, registry)
            );

            const lastEventIdExists = !_.isUndefined(payload.lastEventId);
            const deferredResponseUrlExists = !_.isUndefined(
                payload.deferredResponseUrl
            );
            if (options.async) {
                if (!lastEventIdExists) {
                    console.warn(
                        "No event id was passed so the sleuther can't operate asynchronously - reverting to synchronous mode"
                    );
                }

                if (!deferredResponseUrlExists) {
                    console.warn(
                        "No deferred response url was passed so the sleuther can't operate asynchronously - reverting to synchronous mode"
                    );
                }
            }

            if (
                options.async &&
                lastEventIdExists &&
                deferredResponseUrlExists
            ) {
                response.status(201).send({
                    status: "Working",
                    deferResponse: true
                });

                const sendResult = (success: boolean) =>
                    registry
                        .resumeHook(options.id, success, payload.lastEventId)
                        .then(unionToThrowable)
                        .then(result => {
                            console.info(
                                "Successfully posted back to registry for event " +
                                    payload.lastEventId
                            );
                            return result;
                        })
                        .catch((error: Error) => {
                            console.error(error);
                            throw error;
                        });

                megaPromise
                    .catch((err: Error) => {
                        // Not much we can really do about this except log it and keep going.
                        // TODO: Figure out some way to notify of failures.
                        console.error(err);
                    })
                    .then(() => sendResult(true))
                    .catch((err: Error) => {
                        console.error(err);
                        return sendResult(false);
                    });
            } else {
                megaPromise
                    .then(() => {
                        response.status(201).send({
                            status: "Received",
                            deferResponse: false
                        });
                    })
                    .catch(e => {
                        console.error(e);
                        response.status(500).send({
                            status: "Error",
                            deferResponse: false
                        });
                    });
            }
        }
    );

    function getPort() {
        return options.argv.listenPort;
    }

    server.listen(getPort());
    console.info(`Listening at ${getWebhookUrl(options)}`);
}
