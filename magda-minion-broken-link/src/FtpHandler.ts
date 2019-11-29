import Client from "ftp";
import LRU from "lru-cache";

export default class FTPHandler {
    clientFactory: () => Client;

    lru = LRU<Promise<Client>>({
        max: 20,
        dispose(key, pClient) {
            pClient.then(client => client.end());
        }
    });

    constructor(clientFactory: () => Client = () => new Client()) {
        this.clientFactory = clientFactory;
    }

    getClient(host: string, port: number) {
        let pClient = this.lru.get(`${host}:${port}`);
        if (pClient) {
            return pClient;
        } else {
            const client = this.clientFactory();
            let fulfilled = false;
            pClient = new Promise((resolve, reject) => {
                client.on("ready", () => {
                    fulfilled = true;
                    resolve(client);
                });
                client.on("error", (err: Error) => {
                    if (!fulfilled) {
                        console.info(err);
                        client.destroy();
                        reject(err);
                        fulfilled = true;
                    }
                });
            });
            console.info(
                `Attempting to connect to host: ${host}, port: ${port}`
            );
            client.connect({
                host,
                port
            });
            this.lru.set(`${host}:${port}`, pClient);
            return pClient;
        }
    }
}
