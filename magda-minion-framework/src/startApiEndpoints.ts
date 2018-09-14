import getWebhookUrl from "./getWebhookUrl";
import MinionOptions from "./MinionOptions";
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
