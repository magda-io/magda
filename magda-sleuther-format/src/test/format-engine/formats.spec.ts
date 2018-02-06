import {} from "mocha";
//import * as sinon from 'sinon';
import { expect } from "chai";

import { getCommonFormat } from "../../format-engine/formats";
let synonymObject = require("../../../synonyms.json");

describe("getCommonFormat", function(this: Mocha.ISuiteCallbackContext) {
    it("should classify different versions of formats under the same name", function() {
        let result1 = getCommonFormat("Doc", synonymObject);
        let result2 = getCommonFormat("Docx", synonymObject);

        let result3 = getCommonFormat("xLs", synonymObject);
        let result4 = "XLSX";

        expect(result1).to.eql(result2);
        expect(result3).to.eql(result4);
    });

    it("should classify CSW WWW:nonsense as 'null'", function() {
        expect(
            getCommonFormat("WWW:LINK-1.0-http--related", synonymObject)
        ).to.eql(null);
        
        expect(
            getCommonFormat("WWW:DOWNLOAD-1.0-http--download", synonymObject)
        ).to.eql(null);

        expect(
            getCommonFormat("WWW:LINK-1.0-http--metadata-URL", synonymObject)
        ).to.eql(null);

        expect(
            getCommonFormat("WWW:LINK-1", synonymObject)
        ).to.eql(null);
       
    });
});
