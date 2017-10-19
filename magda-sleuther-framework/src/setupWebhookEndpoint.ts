import * as fetch from "isomorphic-fetch";
import * as _ from "lodash";
import * as express from "express";

import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";

import SleutherOptions from "./SleutherOptions";
import getWebhookUrl from "./getWebhookUrl";

export default function setupWebhookEndpoint(
    options: SleutherOptions,
    registry: Registry
) {
    const server = options.express();
    server.use(require("body-parser").json());

    server.post(
        "/hook",
        (request: express.Request, response: express.Response) => {
            const payload = request.body;

            const promises: Promise<
                void
            >[] = payload.records.map((record: Record) =>
                options.onRecordFound(record, registry)
            );

            const megaPromise = Promise.all(promises);

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
                    fetch(payload.deferredResponseUrl, {
                        method: "POST",
                        body: JSON.stringify({
                            succeeded: success,
                            lastEventIdReceived: payload.lastEventId
                        })
                    });

                megaPromise
                    .then(results => sendResult(true))
                    .catch((err: Error) => {
                        console.error(err);
                        return sendResult(false);
                    });
            } else {
                megaPromise
                    .then(results => {
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
