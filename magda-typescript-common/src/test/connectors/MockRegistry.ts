import { MockExpressServer } from "./MockExpressServer";

const body = require("body-parser");
const djv = require("djv");

export class MockRegistry extends MockExpressServer {
    aspects: any = {};
    records: any = {};
    env: any = djv();

    runImplementation(registry: any) {
        registry.use(
            body.json({
                limit: "500000kb"
            })
        );

        registry.put("/aspects/:id", (req: any, res: any) => {
            this.aspects[req.params.id] = req.body;
            // our mock registry will validate the data it gets against the schemas it gets
            this.env.addSchema(req.params.id, req.body.jsonSchema);
            res.json(req.body);
        });

        registry.put("/records/:id", (req: any, res: any) => {
            this.records[req.params.id] = req.body;
            // validate aspects
            if (req.body.aspects) {
                for (const [aspect, aspectBody] of Object.entries(
                    req.body.aspects
                )) {
                    try {
                        let invalid = this.env.validate(
                            `${aspect}`,
                            aspectBody
                        );
                        if (invalid) {
                            return res
                                .status(500)
                                .json({
                                    aspect,
                                    aspectBody,
                                    schema: this.aspects[aspect].jsonSchema,
                                    invalid
                                })
                                .end();
                        }
                    } catch (e) {
                        // https://github.com/korzio/djv/issues/71
                        // return res
                        //     .status(500)
                        //     .json({
                        //         aspect,
                        //         aspectBody,
                        //         schema: this.aspects[aspect].jsonSchema,
                        //         error: e.message
                        //     })
                        //     .end();
                        console.log(e.message);
                    }
                }
            }
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

        registry.get("/records/*", (req: any, res: any) => {
            const id = decodeURI(req.path.substr(9));
            res.json(this.records[id]).end();
        });

        registry.get("/records", (req: any, res: any) => {
            res.json(this.records).end();
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
