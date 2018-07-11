"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const api_1 = require("./src/api");
const nodeConfig = require("config");
// Create a new Express application.
var app = express();
app.use(require("body-parser").json());
app.use("/v0", api_1.default);
app.listen(nodeConfig.get("listenPort"));
console.log("Auth API started on port " + nodeConfig.get("listenPort"));
process.on("unhandledRejection", (reason, promise) => {
    console.error(reason);
});
//# sourceMappingURL=index.js.map
