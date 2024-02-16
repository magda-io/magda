import getWebhookUrl from "./getWebhookUrl.js";
import MinionOptions from "./MinionOptions.js";
import { Application } from "express";

export default function startApiEndpoints(
    server: Application,
    options: MinionOptions
) {
    function getPort() {
        return options.argv.listenPort;
    }

    server.listen(getPort());
    console.info(`Listening at ${getWebhookUrl(options)}`);
}
