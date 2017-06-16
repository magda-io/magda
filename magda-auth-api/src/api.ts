import * as express from "express";
import { Maybe } from "tsmonad";

import { getUser, getUserByExternalDetails, createUser } from "./db";
import { PublicUser } from "./model";
import { getUserIdHandling } from "@magda/typescript-common/lib/session/GetUserId";

const router: express.Router = express.Router();

function handlePromise<T>(res: express.Response, promise: Promise<Maybe<T>>) {
  return promise
    .then(user =>
      user.caseOf({
        just: user => Promise.resolve(res.json(user)),
        nothing: () => Promise.resolve(res.status(404))
      })
    )
    .catch(e => {
      console.error(e);
      res.status(500);
    })
    .then(() => res.send());
}

router.get("/private/users/lookup", function(req, res) {
  const source = req.query.source;
  const sourceId = req.query.sourceId;

  handlePromise(res, getUserByExternalDetails(source, sourceId));
});

router.get("/private/users/:userId", function(req, res) {
  const userId = req.params.userId;

  handlePromise(res, getUser(userId));
});

router.post("/private/users", function(req, res) {
  createUser(req.body)
    .then(user => {
      res.json(user);
      res.status(201);
    })
    .catch(e => {
      console.error(e);
      res.status(500);
    })
    .then(() => res.send());
});

router.get("/public/users/whoami", function(req, res) {
  getUserIdHandling(req, res, (userId: string) =>
    handlePromise(res, getUser(userId))
  );
});

router.get("/public/users/:userId", (req, res) => {
  const userId = req.params.userId;

  const getPublicUser = getUser(userId).then(userMaybe =>
    userMaybe.map(user => {
      const publicUser: PublicUser = {
        id: user.id,
        photoURL: user.photoURL,
        displayName: user.displayName
      };

      return publicUser;
    })
  );

  handlePromise(res, getPublicUser);
});

// This is for getting a JWT in development so you can do fake authenticated requests to a local server.
if (process.env.NODE_ENV !== "production") {
  router.get("public/jwt", function(req, res) {
    res.status(200);
    res.write("X-Magda-Session: " + req.header("X-Magda-Session"));
    res.send();
  });
}

export default router;
