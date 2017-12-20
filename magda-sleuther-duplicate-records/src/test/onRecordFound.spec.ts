import {} from "mocha";
//import * as mocha from "mocha";
import { 
    expect,
    //should 
} from "chai";
//import * as cap from "chai-as-promised"
//import * as sinon from "sinon";
//import * as nock from "nock";
//import jsc from "@magda/typescript-common/dist/test/jsverify";
//import * as _ from "lodash";

//import * as Client from "ftp";
//import * as URI from "urijs";

//import { encodeURIComponentWithApost } from "@magda/typescript-common/dist/test/util";
/*import {
    specificRecordArb,
    distUrlArb,
    arrayOfSizeArb,
    arbFlatMap,
    recordArbWithDistArbs
} from "@magda/typescript-common/dist/test/arbitraries";*/

import onRecordFound, { 
    getKeys,
    groups
} from "../onRecordFound";
import {
    DuplicateRecordsAspect
} from "../duplicateRecordsAspectDef"
//import urlsFromDataSet from "./urlsFromDataSet";
import {
    //alphanumericSymbolsArb,
    /*getRandomString, alphanumericSymbolsArb*/
} from "./arbitraries";
//import FtpHandler from "../FtpHandler";
//import AuthorizedRegistryClient from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";*/
describe("onRecordFound", function(this: Mocha.ISuiteCallbackContext) {
    //TODO change record stub if it isn't accurate.
    it("should contain 2 items if accessURL and downloadURL are the same", function() {
        var record: any = {};
        record.aspects = {};
        record.aspects["dataset-distributions"] = [
            {
                "aspects": {
                    "dcat-distribution-strings": {
                        "accessURL": "www.elgoog.com",
                        "downloadURL": "www.elgoog.com"
                    }
                },
                "id": 0
            },
            {
                "aspects": {
                    "dcat-distribution-strings": {
                        "accessURL": "www.elgoog.com",
                        "downloadURL": "www.elgoog.com"
                    }
                },
                "id": 1
            }]
        
        return onRecordFound(
            record,
            null
        )
        .then(function(result) {

            expect(groups[0].ids).to.eql([0, 1]);
            expect(groups[0].url).to.eql("www.elgoog.com");

            expect(groups[1].ids).to.eql([0, 1]);
            expect(groups[1].url).to.eql("www.elgoog.com");

        });
    });

    it("should contain no items if the object is empty", function() {
        var record: any = {};
        record.aspects = {};
        record.aspects["dataset-distributions"] = [
            {
                "aspects": {
                    "dcat-distribution-strings": null
                }
            }
        ];

        return onRecordFound(
            record,
            null
        ).then(function(result) {
            let expectedResult: DuplicateRecordsAspect[];
            expect(groups).to.eql(expectedResult);
        });

        
    });

    it("should contain no duplicate groups if there is only 1 element", function() {
        var record: any = {};
        record.aspects = {};
        record.aspects["dataset-distributions"] = [
            {
                "aspects": {
                    "dcat-distribution-strings": {
                        "accessURL": "www.elgoog.com",
                        "downloadURL": "www.elgoog.com"
                    }
                }
            }
        ];



        return onRecordFound(
            record,
            null
        )
        .then(function(result) {
            let expectedResult: DuplicateRecordsAspect[];
            expect(groups).to.equal(expectedResult);
        });
    });

    it("should contain 1 duplicate group if 1 of accessURL/DownloadURL is null", function() {
        var record: any = {};
        record.aspects = {};
        var promiseOnRecord: Promise<void>[];

        // test variation 1
        record.aspects["dataset-distributions"] = [
            {
                "aspects": {
                    "dcat-distribution-strings": {
                        "accessURL": null,
                        "downloadURL": "www.elgoog.com"
                    }
                }
            },
            {
                "aspects": {
                    "dcat-distribution-strings": {
                        "accessURL": null,
                        "downloadURL": "www.elgoog.com"
                    }
                }
            }
        ];

        promiseOnRecord.push(onRecordFound(
            record,
            null
        )
        .then(function(result) {
            expect(groups).to.be.length(1);
        }));

        //test variation 2
        record.aspects["dataset-distributions"] = [
            {
                "aspects": {
                    "dcat-distribution-strings": {
                        "downloadURL": null,
                        "accessURL": "www.elgoog.com"
                    }
                },
                "id": 0
            },
            {
                "aspects": {
                    "dcat-distribution-strings": {
                        "downloadURL": null,
                        "accessURL": "www.elgoog.com"
                    }
                },
                "id": 1
            }
        ];

        promiseOnRecord.push(onRecordFound(
            record,
            null
        )
        .then(function(result) {
            expect(groups).to.be.length(1);
        }));

        //test variation 3
        record.aspects["dataset-distributions"] = [
            {
                "aspects": {
                    "dcat-distribution-strings": {
                        "downloadURL": null,
                        "accessURL": "www.elgoog.com"
                    }
                }
            },
            {
                "aspects": {
                    "dcat-distribution-strings": {
                        "accessURL": null,
                        "downloadURL": "www.elgoog.com"
                    }
                }
            }
        ];

        promiseOnRecord.push(onRecordFound(
            record,
            null
        )
        .then(function(result) {
            expect(groups).to.be.length(1);
        }));

        return Promise.all(promiseOnRecord);
    });

    it("should return null if all urls are falsey", function() {
        var record: any = {};
        record.aspects = {};
    
        record.aspects["dataset-distributions"] = [
            {
                "aspects": {
                    "dcat-distribution-strings": {
                        "downloadURL": null,
                        "accessURL": null
                    }
                }
            },
            {
                "aspects": {
                    "dcat-distribution-strings": {
                        "accessURL": null,
                        "downloadURL": null
                    }
                }
            }
        ];

        return onRecordFound(
            record,
            null
        )
        .then(function(result) {
            let expectedResult: DuplicateRecordsAspect[];
            expect(groups).to.equal(expectedResult);
        });
    });
    
});

describe("#getKeys", function(this: Mocha.ISuiteCallbackContext) {
    it("should return []", function() {
        var stubObject;
        expect(getKeys(stubObject)).to.eql([]);
    });
    it("should not dig recursively", function() {
        var stubObject: any = {};
        stubObject.key1 = {};
        stubObject.key1.recursiveKey = {};

        expect(getKeys(stubObject)).to.be.length(1);
    });
});