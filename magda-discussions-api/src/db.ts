import pool from "./pool";
import { Maybe } from "tsmonad";
import { Discussion, Message } from "./model";
import arrayToMaybe from "@magda/typescript-common/dist/util/arrayToMaybe";

export function getDiscussion(
  discussionId: string
): Promise<Maybe<Discussion>> {
  return pool
    .query('SELECT * FROM discussions WHERE "id" = $1', [discussionId])
    .then(res => arrayToMaybe(res.rows));
}

export function addDiscussion(): Promise<Discussion> {
  return pool
    .query("INSERT INTO discussions (id) VALUES (DEFAULT) RETURNING id")
    .then(res => res.rows[0]);
}

export function getMessagesForDiscussion(
  discussionId: string
): Promise<Message[]> {
  return pool
    .query('SELECT * FROM messages WHERE "discussionId" = $1', [discussionId])
    .then(res => res.rows);
}

export function addMessageToDiscussion(
  userId: string,
  discussionId: string,
  message: Object
): Promise<Message> {
  return pool
    .query(
      'INSERT INTO messages(message, "userId", "discussionId") VALUES($1, $2, $3) RETURNING *',
      [message, userId, discussionId]
    )
    .then(res => res.rows[0]);
}

export function getLinkedDiscussion(
  linkedType: string,
  linkedId: string
): Promise<Maybe<Discussion>> {
  return pool
    .query(
      'SELECT "discussionId" AS "id" FROM linkeddiscussions WHERE "linkedType" = $1 AND "linkedId" = $2',
      [linkedType, linkedId]
    )
    .then(res => arrayToMaybe(res.rows));
}

export function addLinkedDiscussion(
  linkedType: string,
  linkedId: string
): Promise<Discussion> {
  return addDiscussion()
    .then(discussion =>
      pool.query(
        'INSERT INTO linkeddiscussions("linkedType", "linkedId", "discussionId") VALUES($1, $2, $3) RETURNING "discussionId" AS id',
        [linkedType, linkedId, discussion.id]
      )
    )
    .then(result => result.rows[0]);
}

const messagesForDatasetSql = `
  SELECT messages.id AS id, message, "userId", messages."discussionId", modified, created FROM
  messages INNER JOIN linkeddiscussions
  ON "messages"."discussionId" = "linkeddiscussions"."discussionId"
  WHERE "linkeddiscussions"."linkedType" = $1 AND "linkeddiscussions"."linkedId" = $2
`;

export function getLinkedMessages(
  linkedType: string,
  linkedId: string
): Promise<Message[]> {
  return pool.query(messagesForDatasetSql, [linkedType, linkedId]).then(res => {
    return res.rows;
  });
}

export function addMessageToLinkedDiscussion(
  userId: string,
  linkedType: string,
  linkedId: string,
  message: Object
): Promise<{ message: Message; discussion: Discussion }> {
  const addMessage = (discussion: Discussion) =>
    addMessageToDiscussion(userId, discussion.id, message).then(message => ({
      message,
      discussion
    }));

  return getLinkedDiscussion(linkedType, linkedId).then(maybe =>
    maybe.caseOf({
      just: discussion => addMessage(discussion),
      nothing: () =>
        addLinkedDiscussion(linkedType, linkedId).then(discussion =>
          addMessage(discussion)
        )
    })
  );
}
