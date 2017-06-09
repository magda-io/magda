require("isomorphic-fetch");
const config = require("config");

import * as express from 'express';

import reverseProxy from './src/api-proxy';
import authRouter from './src/auth-router';

// Create a new Express application.
var app = express();


// Configure view engine to render EJS templates.
app.set("views", __dirname + "/views");
app.set("view engine", "ejs");
app.use(require("morgan")("combined"));

app.use('/auth', authRouter);
app.use('/api/v0', reverseProxy);

app.listen(config.get("listenPort"));
console.log("Listening on port " + config.get("listenPort"));

process.on("unhandledRejection", (reason: string, promise: any) => {
  console.error(reason);
});
