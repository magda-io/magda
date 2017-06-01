require("isomorphic-fetch");
const config = require("config");

import * as express from 'express';

import reverseProxy from './src/api-proxy';
// import authRouter from './src/auth-router';
// import setupAuth from './src/setup-auth';


// Create a new Express application.
var app = express();

// setupAuth(app);

// app.use('/auth', authRouter);
app.use('/api/v0', reverseProxy);

app.listen(config.get("listenPort"));
console.log("Listening on port " + config.get("listenPort"));

process.on("unhandledRejection", (reason: string, promise: any) => {
  console.error(reason);
});
