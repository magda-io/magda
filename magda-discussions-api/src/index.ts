import * as express from 'express';
import * as yargs from 'yargs';

import ApiClient from "@magda/authorization-api/dist/ApiClient";
import createApiRouter from './createApiRouter';
import Database from './Database';

const argv = yargs
    .config()
    .help()
    .option('listenPort', {
        describe: 'The TCP/IP port on which the authorization-api should listen.',
        type: 'number',
        default: 6105
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
    .option('authenticationApi', {
        describe: 'The base URL of the authentication API.',
        type: 'string',
        default: 'http://localhost:6104/v0'
    })
    .argv;

const app = express();
app.use(require("body-parser").json());

app.use("/v0", createApiRouter({
    database: new Database({
        dbHost: argv.dbHost,
        dbPort: argv.dbPort,
    }),
    authenticationApi: new ApiClient(argv.authenticationApi)
}));

const listenPort = argv.listenPort;
app.listen(listenPort);
console.log("Listening on " + listenPort)

process.on("unhandledRejection", (reason: string, promise: any) => {
  console.error(reason);
});
