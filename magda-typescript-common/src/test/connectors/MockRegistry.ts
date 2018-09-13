import { MockExpressServer } from "./MockExpressServer";

const body = require("body-parser");

export class MockRegistry extends MockExpressServer {
    aspects: any = {};
    records: any = {};

    runImplementation(registry: any) {
        registry.use(
            body.json({
                limit: "500000kb"
            })
        );

        registry.put("/aspects/:id", (req: any, res: any) => {
            this.aspects[req.params.id] = req.body;
            res.json(req.body);
        });

        registry.put("/records/:id", (req: any, res: any) => {
            this.records[req.params.id] = req.body;
            res.json(req.body);
        });

        registry.delete("/records", (req: any, res: any) => {
            let count = 0;
            for (const [recordId, record] of Object.entries(this.records)) {
                if (record.sourceTag === req.query.sourceTagToPreserve) {
                    continue;
                }
                if (record.aspects.source.id === req.query.sourceId) {
                    delete this.records[recordId];
                    count++;
                }
            }
            res.json({ count });
        });

        registry.all("*", function(req: any, res: any) {
            console.log("REG", req.method, req.path, req.body, req.query);
            res.status(200);
        });
    }
}

if (require.main === module) {
    const app = new MockRegistry();
    app.run(8080);
}
