import * as express from 'express';

import { Message } from './model';
import { getMessagesForDiscussion, addMessageToDiscussion } from './db';
import getUserId from '@magda/typescript-common/src/session/GetUserId';

const router = express.Router();

router.get('/discussions/:discussionId/messages', (req, res) => {
    getMessagesForDiscussion(req.params.discussionId)
        .then(messages => Promise.resolve(res.json(messages)))
        .catch(e => {
            console.log(e);
            res.status(500);
        })
        .then(() => res.send());
});

router.post('/discussions/:discussionId/messages', (req, res) => {
    const userId = getUserId(req);

    const message: Message = req.body.json();
    message.discussionId = req.params.discussionId
    message.userId = userId

    addMessageToDiscussion(message)
        .then(message => {
            res.json(message);
            res.status(201);
            return Promise.resolve();
        })
        .catch(e => {
            console.log(e);
            res.status(500);
        })
        .then(() => res.send());
});

export default router;