import * as express from "express";
// import { Maybe } from "tsmonad";
const Api = require("kubernetes-client");
const fs = require("fs");

// import { getUserIdHandling } from "@magda/typescript-common/dist/session/GetUserId";

const router: express.Router = express.Router();
const details = {
  url: "https://192.168.99.100:8443",
  ca: fs.readFileSync(`/Users/${process.env.USER}/.minikube/ca.crt`),
  cert: fs.readFileSync(`/Users/${process.env.USER}/.minikube/apiserver.crt`),
  key: fs.readFileSync(`/Users/${process.env.USER}/.minikube/apiserver.key`)
};
const batchApi = new Api.Batch(details);

router.get("/crawlers", (req, res) => {
  batchApi.ns.jobs.get((err: Error, result: any) => {
    if (err) {
      console.error(err);
      res.status(500).send("Error");
    } else {
      const crawlers = result.items.map((item: any) => ({
        name: item.metadata.name,
        status: item.status.active === 1 ? "active" : "inactive",
        startTime: item.status.startTime
      }));

      res.status(200).send(crawlers);
    }
  });
});

// // This is for getting a JWT in development so you can do fake authenticated requests to a local server.
// if (process.env.NODE_ENV !== "production") {
//   router.get("public/jwt", function(req, res) {
//     res.status(200);
//     res.write("X-Magda-Session: " + req.header("X-Magda-Session"));
//     res.send();
//   });
// }

export default router;
