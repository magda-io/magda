import {} from "mocha";
import { expect } from "chai";
import * as sinon from "sinon";
import onRecordFound from "../onRecordFound";
import * as sampleAodnDataset from "./sampleAodnDataset.json";
import * as sampleLauncestonDataset from "./sampleLauncestonDataset.json";
import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";

describe("onRecordFound", function(this: Mocha.ISuiteCallbackContext) {

    it("Should process sample launceston dataset data correctly", function() { 

        const sampleDatasetData: any = sampleLauncestonDataset;

        it("Should return `ESRI REST` for distribution no. 2", () => {
            const registry = sinon.createStubInstance(Registry);
            const resultAspects:any = [];
            registry.putRecordAspect.callsFake((disId:any,aType:any,aspect:any)=>{
                resultAspects.push(aspect);
                return new Promise((resolve, reject) => resolve());
            });
            return onRecordFound(sampleDatasetData, registry).then(()=>{
                expect(resultAspects).to.be.an('array');
                expect(resultAspects.length).to.equal(8);
                expect(resultAspects[0]).to.include({
                    format: "WEB"
                });
                expect(resultAspects[1]).to.include({
                    format: "ESRI REST"
                });
                expect(resultAspects[2]).to.include({
                    format: "GEOJSON"
                });
                expect(resultAspects[3]).to.include({
                    format: "CSV"
                });
                expect(resultAspects[4]).to.include({
                    format: "KML"
                });
                expect(resultAspects[5]).to.include({
                    format: "ZIP"
                });
                expect(resultAspects[6]).to.include({
                    format: "WMS"
                });
                expect(resultAspects[7]).to.include({
                    format: "WFS"
                });
            });
        });

    });

    describe("Should process sample aodn distributions correctly", function() { 

        const sampleDatasetData: any = sampleAodnDataset;

        it("Should process 1st distribution as `CSIRO Open APP`", () => {
            const registry = sinon.createStubInstance(Registry);
            const resultAspects:any = [];
            registry.putRecordAspect.callsFake((disId:any,aType:any,aspect:any)=>{
                resultAspects.push(aspect);
                return new Promise((resolve, reject) => resolve());
            });
            return onRecordFound(sampleDatasetData, registry).then(()=>{
                expect(resultAspects).to.be.an('array');
                expect(resultAspects.length).to.equal(6);
                expect(resultAspects[0]).to.include({
                    format: "WMS"
                });
                expect(resultAspects[1]).to.include({
                    format: "CSIRO OPEN APP"
                });
                expect(resultAspects[2]).to.include({
                    format: "PDF"
                });
                expect(resultAspects[3]).to.include({
                    format: "HTML"
                });
                expect(resultAspects[4]).to.include({
                    format: "HTML"
                });
                expect(resultAspects[5]).to.include({
                    format: "HTML"
                });
            });
        });

    });

});

