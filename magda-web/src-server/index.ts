require("isomorphic-fetch");
const config = require("config");
const path = require('path');

import * as express from "express";

var app = express();

app.use(express.static(path.join(__dirname, '..', 'build')));

// URLs in this list will load index.html and be handled by React routing.
const topLevelRoutes = [
    'search',
    'feedback',
    'contact',
    'account',
    'sign-in-redirect',
    'dataset',
    'projects',
    'publishers'
];

topLevelRoutes.forEach(topLevelRoute => {
    app.get('/' + topLevelRoute, function (req, res) {
        res.sendFile(path.join(__dirname, '..', 'build', 'index.html'));
    });
    app.get('/' + topLevelRoute + '/*', function (req, res) {
        res.sendFile(path.join(__dirname, '..', 'build', 'index.html'));
    });
});

app.listen(config.get("listenPort"));
console.log("Listening on port " + config.get("listenPort"));

process.on("unhandledRejection", (reason: string, promise: any) => {
  console.error(reason);
});
