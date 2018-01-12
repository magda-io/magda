import {} from "mocha";
//import * as sinon from "sinon";
import * as nock from "nock";
//import * as $ from 'jquery'
import {
    expect
    //should
} from "chai";

import { Record } from "@magda/typescript-common/src/generated/registry/api";
import {
    /*DcatFormatMeasure,*/ DownloadMeasure /*DownloadExtensionMeasure*/
} from "../../format-engine/measures";
import { Formats } from "@magda/typescript-common/src/format/formats";
import * as fs from "fs";

describe("measures tests", function(this: Mocha.ISuiteCallbackContext) {
    before(() => {
        nock("www.google.com")
            .get("/")
            .reply(
                200,
                fs.readFileSync(__dirname + "/resources/Google.html", "utf-8")
            );
    });

    //TypeError: Cannot read property '' of undefined -- usually means that the format found wasn't encapsulated in the Formats enum
    describe("DownloadMeasure -> getSelectedFormats()", function() {
        it("returns html on normal possibly cloaked pages", function() {
            var record: Record = getRecordStubForDownloadMeasure(
                "www.google.com"
            );

            let measure: DownloadMeasure = new DownloadMeasure(record);

            expect(measure.getSelectedFormats().selectedFormats[0]).to.eql(
                Formats.HTML
            );
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
