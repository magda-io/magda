import * as express from 'express';
import { Maybe } from 'tsmonad';

import { getUser, getUserByExternalDetails, createUser } from './db';
import { User } from './model';
import getUserId from '@magda/typescript-common/src/session/GetUserId';

const router = express.Router();

function handleUserPromise(res: express.Response, promise: Promise<Maybe<User>>) {
    return promise
        .then(user => user.caseOf({
            just: user => Promise.resolve(res.json(user)),
            nothing: () => Promise.resolve(res.status(404))
        })).catch(e => {
            console.error(e);
            res.status(500);
        }).then(() => res.send());
}

// TODO: Need to protect email addresses.
router.get("/users/lookup", function (req, res) {
    const source = req.query.source;
    const sourceId = req.query.sourceId;

    handleUserPromise(res, getUserByExternalDetails(source, sourceId));
});

router.get("/users/whoami", function (req, res) {
    const userId = getUserId(req);
    handleUserPromise(res, getUser(userId));
});

router.get("/users/:userId", function (req, res) {
    const userId = req.params.userId;

    handleUserPromise(res, getUser(userId));
});

router.post("/users", function (req, res) {
    createUser(req.body)
        .then(user => {
            res.json(user);
            res.status(201)
        })
        .catch(e => {
            console.error(e);
            res.status(500);
        })
        .then(() => res.send());
});

export default router;