import * as express from "express";
import { Router } from "express";
import { Message } from "./model";
import * as _ from "lodash";

import Database from "./Database";
import { getUserIdHandling } from "@magda/typescript-common/dist/session/GetUserId";
import ApiClient from "@magda/typescript-common/dist/authorization-api/ApiClient";

export interface ApiRouterOptions {
    database: Database;
    authorizationApi: ApiClient;
    jwtSecret: string;
}

export default function createApiRouter(options: ApiRouterOptions) {
    const database = options.database;
    const authApi = options.authorizationApi;

    const router: Router = express.Router();

    router.get("/healthz", (req, res) =>
        database
            .checkConnection()
            .then(() => {
                res.status(200).send("OK");
            })
            .catch(() => {
                res.status(500).send("Error");
            })
    );

    router.get("/discussions/:discussionId/messages", (req, res) =>
        getMessages(req.params.discussionId, res)
    );

    router.post("/discussions/:discussionId/messages", (req, res) => {
        getUserIdHandling(req, res, options.jwtSecret, (userId: string) => {
            const message: Object = req.body;

            database
                .addMessageToDiscussion(
                    userId,
                    req.params.discussionId,
                    message
                )
                .then(message => {
                    res.status(201);
                    return getMessages(req.params.discussionId, res);
                })
                .catch(e => {
                    console.error(e);
                    res.status(500).send("Error");
                });
        });
    });

    router.get("/linked/:linkedType/:linkedId", (req, res) => {
        const { linkedType, linkedId } = req.params;

        database
            .getLinkedDiscussion(linkedType, linkedId)
            .then(maybe =>
                maybe.caseOf({
                    just: discussion => res.json(discussion).send(),
                    nothing: () => res.status(404).send("Not found")
                })
            )
            .catch(e => {
                console.error(e);
                res.status(500).send("Error");
            });
    });

    router.get("/linked/:linkedType/:linkedId/messages", (req, res) => {
        return handleMessages(
            database.getLinkedMessages(
                req.params.linkedType,
                req.params.linkedId
            ),
            res
        );
    });

    router.post("/linked/:linkedType/:linkedId/messages", (req, res) => {
        getUserIdHandling(req, res, options.jwtSecret, (userId: string) => {
            const message: Object = req.body;

            database
                .addMessageToLinkedDiscussion(
                    userId,
                    req.params.linkedType,
                    req.params.linkedId,
                    message
                )
                .then(({ message, discussion }) => {
                    res.status(201);
                    return getMessages(discussion.id, res);
                })
                .catch(e => {
                    console.error(e);
                    res.status(500).send("Error");
                });
        });
    });

    function getMessages(discussionId: string, res: express.Response) {
        return handleMessages(
            database.getMessagesForDiscussion(discussionId),
            res
        );
    }

    function handleMessages(
        promise: Promise<Message[]>,
        res: express.Response
    ): Promise<void> {
        return promise
            .then(messages => {
                return addUsers(messages);
            })
            .then(messages => {
                return res.json(messages).send();
            })
            .catch(e => {
                console.error(e);
                res.status(500).send();
            })
            .then(() => Promise.resolve());
    }

    /**
     * Gets a bunch of messages with user ids, looks up the object that corresponds to them and then writes that out to the message.
     */
    function addUsers(messages: Message[]): Promise<Message[]> {
        const userIds = _(messages)
            .map(message => message.userId)
            .uniq()
            .value();

        const userPromises = userIds.map(id => authApi.getUserPublic(id));

        return Promise.all(userPromises)
            .then(users => {
                return Promise.resolve(
                    _(users)
                        .filter(user =>
                            user.caseOf({
                                just: x => true,
                                nothing: () => false
                            })
                        )
                        .map(user => user.valueOrThrow())
                        .keyBy(user => user.id)
                        .value()
                );
            })
            .then(userLookup => {
                return messages.map(message =>
                    Object.assign({}, message, {
                        user: userLookup[message.userId]
                    })
                );
            });
    }

    return router;
}
