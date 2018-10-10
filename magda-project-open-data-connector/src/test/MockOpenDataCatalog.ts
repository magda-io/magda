import { MockExpressServer } from "@magda/typescript-common/dist/test/connectors/MockExpressServer";

export class MockOpenDataCatalog extends MockExpressServer {
    spec: any;

    constructor(spec: any) {
        super();
        this.spec = spec;
    }

    runImplementation(registry: any) {
        registry.all("*", (req: any, res: any) => {
            res.json(this.spec);
        });
    }
}
