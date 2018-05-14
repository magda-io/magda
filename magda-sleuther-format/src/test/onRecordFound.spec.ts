import {} from "mocha";
import { expect } from "chai";
import * as sinon from "sinon";
import onRecordFound from "../onRecordFound";
import * as sampleAodnDataset from "./sampleDataFiles/sampleAodnDataset.json";
import * as sampleLauncestonDataset from "./sampleDataFiles/sampleLauncestonDataset.json";
import * as sampleDataset3 from "./sampleDataFiles/ds-aodn-a71949b0-ebf5-43fd-84ee-9cb6c4a7fd1f.json";
import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";

describe("onRecordFound", function(this: Mocha.ISuiteCallbackContext) {
    describe("Should process sample launceston dataset data correctly", function() {
        const sampleDatasetData: any = sampleLauncestonDataset;
        const resultAspects: any = [];

        before(function() {
            const registry = sinon.createStubInstance(Registry);
            registry.putRecordAspect.callsFake(
                (disId: any, aType: any, aspect: any) => {
                    resultAspects.push(aspect);
                    return new Promise((resolve, reject) => resolve());
                }
            );
            return onRecordFound(sampleDatasetData, registry);
        });

        it("Should return `ESRI REST` for distribution no. 2", () => {
            expect(resultAspects).to.be.an("array");
            expect(resultAspects[1]).to.include({
                format: "ESRI REST"
            });
        });

        it("Should return `WMS` for distribution no.7", () => {
            expect(resultAspects).to.be.an("array");
            expect(resultAspects[6]).to.include({
                format: "WMS"
            });
        });

        it("Should return `WFS` for distribution no.8", () => {
            expect(resultAspects).to.be.an("array");
            expect(resultAspects[7]).to.include({
                format: "WFS"
            });
        });
    });

    describe("Should process sample aodn distributions correctly", function() {
        const sampleDatasetData: any = sampleAodnDataset;
        const resultAspects: any = [];

        before(function() {
            const registry = sinon.createStubInstance(Registry);
            registry.putRecordAspect.callsFake(
                (disId: any, aType: any, aspect: any) => {
                    resultAspects.push(aspect);
                    return new Promise((resolve, reject) => resolve());
                }
            );
            return onRecordFound(sampleDatasetData, registry);
        });

        it("Should process 2nd distribution dcat format string `WWW:DOWNLOAD-1.0-http--csiro-oa-app` as `CSIRO Open APP`", () => {
            expect(resultAspects).to.be.an("array");
            expect(resultAspects[1]).to.include({
                format: "CSIRO OPEN APP"
            });
        });

        it("Should process 3rd distribution as `PDF`", () => {
            expect(resultAspects).to.be.an("array");
            expect(resultAspects[2]).to.include({
                format: "PDF"
            });
        });

        it("Should process 4th distribution as `HTML`", () => {
            expect(resultAspects).to.be.an("array");
            expect(resultAspects[3]).to.include({
                format: "HTML"
            });
        });

        it("Should process 5th distribution as `HTML`", () => {
            expect(resultAspects).to.be.an("array");
            expect(resultAspects[4]).to.include({
                format: "HTML"
            });
        });

        it("Should process 6th distribution as `HTML`", () => {
            expect(resultAspects).to.be.an("array");
            expect(resultAspects[5]).to.include({
                format: "HTML"
            });
        });
    });

    describe("Should process sample dataset no.3 data correctly", function() {
        const sampleDatasetData: any = sampleDataset3;
        const resultAspects: any = [];

        before(function() {
            const registry = sinon.createStubInstance(Registry);
            registry.putRecordAspect.callsFake(
                (disId: any, aType: any, aspect: any) => {
                    resultAspects.push(aspect);
                    return new Promise((resolve, reject) => resolve());
                }
            );
            return onRecordFound(sampleDatasetData, registry);
        });

        it("Should process 2nd distribution as `HTML`", () => {
            expect(resultAspects).to.be.an("array");
            expect(resultAspects[1]).to.include({
                format: "HTML"
            });
        });
    });
});
