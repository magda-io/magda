import * as express from "express";
import { Message } from "./model";
import * as _ from "lodash";

import {
  getMessagesForDiscussion,
  addMessageToDiscussion,
  getLinkedMessages,
  getLinkedDiscussion,
  addMessageToLinkedDiscussion
} from "./db";
import { getUserIdHandling } from "@magda/typescript-common/dist/session/GetUserId";
import { getUserPublic } from "@magda/auth-api/dist/client";

const router = express.Router();

router.get("/discussions/:discussionId/messages", (req, res) =>
  getMessages(req.params.discussionId, res)
);

router.post("/discussions/:discussionId/messages", (req, res) => {
  getUserIdHandling(req, res, (userId: string) => {
    const message: Object = req.body;

    addMessageToDiscussion(userId, req.params.discussionId, message)
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

  getLinkedDiscussion(linkedType, linkedId)
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
    getLinkedMessages(req.params.linkedType, req.params.linkedId),
    res
  );
});

router.post("/linked/:linkedType/:linkedId/messages", (req, res) => {
  getUserIdHandling(req, res, (userId: string) => {
    const message: Object = req.body;

    addMessageToLinkedDiscussion(
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
  return handleMessages(getMessagesForDiscussion(discussionId), res);
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
    });
}

/**
 * Gets a bunch of messages with user ids, looks up the object that corresponds to them and then writes that out to the message.
 */
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
