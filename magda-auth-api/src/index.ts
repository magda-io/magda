import * as express from 'express';

import apiRouter from './api';
const nodeConfig = require('config');

// Create a new Express application.
var app = express();
app.use(require("body-parser").json());

app.use('/v0', apiRouter);

app.listen(nodeConfig.get("listenPort"));
console.log("Auth API started on port " + nodeConfig.get("listenPort"));

process.on("unhandledRejection", (reason: string, promise: any) => {
  console.error("Unhandled rejection:");
  console.error(reason);
});
