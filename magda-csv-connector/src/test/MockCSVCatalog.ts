import { MockExpressServer } from "@magda/typescript-common/dist/test/connectors/MockExpressServer";

export class MockCSVCatalog extends MockExpressServer {
    mime: any;
    spec: any;

    constructor(spec: any) {
        super();
        this.mime = spec.mime;
        this.spec = spec.data;
    }

    runImplementation(registry: any) {
        registry.all("*", (req: any, res: any) => {
            res.set("Content-Type", this.mime).send(this.spec);
        });
    }
}
