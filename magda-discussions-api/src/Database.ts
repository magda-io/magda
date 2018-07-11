import createPool from "./createPool";
import { Maybe } from "tsmonad";
import { Discussion, Message } from "./model";
import arrayToMaybe from "@magda/typescript-common/dist/util/arrayToMaybe";
import * as pg from "pg";

export interface DatabaseOptions {
    dbHost: string;
    dbPort: number;
}

const messagesForDatasetSql = `
    SELECT messages.id AS id, message, "userId", messages."discussionId", modified, created FROM
    messages INNER JOIN linkeddiscussions
    ON "messages"."discussionId" = "linkeddiscussions"."discussionId"
    WHERE "linkeddiscussions"."linkedType" = $1 AND "linkeddiscussions"."linkedId" = $2
`;

export default class Database {
    private pool: pg.Pool;

    constructor(options: DatabaseOptions) {
        this.pool = createPool(options);
    }

    checkConnection(): Promise<Maybe<Discussion>> {
        return this.pool
            .query("SELECT * FROM discussions LIMIT 1")
            .then(res => arrayToMaybe(res.rows));
    }

    getDiscussion(discussionId: string): Promise<Maybe<Discussion>> {
        return this.pool
            .query('SELECT * FROM discussions WHERE "id" = $1', [discussionId])
            .then(res => arrayToMaybe(res.rows));
    }

    addDiscussion(): Promise<Discussion> {
        return this.pool
            .query("INSERT INTO discussions (id) VALUES (DEFAULT) RETURNING id")
            .then(res => res.rows[0]);
    }

    getMessagesForDiscussion(discussionId: string): Promise<Message[]> {
        return this.pool
            .query('SELECT * FROM messages WHERE "discussionId" = $1', [
                discussionId
            ])
            .then(res => res.rows);
    }

    addMessageToDiscussion(
        userId: string,
        discussionId: string,
        message: Object
    ): Promise<Message> {
        return this.pool
            .query(
                'INSERT INTO messages(message, "userId", "discussionId") VALUES($1, $2, $3) RETURNING *',
                [message, userId, discussionId]
            )
            .then(res => res.rows[0]);
    }

    getLinkedDiscussion(
        linkedType: string,
        linkedId: string
    ): Promise<Maybe<Discussion>> {
        return this.pool
            .query(
                'SELECT "discussionId" AS "id" FROM linkeddiscussions WHERE "linkedType" = $1 AND "linkedId" = $2',
                [linkedType, linkedId]
            )
            .then(res => arrayToMaybe(res.rows));
    }

    addLinkedDiscussion(
        linkedType: string,
        linkedId: string
    ): Promise<Discussion> {
        return this.addDiscussion()
            .then(discussion =>
                this.pool.query(
                    'INSERT INTO linkeddiscussions("linkedType", "linkedId", "discussionId") VALUES($1, $2, $3) RETURNING "discussionId" AS id',
                    [linkedType, linkedId, discussion.id]
                )
            )
            .then(result => result.rows[0]);
    }

    getLinkedMessages(
        linkedType: string,
        linkedId: string
    ): Promise<Message[]> {
        return this.pool
            .query(messagesForDatasetSql, [linkedType, linkedId])
            .then(res => {
                return res.rows;
            });
    }

    addMessageToLinkedDiscussion(
        userId: string,
        linkedType: string,
        linkedId: string,
        message: Object
    ): Promise<{ message: Message; discussion: Discussion }> {
        const addMessage = (discussion: Discussion) =>
            this.addMessageToDiscussion(userId, discussion.id, message).then(
                message => ({
                    message,
                    discussion
                })
            );

        return this.getLinkedDiscussion(linkedType, linkedId).then(maybe =>
            maybe.caseOf({
                just: discussion => addMessage(discussion),
                nothing: () =>
                    this.addLinkedDiscussion(linkedType, linkedId).then(
                        discussion => addMessage(discussion)
                    )
            })
        );
    }
}
