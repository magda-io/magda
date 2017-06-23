require("isomorphic-fetch");
const config = require("config");
const cors = require("cors");

import * as express from "express";

import reverseProxy from "./src/api-proxy";
import authRouter from "./src/auth-router";
import webProxy from './src/web-proxy';

// Create a new Express application.
var app = express();

const configuredCors = cors({
  origin: true,
  credentials: true
});

app.options("*", configuredCors);
app.use(configuredCors);

// Configure view engine to render EJS templates.
app.set("views", __dirname + "/views");
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
