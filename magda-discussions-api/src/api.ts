import * as express from "express";
import { Message } from "./model";
import * as _ from "lodash";

import {
  getMessagesForDiscussion,
  addMessageToDiscussion,
  // getLinkedMessages,
  getLinkedDiscussion,
  addLinkedDiscussion
  // addMessageToLinkedDiscussion
} from "./db";
import getUserId from "@magda/typescript-common/lib/session/GetUserId";
import { getUserPublic } from "@magda/auth-api/lib/src/client";

const router = express.Router();

router.get("/discussions/:discussionId/messages", (req, res) =>
  getMessages(req.params.discussionId, res)
);

router.post("/discussions/:discussionId/messages", (req, res) => {
  const userId = getUserId(req);
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

router.get("/linked/:linkedType/:linkedId", (req, res) => {
  const { linkedType, linkedId } = req.params;

  getLinkedDiscussion(linkedType, linkedId)
    .then(maybe =>
      maybe.caseOf({
        just: discussion => Promise.resolve(discussion),
        nothing: () => addLinkedDiscussion(linkedType, linkedId)
      })
    )
    .then(discussion => res.json(discussion).send())
    .catch(e => {
      console.error(e);
      res.status(500).send("Error");
    });
});

// router.get("/linked/:linkedType/:linkedId/messages", (req, res) => {
//   handleMessages(
//     getLinkedMessages(req.params.linkedType, req.params.linkedId),
//     res
//   );
// });

// router.post("/linked/:linkedType/:linkedId/messages", (req, res) => {
//   const userId = getUserId(req);
//   const message: Object = req.body;

//   addMessageToLinkedDiscussion(
//     userId,
//     req.params.linkedType,
//     req.params.linkedId,
//     message
//   )
//     .then(messages => res.json(messages).status(201).send())
//     .catch(e => {
//       console.error(e);
//       res.status(500).send();
//     });
// });

function getMessages(discussionId: string, res: express.Response) {
  return handleMessages(getMessagesForDiscussion(discussionId), res);
}

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
