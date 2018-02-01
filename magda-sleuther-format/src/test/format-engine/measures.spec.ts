import {} from "mocha";
import * as nock from "nock";
import {
    expect
    //should
} from "chai";

import { Record } from "@magda/typescript-common/dist/generated/registry/api";

import { Formats } from "../../format-engine/formats";
let synonymObject =  require("../../format-engine/synonyms.json");
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
import {  } from "../../format-engine/formats";

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
            var record: Record = getRecordStubForDownloadMeasure(
                "www.snee.com/xml/xslt/sample.doc"
            );

            const ret: MeasureResult = getDownloadMeasureResult(record, synonymObject);

            expect(ret.formats[0].format).to.eql(Formats.MSWORD);
        });

        it("returns a html page when supplied with a htm", function() {
            var record: Record = getRecordStubForDownloadMeasure(
                "www.pj.com/whereispj.htm"
            );

            const ret: MeasureResult = getDownloadMeasureResult(record, synonymObject);

            expect(ret.formats[0].format).to.eql(Formats.HTML);
        });
    });

    describe("DownloadExtensionMeasure -> getSelectedFormats()", function() {
        it("returns html on normal possibly cloaked pages", function() {
            var record: Record = getRecordStubForDownloadExtensionMeasure(
                "www.google.com/"
            );

            const ret: MeasureResult = getExtensionMeasureResult(record, synonymObject);

            expect(ret.formats[0].format).to.eql(Formats.HTML);
        });

        it("returns a doc when supplied with a doc", function() {
            var record: Record = getRecordStubForDownloadExtensionMeasure(
                "www.snee.com/xml/xslt/sample.doc"
            );

            const ret: MeasureResult = getExtensionMeasureResult(record, synonymObject);

            expect(ret.formats[0].format).to.eql(Formats.DOCX);
        });

        it("returns a html page when supplied with a htm", function() {
            var record: Record = getRecordStubForDownloadExtensionMeasure(
                "www.pj.com/whereispj.htm"
            );

            const ret: MeasureResult = getExtensionMeasureResult(record, synonymObject);

            expect(ret.formats[0].format).to.eql(Formats.HTML);
        });
    });

    describe("DcatFormatMeasusre -> getSelectedFormats()", function() {
        //try docx txt msword 
        // it only tests formats not confidence levels
        it("returns 1 worded strings", function() {
            let recordPDF: Record = getRecordStubForDcatFormatMeasure(
                "pDf"
            );
            let recordDOCX: Record = getRecordStubForDcatFormatMeasure(
                "DoCx"
            );
            let recordTXT: Record = getRecordStubForDcatFormatMeasure(
                "txT"
            );

            let testPDF: MeasureResult = getDcatMeasureResult(recordPDF, synonymObject);
            let testDOCX: MeasureResult = getDcatMeasureResult(recordDOCX, synonymObject);
            let testTXT: MeasureResult = getDcatMeasureResult(recordTXT, synonymObject);

            expect(testPDF.formats[0].format).to.eql(Formats.PDF) &&
            expect(testDOCX.formats[0].format).to.eql(Formats.DOCX) &&
            expect(testTXT.formats[0].format).to.eql(Formats.TXT);
        });

        it("successfully separates &", function() {
            let recordPDF: Record = getRecordStubForDcatFormatMeasure(
                "pDf & Docx"
            );
            let recordDOCX: Record = getRecordStubForDcatFormatMeasure(
                "DoCx   & Pdf"
            );
            let recordTXT: Record = getRecordStubForDcatFormatMeasure(
                "txT    & html"
            );

            let testPDF: MeasureResult = getDcatMeasureResult(recordPDF, synonymObject);
            let testDOCX: MeasureResult = getDcatMeasureResult(recordDOCX, synonymObject);
            let testTXT: MeasureResult = getDcatMeasureResult(recordTXT, synonymObject);

            expect(testPDF.formats[0].format).to.eql(Formats.PDF) &&
            expect(testPDF.formats[1].format).to.eql(Formats.DOCX) &&

            expect(testDOCX.formats[0].format).to.eql(Formats.DOCX) &&
            expect(testDOCX.formats[1].format).to.eql(Formats.PDF) &&

            expect(testTXT.formats[0].format).to.eql(Formats.TXT) &&
            expect(testTXT.formats[1].format).to.eql(Formats.HTML);
        });

        it("successfully chooses () formats", function() {
            let recordPDF: Record = getRecordStubForDcatFormatMeasure(
                "zIp (Docx)"
            );
            let recordDOCX: Record = getRecordStubForDcatFormatMeasure(
                "some zipper file    (Pdf)"
            );
            let recordTXT: Record = getRecordStubForDcatFormatMeasure(
                "txT    (html)"
            );

            let testPDF: MeasureResult = getDcatMeasureResult(recordPDF, synonymObject);
            let testDOCX: MeasureResult = getDcatMeasureResult(recordDOCX, synonymObject);
            let testTXT: MeasureResult = getDcatMeasureResult(recordTXT, synonymObject);

            expect(testPDF.formats[0].format).to.eql(Formats.DOCX) &&
            expect(testPDF.formats.length).to.equal(1) &&

            expect(testDOCX.formats[0].format).to.eql(Formats.PDF) &&
            expect(testDOCX.formats.length).to.equal(1) &&

            expect(testTXT.formats[0].format).to.eql(Formats.HTML) &&
            expect(testTXT.formats.length).to.equal(1);
        });
    });
});

// helper functions

function getRecordStubForDownloadMeasure(downloadURL: string): Record {
    return getGeneralRecordStub(downloadURL, null, null);
}

function getRecordStubForDownloadExtensionMeasure(downloadURL: string) : Record {
    return getGeneralRecordStub(downloadURL, null, null);
}

function getRecordStubForDcatFormatMeasure(format: string): Record {
    return getGeneralRecordStub(null, format, null);
}

function getGeneralRecordStub(downloadURL: string, format: string, mediaType: string) {
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
