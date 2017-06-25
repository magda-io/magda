require("isomorphic-fetch");
import * as config from 'config';
import * as cors from 'cors';
import * as express from "express";
import * as path from 'path';

import reverseProxy from "./api-proxy";
import authRouter from "./auth-router";
import webProxy from './web-proxy';

// Create a new Express application.
var app = express();

const configuredCors = cors({
  origin: true,
  credentials: true
});

app.options("*", configuredCors);
app.use(configuredCors);

// Configure view engine to render EJS templates.
app.set("views", path.join(__dirname, '..', 'views'));
app.set("view engine", "ejs");
app.use(require("morgan")("combined"));

app.use("/auth", authRouter);
app.use("/api/v0", reverseProxy);

// Proxy any other URL to magda-web
app.use("/", webProxy);

app.listen(config.get("listenPort"));
console.log("Listening on port " + config.get("listenPort"));

process.on("unhandledRejection", (reason: string, promise: any) => {
  console.error(reason);
});
