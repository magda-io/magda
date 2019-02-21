import * as next from "next";
// import { OutgoingMessage, IncomingMessage } from "http";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
// const handler = app.getRequestHandler();
const prepare = app.prepare();

export default (req: any, res: any) => {
    return prepare
        .then(() => {
            const path = req.path || "/";

            // if (
            //     path.includes("_next") ||
            //     path.includes("static") ||
            //     path.includes(".")
            // ) {
            app.render(req, res, path, req.query);
            // } else {
            //     req.query.path = path;
            //     app.render(req, res, "/header", req.query);
            // }
        })
        .catch((e: Error) => console.error(e));
};
