import * as express from "express";
import createBaseProxy from "./createBaseProxy";

export default function createGenericProxy(target: string): express.Router {
    const webRouter = express.Router();
    const proxy = createBaseProxy();

    webRouter.get("*", (req: express.Request, res: express.Response) => {
        proxy.web(req, res, { target });
        res.removeHeader("X-Powered-By");
    });

    return webRouter;
}
