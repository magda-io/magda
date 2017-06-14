import * as express from 'express';

import apiRouter from './src/api';
const nodeConfig = require('config');

const app = express();
app.use(require("body-parser").json());

console.log(process.env.JWT_SECRET);

app.use("/v0", apiRouter);

const listenPort = nodeConfig.get("listenPort")
app.listen(listenPort);
console.log("Listening on " + listenPort)

process.on("unhandledRejection", (reason: string, promise: any) => {
  console.error(reason);
});
