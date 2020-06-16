import express from "express";
import createBaseProxy from "./createBaseProxy";
import { ApiRouterOptions } from "./createApiRouter";

export default function createGenericProxy(
    target: string,
    options: ApiRouterOptions
): express.Router {
    const webRouter = express.Router();
    const proxy = createBaseProxy(options);

    webRouter.get("*", (req: express.Request, res: express.Response) => {
        proxy.web(req, res, { target });
    });

    return webRouter;
}
