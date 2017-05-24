import * as express from 'express';
import { get as getUser } from '../db/db';

const router = express.Router();

// TODO: Need to protect email addresses.
router.get("/users/:userId", function (req, res) {
    const userId = req.params.userId;

    getUser(userId).then(user => res.json(user)).catch(e => {
        console.error(e);
        res.status(500);
    });
});

export default router;