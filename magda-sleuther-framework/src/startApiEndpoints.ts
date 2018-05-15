import getWebhookUrl from "./getWebhookUrl";
import SleutherOptions from "./SleutherOptions";
import { Application } from "express";

export default function startApiEndpoints(
    server: Application,
    options: SleutherOptions
) {
    function getPort() {
        return options.argv.listenPort;
    }

    server.listen(getPort());
    console.info(`Listening at ${getWebhookUrl(options)}`);
}
