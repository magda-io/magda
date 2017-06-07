import pool from "./pool";
import { Maybe } from 'tsmonad';
import { Discussion, Message } from './model';
import arrayToMaybe from '@magda/typescript-common/lib/util/array-to-maybe';

export function getDiscussion(discussionId: string): Promise<Maybe<Discussion>> {
  return pool
    .query('SELECT * FROM discussions WHERE "id" = $1', [discussionId])
    .then(res => arrayToMaybe(res.rows));
}

export function addDiscussion(): Promise<Discussion> {
  return pool
    .query('INSERT INTO messages (id) VALUES (DEFAULT) RETURNING id')
    .then(res => (res.rows[0]));
}

export function getMessagesForDiscussion(discussionId: string): Promise<Message[]> {
  return pool
    .query('SELECT * FROM messages WHERE "discussionId" = $1', [discussionId])
    .then(res => res.rows);
}

export function addMessageToDiscussion(userId: string, discussionId: string, message: Object): Promise<Message> {
  return pool
    .query('INSERT INTO messages(message, "userId", "discussionId") VALUES($1, $2, $3) RETURNING *', [message, userId, discussionId])
    .then(res => res.rows[0]);
}

export function getDiscussionForDataset(datasetId: string): Promise<Maybe<Discussion>> {
  return pool
    .query('SELECT "discussionId" AS "id" FROM datasetdiscussions WHERE "datasetId" = $1', [datasetId])
    .then(res => arrayToMaybe(res.rows));
}

export function addDiscussionForDataset(datasetId: string): Promise<Discussion> {
  return addDiscussion()
    .then(discussion => pool.query('INSERT INTO datasetdiscussions("datasetId", "discussionId") VALUES($1, $2) RETURNING "discussionId" AS id', [datasetId, discussion.id]))
    .then(result => result.rows[0]);
}

const messagesForDatasetSql = `
  SELECT messages.id AS id, message, "userId", messages."discussionId", modified, created FROM
  messages INNER JOIN datasetdiscussions
  ON "messages"."discussionId" = "datasetdiscussions"."discussionId"
  WHERE "datasetdiscussions"."datasetId" = $1
`;

export function getMessagesForDataset(datasetId: string): Promise<Message[]> {
  return pool
    .query(messagesForDatasetSql, [datasetId])
    .then(res => res.rows);
}

export function addMessageToDataset(userId: string, datasetId: string, message: Object): Promise<Message> {
  const addMessage = (discussion: Discussion) => addMessageToDiscussion(userId, discussion.id, message);

  return getDiscussionForDataset(datasetId).then(maybe => maybe.caseOf({
    just: addMessage,
    nothing: () => addDiscussionForDataset(datasetId).then(addMessage)
  }))
}