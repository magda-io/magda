const express = require("express");

export abstract class MockExpressServer {
    server: any;

    async run(port: number) {
        const app: any = express();

        await this.runImplementation(app);

        return new Promise(resolve => {
            this.server = app.listen(port, () => {
                resolve(this);
            });
        });
    }

    abstract runImplementation(app: any): void;
}
