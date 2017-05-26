import pool from "./pool";
import { Maybe } from 'tsmonad';
import { Discussion, Message } from './model';
import arrayToMaybe from '@magda/typescript-common/src/util/array-to-maybe';

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

export function addMessageToDiscussion(message: Message): Promise<Message> {
  return pool
    .query('INSERT INTO messages(message, userId, discussionId) VALUES($1, $2, $3) RETURNING id', [message.message, message.userId, message.discussionId])
    .then(res => ({ ...message, ...res.rows[0] }));
}