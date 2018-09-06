const express = require("express");
const body = require("body-parser");

export class MockRegistry {
    aspects: any = {};
    records: any = {};
    server: any;

    run(port: number) {
        const registry: any = express();

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

        this.server = registry.listen(port);
        return this;
    }
}
