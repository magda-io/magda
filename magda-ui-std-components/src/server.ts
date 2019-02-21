import * as express from "express";
import app from "./app";
import * as cors from "cors";

const port = process.env.PORT || 3001;

const server = express();
server.use(cors());
server.get("*", (req, res) => app(req, res));

server.listen(port, function() {
    console.log("Server started on port", port);
});
