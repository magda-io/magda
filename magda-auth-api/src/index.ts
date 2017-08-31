import * as express from 'express';
import * as yargs from 'yargs';

import apiRouter from './api';

const argv = yargs
    .config()
    .help()
    .option('listenPort', {
        describe: 'The TCP/IP port on which the auth-api should listen.',
        type: 'number',
        default: 6104
    })
    .option('dbHost', {
        describe: 'The host running the session database.',
        type: 'string',
        default: 'localhost'
    })
    .option('dbPort', {
        describe: 'The port running the session database.',
        type: 'number',
        default: 5432
    })
    .argv;

// Create a new Express application.
var app = express();
app.use(require("body-parser").json());

app.use('/v0', apiRouter);

app.listen(argv.listenPort);
console.log("Auth API started on port " + argv.listenPort);

process.on("unhandledRejection", (reason: string, promise: any) => {
  console.error(reason);
});
