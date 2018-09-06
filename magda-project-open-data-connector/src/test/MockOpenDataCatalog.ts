const express = require("express");

export class MockOpenDataCatalog {
    spec: any;
    server: any;

    constructor(spec: any) {
        this.spec = spec;
    }

    run(port: number) {
        const registry: any = express();

        registry.all("*", (req: any, res: any) => {
            res.json(this.spec);
        });

        this.server = registry.listen(port);
        return this;
    }
}
