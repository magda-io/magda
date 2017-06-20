require("isomorphic-fetch");
const config = require("config");
const cors = require("cors");
const path = require('path');

import * as express from "express";

// Create a new Express application.
var app = express();

app.use(express.static(path.join(__dirname, 'build')));
app.get(/^\/search(\/.*)?/, function (req, res) {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(config.get("listenPort"));
console.log("Listening on port " + config.get("listenPort"));

process.on("unhandledRejection", (reason: string, promise: any) => {
  console.error(reason);
});
