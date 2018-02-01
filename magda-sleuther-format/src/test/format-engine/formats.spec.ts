import {} from 'mocha';
//import * as sinon from 'sinon';
import { expect } from 'chai';

import { Formats, getCommonFormat, mochaObject } from "../../format-engine/formats";
let synonymObject = require("../../format-engine/synonyms.json")

describe("getCommonFormat", function(this: Mocha.ISuiteCallbackContext) {
    before(() => {
        mochaObject.isRunning = true;
    })

    it("should classify different versions of formats under the same name", function() {
        let result1: Formats = getCommonFormat("Doc", synonymObject);
        let result2: Formats = getCommonFormat("Docx", synonymObject);

        let result3: Formats = getCommonFormat("xLs", synonymObject);
        let result4: Formats = Formats.XLSX;

        expect(result1).to.eql(result2) && 
        expect(result3).to.eql(result4);
    });

    it("should classify all of ckan's html standards under the same name", function() {
        expect(getCommonFormat("WWW:LINK-1.0-http--related", synonymObject)).to.eql(Formats.HTML) &&
        expect(getCommonFormat("WWW:DOWNLOAD-1.0-http--download", synonymObject)).to.eql(Formats.HTML) &&
        expect(getCommonFormat("WWW:LINK-1.0-http--metadata-URL", synonymObject)).to.eql(Formats.HTML);
    });
});