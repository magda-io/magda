import {} from "mocha";
import { expect } from "chai";
import * as sinon from "sinon";
import onRecordFound from "../onRecordFound";

import * as launcestonDist2 from "./sampleDataFiles/launceston-dist-2.json";
import * as launcestonDist7 from "./sampleDataFiles/launceston-dist-7.json";
import * as launcestonDist8 from "./sampleDataFiles/launceston-dist-8.json";

import * as aodnDist1 from "./sampleDataFiles/aodn-dist-1.json";
import * as aodnDist2 from "./sampleDataFiles/aodn-dist-2.json";
import * as aodnDist3 from "./sampleDataFiles/aodn-dist-3.json";
import * as aodnDist4 from "./sampleDataFiles/aodn-dist-4.json";
import * as aodnDist5 from "./sampleDataFiles/aodn-dist-5.json";
import * as aodnDist6 from "./sampleDataFiles/aodn-dist-6.json";

import * as dapDist1 from "./sampleDataFiles/dap-dist-1.json";
import * as dapDist28 from "./sampleDataFiles/dap-dist-28.json";

import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";

describe("onRecordFound", function(this: Mocha.ISuiteCallbackContext) {
    async function testDistReturnsFormat(
        distributionData: any,
        format: string
    ) {
        let resultAspect: any;
        const registry = sinon.createStubInstance(Registry);
        registry.putRecordAspect.callsFake(
            (disId: any, aType: any, aspect: any) => {
                resultAspect = aspect;
                return new Promise((resolve, reject) => resolve());
            }
        );

        await onRecordFound(distributionData, registry);

        expect(resultAspect).to.include({
            format
        });
    }

    describe("Should process sample launceston dataset data correctly", function() {
        it("Should return `ESRI REST` for distribution no. 2", () => {
            return testDistReturnsFormat(launcestonDist2, "ESRI REST");
        });

        it("Should return `WMS` for distribution no.7", () => {
            return testDistReturnsFormat(launcestonDist7, "WMS");
        });

        it("Should return `WFS` for distribution no.8", () => {
            return testDistReturnsFormat(launcestonDist8, "WFS");
        });
    });

    describe("Should process sample aodn distributions correctly", function() {
        it("Should process 1st distribution as `HTML`", () => {
            return testDistReturnsFormat(aodnDist1, "HTML");
        });

        it("Should process 2nd distribution dcat format string `WWW:DOWNLOAD-1.0-http--csiro-oa-app` as `CSIRO Open APP`", () => {
            return testDistReturnsFormat(aodnDist2, "CSIRO OPEN APP");
        });

        it("Should process 3rd distribution as `PDF`", () => {
            return testDistReturnsFormat(aodnDist3, "PDF");
        });

        it("Should process 4th distribution as `HTML`", () => {
            return testDistReturnsFormat(aodnDist4, "HTML");
        });

        it("Should process 5th distribution as `HTML`", () => {
            return testDistReturnsFormat(aodnDist5, "HTML");
        });

        it("Should process 6th distribution as `HTML`", () => {
            return testDistReturnsFormat(aodnDist6, "HTML");
        });
    });

    describe("Should process sample DAP dataset correctly", function() {
        it("Should process `application/pdf` (1st distribution) as `PDF`", () => {
            return testDistReturnsFormat(dapDist1, "PDF");
        });

        it("Should process 1image/svg+xml` (28th distribution) as `SVG`", () => {
            return testDistReturnsFormat(dapDist28, "SVG");
        });
    });
});
