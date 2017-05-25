import * as express from 'express';

import apiRouter from './src/api';

// Create a new Express application.
var app = express();
app.use(require("body-parser").json());

app.use('/v0', apiRouter);

app.listen(3001);

process.on("unhandledRejection", (reason: string, promise: any) => {
  console.error(reason);
});
