import * as express from 'express';

import { getMessagesForDiscussion, addMessageToDiscussion, getMessagesForDataset, addMessageToDataset } from './db';
import getUserId from '@magda/typescript-common/lib/session/GetUserId';

const router = express.Router();

router.route('/discussions/:discussionId/messages')
    .get((req, res) =>
        getMessagesForDiscussion(req.params.discussionId)
            .then(messages => res.json(messages).send())
            .catch(e => {
                console.error(e);
                res.status(500).send();
            }))
    .post((req, res) => {
        const userId = getUserId(req);
        const message: Object = req.body;

        addMessageToDiscussion(userId, req.params.discussionId, message)
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

router.get('/datasets/:datasetId/messages', (req, res) => {
    getMessagesForDataset(req.params.datasetId)
        .then(messages => res.json(messages).send())
        .catch(e => {
            console.error(e);
            res.status(500).send();
        });
});

router.post('/datasets/:datasetId/messages', (req, res) => {
    const userId = getUserId(req);
    const message: Object = req.body;

    addMessageToDataset(userId, req.params.datasetId, message)
        .then(messages => res.json(messages).send())
        .catch(e => {
            console.error(e);
            res.status(500).send();
        });
});

export default router;