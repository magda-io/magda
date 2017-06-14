import * as express from "express";
import { Message } from "./model";
import * as _ from "lodash";

import {
  getMessagesForDiscussion,
  addMessageToDiscussion,
  getLinkedMessages,
  addMessageToLinkedDiscussion
} from "./db";
import getUserId from "@magda/typescript-common/lib/session/GetUserId";
import { getUserPublic } from "@magda/auth-api/lib/src/client";

const router = express.Router();

router.get("/discussions/:discussionId/messages", (req, res) =>
  handleMessages(getMessagesForDiscussion(req.params.discussionId), res)
);

router.post("/discussions/:discussionId/messages", (req, res) => {
  const userId = getUserId(req);
  const message: Object = req.body;

  addMessageToDiscussion(userId, req.params.discussionId, message)
    .then(message => {
      res.json(message);
      res.status(201);
      return Promise.resolve();
    })
    .catch(e => {
      console.error(e);
      res.status(500);
    })
    .then(() => res.send());
});

router.get("/linked/:linkedType/:linkedId/messages", (req, res) => {
  handleMessages(
    getLinkedMessages(req.params.linkedType, req.params.linkedId),
    res
  );
});

router.post("/linked/:linkedType/:linkedId/messages", (req, res) => {
  const userId = getUserId(req);
  const message: Object = req.body;

  addMessageToLinkedDiscussion(
    userId,
    req.params.linkedType,
    req.params.linkedId,
    message
  )
    .then(messages => res.json(messages).status(201).send())
    .catch(e => {
      console.error(e);
      res.status(500).send();
    });
});

function handleMessages(
  promise: Promise<Message[]>,
  res: express.Response
): Promise<void> {
  return promise
    .then(messages => addUsers(messages))
    .then(messages => res.json(messages).send())
    .catch(e => {
      console.error(e);
      res.status(500).send();
    });
}

function addUsers(messages: Message[]): Promise<Message[]> {
  const userIds = _(messages).map(message => message.userId).uniq().value();

  const userPromises = userIds.map(getUserPublic);

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
        Object.assign({}, message, { user: userLookup[message.userId] })
      );
    });
}

export default router;
