import getWebhookUrl from "./getWebhookUrl";
import SleutherOptions from "./SleutherOptions";

export default function startApiEndpoints(options: SleutherOptions) {
    const server = options.express();

    function getPort() {
        return options.argv.listenPort;
    }

    server.listen(getPort());
    console.info(`Listening at ${getWebhookUrl(options)}`);
}
