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
        describe: 'The host running the auth database.',
        type: 'string',
        default: 'localhost'
    })
    .option('dbPort', {
        describe: 'The port running the auth database.',
        type: 'number',
        default: 5432
    })
    .argv;

const app = express();
app.use(require("body-parser").json());

app.use("/v0", apiRouter);

const listenPort = argv.listenPort;
app.listen(listenPort);
console.log("Listening on " + listenPort)

process.on("unhandledRejection", (reason: string, promise: any) => {
  console.error(reason);
});
