import {} from "mocha";
import * as nock from "nock";
import {
    expect
    //should
} from "chai";

let synonymObject = require("../../../synonyms.json");
import * as fs from "fs";

import getDcatMeasureResult from "../../format-engine/measures/dcatFormatMeasure";
import getExtensionMeasureResult from "../../format-engine/measures/downloadExtensionMeasure";
import getDownloadMeasureResult from "../../format-engine/measures/downloadMeasure";

//import getDcatProcessedData from "../../format-engine/measures/processed-functions/dcatProcessedFns";
//import getDownloadProcessedData from "../../format-engine/measures/processed-functions/dcatProcessedFns";
//import getExtensionProcessedData from "../../format-engine/measures/processed-functions/extensionProcessedFns";

//import getBestMeasureResult  from "../../format-engine/MeasureEvaluator"
//import MeasureEvaluationSet from "src/format-engine/measures/MeasureEvaluationSet";
//import MeasureEvalResult from "src/format-engine/MeasureEvalResult";
import MeasureResult from "src/format-engine/measures/MeasureResult";
import {} from "../../format-engine/formats";
import * as sampleLauncestonDistributionData from "../sampleDataFiles/sampleLauncestonDistributionData.json";

describe("measures tests", function(this: Mocha.ISuiteCallbackContext) {
    before(() => {
        nock("www.google.com")
            .get("/")
            .reply(
                200,
                fs.readFileSync(__dirname + "/resources/Google.html", "utf-8")
            );

        nock("www.snee.com")
            .get("/xml/xslt/sample.doc")
            .reply(
                200,
                fs.readFileSync(__dirname + "/resources/sample.doc", "utf-8")
            );

        nock("www.pj.com")
            .get("/whereispj.htm")
            .reply(
                200,
                fs.readFileSync(__dirname + "/resources/whereispj.htm", "utf-8")
            );
    });

    describe("DownloadMeasure -> getSelectedFormats()", function() {
        it("returns a doc when supplied with a doc", function() {
            var record = getRecordStubForDownloadMeasure(
                "www.snee.com/xml/xslt/sample.doc"
            );

            const ret: MeasureResult = getDownloadMeasureResult(
                record,
                synonymObject
            );

            expect(ret.formats[0].format).to.eql("DOCX");
        });

        it("returns a html page when supplied with a htm", function() {
            var record = getRecordStubForDownloadMeasure(
                "www.pj.com/whereispj.htm"
            );

            const ret: MeasureResult = getDownloadMeasureResult(
                record,
                synonymObject
            );

            expect(ret.formats[0].format).to.eql("HTML");
        });
    });

    describe("DownloadExtensionMeasure -> getSelectedFormats()", function() {
        it("returns html on normal possibly cloaked pages", function() {
            var record = getRecordStubForDownloadExtensionMeasure(
                "www.google.com/"
            );

            const ret: MeasureResult = getExtensionMeasureResult(
                record,
                synonymObject
            );

            expect(ret.formats[0].format).to.eql("HTML");
        });

        it("returns a doc when supplied with a doc", function() {
            var record = getRecordStubForDownloadExtensionMeasure(
                "www.snee.com/xml/xslt/sample.doc"
            );

            const ret: MeasureResult = getExtensionMeasureResult(
                record,
                synonymObject
            );

            expect(ret.formats[0].format).to.eql("DOCX");
        });

        it("returns a html page when supplied with a htm", function() {
            var record = getRecordStubForDownloadExtensionMeasure(
                "www.pj.com/whereispj.htm"
            );

            const ret: MeasureResult = getExtensionMeasureResult(
                record,
                synonymObject
            );

            expect(ret.formats[0].format).to.eql("HTML");
        });
    });

    describe("DcatFormatMeasusre -> getSelectedFormats()", function() {
        //try docx txt msword
        // it only tests formats not confidence levels
        it("returns 1 worded strings", function() {
            let recordPDF = getRecordStubForDcatFormatMeasure("pDf");
            let recordDOCX = getRecordStubForDcatFormatMeasure("DoCx");
            let recordTXT = getRecordStubForDcatFormatMeasure("txT");

            let testPDF: MeasureResult = getDcatMeasureResult(
                recordPDF,
                synonymObject
            );
            let testDOCX: MeasureResult = getDcatMeasureResult(
                recordDOCX,
                synonymObject
            );
            let testTXT: MeasureResult = getDcatMeasureResult(
                recordTXT,
                synonymObject
            );

            expect(testPDF.formats[0].format).to.eql("PDF") &&
                expect(testDOCX.formats[0].format).to.eql("DOCX") &&
                expect(testTXT.formats[0].format).to.eql("TXT");
        });

        it("Classes CSW WWW: formats in synonyms as HTML", () => {
            const testWWW: MeasureResult = getDcatMeasureResult(
                getRecordStubForDcatFormatMeasure("WWW:LINK-1"),
                synonymObject
            );

            expect(testWWW.formats[0].format).to.equal("HTML");
        });

        it("doesn't return CSW WWW: formats unless that aren't synonym'd", () => {
            const testWWW: MeasureResult = getDcatMeasureResult(
                getRecordStubForDcatFormatMeasure("WWW:DOWNLOAD"),
                synonymObject
            );

            expect(testWWW.formats[0].format).to.equal(null);
        });

        it("successfully separates &", function() {
            let recordPDF = getRecordStubForDcatFormatMeasure("pDf & Docx");
            let recordDOCX = getRecordStubForDcatFormatMeasure("DoCx   & Pdf");
            let recordTXT = getRecordStubForDcatFormatMeasure("txT    & html");

            let testPDF: MeasureResult = getDcatMeasureResult(
                recordPDF,
                synonymObject
            );
            let testDOCX: MeasureResult = getDcatMeasureResult(
                recordDOCX,
                synonymObject
            );
            let testTXT: MeasureResult = getDcatMeasureResult(
                recordTXT,
                synonymObject
            );

            expect(testPDF.formats[0].format).to.eql("PDF") &&
                expect(testPDF.formats[1].format).to.eql("DOCX") &&
                expect(testDOCX.formats[0].format).to.eql("DOCX") &&
                expect(testDOCX.formats[1].format).to.eql("PDF") &&
                expect(testTXT.formats[0].format).to.eql("TXT") &&
                expect(testTXT.formats[1].format).to.eql("HTML");
        });

        it("successfully chooses () formats", function() {
            let recordPDF = getRecordStubForDcatFormatMeasure("zIp (Docx)");
            let recordDOCX = getRecordStubForDcatFormatMeasure(
                "some zipper file    (Pdf)"
            );
            let recordTXT = getRecordStubForDcatFormatMeasure("txT    (html)");

            let testPDF: MeasureResult = getDcatMeasureResult(
                recordPDF,
                synonymObject
            );
            let testDOCX: MeasureResult = getDcatMeasureResult(
                recordDOCX,
                synonymObject
            );
            let testTXT: MeasureResult = getDcatMeasureResult(
                recordTXT,
                synonymObject
            );

            expect(testPDF.formats[0].format).to.eql("DOCX") &&
                expect(testPDF.formats.length).to.equal(1) &&
                expect(testDOCX.formats[0].format).to.eql("PDF") &&
                expect(testDOCX.formats.length).to.equal(1) &&
                expect(testTXT.formats[0].format).to.eql("HTML") &&
                expect(testTXT.formats.length).to.equal(1);
        });
    });

    describe("Should return correct format for `sampleLauncestonDistributionData.json`", function() {
        const distributions: any[7] = sampleLauncestonDistributionData;

        it("Should return `ESRI REST` for distribution no. 2 when get result by extension", () => {
            const distribution: any = distributions[1];
            const r: MeasureResult = getExtensionMeasureResult(
                distribution,
                synonymObject
            );
            expect(r.formats[0].format).to.equal("ESRI REST");
        });

        it("Should return `WMS` for distribution no. 7 when get result by extension", () => {
            const distribution: any = distributions[6];
            const r: MeasureResult = getExtensionMeasureResult(
                distribution,
                synonymObject
            );
            expect(r.formats[0].format).to.equal("WMS");
        });

        it("Should return `WFS` for distribution no. 8 when get result by extension", () => {
            const distribution: any = distributions[7];
            const r: MeasureResult = getExtensionMeasureResult(
                distribution,
                synonymObject
            );
            expect(r.formats[0].format).to.equal("WFS");
        });

        it("Should return `ESRI REST` for distribution no. 2 when get result by format", () => {
            const distribution: any = distributions[1];
            const r: MeasureResult = getDcatMeasureResult(
                distribution,
                synonymObject
            );
            expect(r.formats[0].format).to.equal("ESRI REST");
        });

        it("Should return `WMS` for distribution no. 7 when get result by format", () => {
            const distribution: any = distributions[6];
            const r: MeasureResult = getDcatMeasureResult(
                distribution,
                synonymObject
            );
            expect(r.formats[0].format).to.equal("WMS");
        });

        it("Should return `WFS` for distribution no. 8 when get result by format", () => {
            const distribution: any = distributions[7];
            const r: MeasureResult = getDcatMeasureResult(
                distribution,
                synonymObject
            );
            expect(r.formats[0].format).to.equal("WFS");
        });
    });
});

// helper functions

function getRecordStubForDownloadMeasure(downloadURL: string) {
    return getGeneralRecordStub(downloadURL, null, null);
}

function getRecordStubForDownloadExtensionMeasure(downloadURL: string) {
    return getGeneralRecordStub(downloadURL, null, null);
}

function getRecordStubForDcatFormatMeasure(format: string) {
    return getGeneralRecordStub(null, format, null);
}

function getGeneralRecordStub(
    downloadURL: string,
    format: string,
    mediaType: string
) {
    return {
        aspects: {
            "dcat-distribution-strings": {
                downloadURL: downloadURL,
                format: format,
                mediaType: mediaType
            }
        },
        id: "10",
        name: "coolstuff"
    };
}
