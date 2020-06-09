import {} from "mocha";
import { expect } from "chai";
import supertest from "supertest";
import express from "express";
import _ from "lodash";

import { buildDataset } from "../utils/builders";
import { Dataset, SearchResult, Location } from "../../model";
import {
    fromBoundingBox,
    qldDataset,
    nationalDataset1,
    nationalDataset2
} from "../utils/spatial";

export default function testSearchByKeyword(
    app: () => express.Application,
    buildDatasetIndex: (datasets: Dataset[]) => Promise<void>
) {
    it("for a region in query text should boost results from that region", async () => {
        await buildDatasetIndex([
            qldDataset,
            nationalDataset1,
            nationalDataset2
        ]);

        await supertest(app())
            .get(`/datasets?query=wildlife density`)
            .expect(200)
            .expect((res) => {
                const body: SearchResult = res.body;
                const identifiers = body.dataSets.map(
                    (dataset) => dataset.identifier
                );

                expect(identifiers).to.eql([
                    nationalDataset1.identifier,
                    nationalDataset2.identifier,
                    qldDataset.identifier
                ]);
            });

        await supertest(app())
            .get(`/datasets?query=wildlife density in queensland`)
            .expect(200)
            .expect((res) => {
                const body: SearchResult = res.body;
                const identifiers = body.dataSets.map(
                    (dataset) => dataset.identifier
                );

                expect(identifiers).to.eql([
                    qldDataset.identifier,
                    nationalDataset2.identifier
                ]);
            });
    });

    it("for a region _acronym_ in query text should boost results from that region", async () => {
        const saGeometry: Location = {
            geoJson: fromBoundingBox([-27, 134, -30, 130])
        };

        const saDataset = buildDataset({
            identifier: "ds-region-in-query-test-1",
            title: "Wildlife density in rural areas south",
            description: "Wildlife density as measured by the state survey",
            catalog: "region-in-query-test-catalog",
            spatial: saGeometry,
            quality: 0.6,
            hasQuality: true,
            publishingState: "published"
        });

        const nationalDataset1 = buildDataset({
            identifier: "ds-region-in-query-test-2",
            title: "Wildlife density in rural areas south",
            description:
                "Wildlife density aggregated from states' measures of wildlife density.",
            catalog: "region-in-query-test-catalog",
            quality: 0.6,
            hasQuality: true,
            publishingState: "published"
        });

        const nationalDataset2 = buildDataset({
            identifier: "ds-region-in-query-test-3",
            title: "Wildlife density in rural areas south",
            description:
                "Wildlife density aggregated from states' measures of wildlife density in SA.",
            catalog: "region-in-query-test-catalog",
            quality: 0.6,
            hasQuality: true,
            publishingState: "published"
        });

        await buildDatasetIndex([
            saDataset,
            nationalDataset1,
            nationalDataset2
        ]);

        await supertest(app())
            .get(`/datasets?query=wildlife density`)
            .expect(200)
            .expect((res) => {
                const body: SearchResult = res.body;
                const identifiers = body.dataSets.map(
                    (dataset) => dataset.identifier
                );

                expect(identifiers).to.eql([
                    nationalDataset1.identifier,
                    nationalDataset2.identifier,
                    saDataset.identifier
                ]);
            });

        await supertest(app())
            .get(`/datasets?query=wildlife density in SA`)
            .expect(200)
            .expect((res) => {
                const body: SearchResult = res.body;
                const identifiers = body.dataSets.map(
                    (dataset) => dataset.identifier
                );

                expect(identifiers).to.eql([
                    saDataset.identifier,
                    nationalDataset2.identifier
                ]);
            });

        await supertest(app())
            .get(`/datasets?query=wildlife density south`)
            .expect(200)
            .expect((res) => {
                const body: SearchResult = res.body;
                const identifiers = body.dataSets.map(
                    (dataset) => dataset.identifier
                );

                expect(identifiers).to.eql([
                    nationalDataset1.identifier,
                    nationalDataset2.identifier,
                    saDataset.identifier
                ]);
            });
    });

    it("keywords matching a region should (within reason) outweigh keywords that match part of the description", async () => {
        // This has a dataset with the word "Alfredton" in the description, and a dataset without that keyword in the description
        // but a spatial extent that overlaps the region "Alfredton" - the region match should get priority.
        const alfredtonGeometry: Location = {
            geoJson: fromBoundingBox([-37.555, 143.81, -37.56, 143.8])
        };

        const alfDataset = buildDataset({
            identifier: "ds-region-in-query-test-1",
            title: "Wildlife density in rural areas",
            description: "Wildlife density as measured by the state survey",
            catalog: "region-in-query-test-catalog",
            spatial: alfredtonGeometry,
            quality: 0.6,
            hasQuality: true,
            publishingState: "published"
        });

        const nationalDataset1 = buildDataset({
            identifier: "ds-region-in-query-test-2",
            title: "Wildlife density in rural areas",
            description:
                "Wildlife density aggregated from states' measures of wildlife density.",
            catalog: "region-in-query-test-catalog",
            quality: 0.6,
            hasQuality: true,
            publishingState: "published"
        });

        const nationalDataset2 = buildDataset({
            identifier: "ds-region-in-query-test-3",
            title: "Wildlife density in rural areas",
            description:
                "Wildlife density aggregated from states' measures of wildlife density in Alfredton.",
            catalog: "region-in-query-test-catalog",
            quality: 0.6,
            hasQuality: true,
            publishingState: "published"
        });

        await buildDatasetIndex([
            alfDataset,
            nationalDataset1,
            nationalDataset2
        ]);

        await supertest(app())
            .get(`/datasets?query=wildlife density`)
            .expect(200)
            .expect((res) => {
                const body: SearchResult = res.body;
                const identifiers = body.dataSets.map(
                    (dataset) => dataset.identifier
                );

                expect(identifiers).to.eql([
                    nationalDataset1.identifier,
                    nationalDataset2.identifier,
                    alfDataset.identifier
                ]);
            });

        await supertest(app())
            .get(`/datasets?query=wildlife density in Alfredton`)
            .expect(200)
            .expect((res) => {
                const body: SearchResult = res.body;
                const identifiers = body.dataSets.map(
                    (dataset) => dataset.identifier
                );

                expect(identifiers).to.eql([
                    alfDataset.identifier,
                    nationalDataset2.identifier
                ]);
            });
    });
}
