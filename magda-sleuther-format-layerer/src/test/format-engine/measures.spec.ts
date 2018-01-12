import {} from "mocha";
//import * as sinon from "sinon";
import * as nock from "nock";
import {
    expect
    //should
} from "chai";

import { Record } from "@magda/typescript-common/src/generated/registry/api";

import { Formats } from "@magda/typescript-common/src/format/formats";
import * as fs from "fs";

//import getDcatMeasureResult from "../../format-engine/measures/dcatFormatMeasure";
//import getExtensionMeasureResult from "../../format-engine/measures/downloadExtensionMeasure";
import getDownloadMeasureResult from "../../format-engine/measures/downloadMeasure";

//import getDcatProcessedData from "../../format-engine/measures/processed-functions/dcatProcessedFns";
//import getDownloadProcessedData from "../../format-engine/measures/processed-functions/dcatProcessedFns";
//import getExtensionProcessedData from "../../format-engine/measures/processed-functions/extensionProcessedFns";

//import  getBestMeasureResult  from "../../format-engine/MeasureEvaluator"
//import MeasureEvaluationSet from "src/format-engine/measures/MeasureEvaluationSet";
//import MeasureEvalResult from "src/format-engine/MeasureEvalResult";
import MeasureResult from "src/format-engine/measures/MeasureResult";

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
            )
    });

    describe("DownloadMeasure -> getSelectedFormats()", function() {
        it("returns html on normal possibly cloaked pages", function() {
            var record: Record = getRecordStubForDownloadMeasure(
                "www.google.com"
            );

            const ret: MeasureResult = getDownloadMeasureResult(record);

            expect(ret.formats[0].format).to.eql(Formats.HTML);
        });

        it("returns a doc when supplied with a doc", function() {
            var record: Record = getRecordStubForDownloadMeasure(
                "www.snee.com/xml/xslt/sample.doc"
            );

            const ret: MeasureResult = getDownloadMeasureResult(record);

            expect(ret.formats[0].format).to.eql(Formats.DOC);

        });
    });
});

// helper functions
function getRecordStubForDownloadMeasure(downloadURL: string): Record {
    return {
        aspects: {
            "dcat-distribution-strings": {
                downloadURL: downloadURL
            }
        },
        id: "10",
        name: "coolstuff"
    };
}
