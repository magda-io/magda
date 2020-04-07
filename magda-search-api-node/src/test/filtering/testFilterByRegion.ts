import {} from "mocha";
import { expect } from "chai";
import supertest from "supertest";
import express from "express";
import _ from "lodash";

import { Dataset, SearchResult } from "../../model";
import {
    qldDataset,
    nationalDataset1,
    nationalDataset2
} from "../utils/spatial";

export default function testFilterByRegion(
    app: () => express.Application,
    buildDatasetIndex: (datasets: Dataset[]) => Promise<void>
) {
    describe("by region", () => {
        it("should return datasets in the specified region", async () => {
            await buildDatasetIndex([
                qldDataset,
                nationalDataset1,
                nationalDataset2
            ]);

            await supertest(app())
                .get(`/datasets?region=ithinkthisisregiontype:3`)
                .expect(200)
                .expect(res => {
                    const body: SearchResult = res.body;
                    const identifiers = body.dataSets.map(
                        dataset => dataset.identifier
                    );

                    expect(identifiers).to.eql([qldDataset.identifier]);
                });
        });
    });
}
