import {} from 'mocha';
//import * as sinon from 'sinon';
import { expect } from 'chai';

import { Formats, getCommonFormat, mochaObject } from "../../format-engine/formats";

describe("getCommonFormat", function(this: Mocha.ISuiteCallbackContext) {
    before(() => {
        mochaObject.isRunning = true;
        mochaObject.testVariables.synonymTable = getCommonSynonymStub();
    })

    it("should classify different versions of formats under the same name", function() {
        //let result1: Formats = getCommonFormat("Doc");
        //let result2: Formats = getCommonFormat("Docx");

        let result3: Formats = getCommonFormat("xLs");
        let result4: Formats = Formats.XLSX;

        //expect(result1).to.eql(result2) && 
        expect(result3).to.eql(result4);
    });

    it("should classify all of ckan's html standards under the same name", function() {
        //expect(getCommonFormat("WWW:LINK-1.0-http--related")).to.eql(Formats.HTML) &&
        //expect(getCommonFormat("WWW:DOWNLOAD-1.0-http--download")).to.eql(Formats.HTML) &&
        expect(getCommonFormat("WWW:LINK-1.0-http--metadata-URL")).to.eql(Formats.HTML);
    });
});

// helper functions
function getCommonSynonymStub(): Object {
    return {
        "html":["WWW:DOWNLOAD-1.0-ftp--download", "WWW:LINK-1.0-http--related", "WWW:DOWNLOAD-1.0-http--download", "WWW:LINK-1.0-http-link", "WWW:LINK-1.0-http--metadata-URL", "webpage", "website", "htm"],
        "wms": ["OGC:WMS-1.3.0-http-get-capabilities", "OGC:WMS-1.3.0-http-get-map"],
        "docx": ["doc", "msword"],
        "xlsx": ["xls"]
    }
}