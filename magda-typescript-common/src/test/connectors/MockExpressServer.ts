const express = require("express");

export abstract class MockExpressServer {
    server: any;
    public app: any;

    async run(port: number) {
        this.app = express();

        await this.runImplementation(this.app);

        return new Promise(resolve => {
            this.server = this.app.listen(port, () => {
                resolve(this);
            });
        });
    }

    abstract runImplementation(app: any): void;
}
