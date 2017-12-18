import {} from "mocha";
//import * as mocha from "mocha";
import { 
    expect,
    //should 
} from "chai";
//import * as cap from "chai-as-promised"
import * as sinon from "sinon";
import * as nock from "nock";
//import jsc from "@magda/typescript-common/dist/test/jsverify";
/*import * as _ from "lodash";
import * as Client from "ftp";
import * as URI from "urijs";

import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import { encodeURIComponentWithApost } from "@magda/typescript-common/dist/test/util";
import {
    specificRecordArb,
    distUrlArb,
    arrayOfSizeArb,
    arbFlatMap,
    recordArbWithDistArbs
} from "@magda/typescript-common/dist/test/arbitraries";
*/
import /*onRecordFound,*/ { 
    getRegexFromFormats,
    retrieveSummary,
    isValidFormat,

} from "../onRecordFound";
//import { SummarizeAspect } from "../summarizeAspectDef";
//import urlsFromDataSet from "./urlsFromDataSet";
import {
    //alphanumericSymbolsArb,
    /*getRandomString, alphanumericSymbolsArb*/
} from "./arbitraries";
//import FtpHandler from "../FtpHandler";
//import AuthorizedRegistryClient from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";*/
describe("onRecordFound", function(this: Mocha.ISuiteCallbackContext) {
    before(() => {
        nock('http://www.economist.com')
        .get('/news/science-and-technology/21677188-it-rare-new-animal-species-emerge-front-scientists-eyes')
        .reply(403, "error your program shouldn't touch this text", {
            'content-type': 'text/html'
        });

        nock('http://www.loremipsum.de')
        .get('/downloads/original.txt')
        .reply(200, "bla bla bla bla bla bla bla bla bla bla bla bla bla bla\n blablablalbalblalblalgwlsadsdfgsdfgsfdsfgdsfdsfgdsfgdsfgdsfgdfd", {
            'content-type': 'text/plain'
        });

        nock('http://www.thewritesource.com')
        .get('/apa/apa.pdf')
        .reply(403, "error your code shouldn't access this", {
            'content-type': 'application/pdf'
        });

        nock('http://www.bom.gov.au')
        .get('/reguser/')
        .reply(403, "error your code shouldn't access this");

        sinon.stub(console, "info");
        nock.disableNetConnect();

        nock.emitter.on("no match", onMatchFail);
    });

    const onMatchFail = (req: any) => {
        console.error("Match failure: " + JSON.stringify(req.path));
    };

    after(() => {
        (console.info as any).restore();

        nock.emitter.removeListener("no match", onMatchFail);
    });
});




