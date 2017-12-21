import {} from "mocha";
//import * as mocha from "mocha";
import {
    expect
    //should
} from "chai";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
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
    testGetKeys,
    testGroups,
    mochaObject
} from "../onRecordFound";
//import { DuplicateRecordsAspect } from "../duplicateRecordsAspectDef";
//import urlsFromDataSet from "./urlsFromDataSet";
import //alphanumericSymbolsArb,
/*getRandomString, alphanumericSymbolsArb*/
"./arbitraries";
//import FtpHandler from "../FtpHandler";
//import AuthorizedRegistryClient from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";*/
describe("test cases", function(this: Mocha.ISuiteCallbackContext) {
    before(function() {
        mochaObject.isRunning = true;
    });

    describe("onRecordFound", function(this: Mocha.ISuiteCallbackContext) {
        it("should contain 2 items if accessURL and downloadURL are the same", function() {
            var record: Record = {
                aspects: {
                    "dataset-distributions": {
                        distributions: [
                            {
                                aspects: {
                                    "dcat-distribution-strings": {
                                        accessURL: "www.elgoog.com",
                                        downloadURL: "www.elgoog.com"
                                    }
                                },
                                id: "0"
                            },
                            {
                                aspects: {
                                    "dcat-distribution-strings": {
                                        accessURL: "www.elgoog.com",
                                        downloadURL: "www.elgoog.com"
                                    }
                                },
                                id: "1"
                            }
                        ]
                    }
                },
                id: "10",
                name: "coolstuff"
            };

            return onRecordFound(record, null).then(function(result) {
                expect(testGroups[0]["ids"]).to.eql(["0", "1"]) &&
                expect(testGroups[0]["url"]).to.eql("www.elgoog.com");
            });
        });

        it("should contain no items if the object is empty", function() {
            var record: Record = {
                aspects: {
                    "dataset-distributions": {
                        distributions: [
                            {
                                aspects: {
                                    "dcat-distribution-strings": null
                                },
                                id: "0"
                            }
                        ]
                    }
                },
                id: "10",
                name: "coolstuff"
            };

            return expect(function() {return onRecordFound(record, null)}).to.throw(new Error("The distribution aspect has the following falsey properties: -aspects \nor \n-aspects[dcat-distribution-strings]\n"))
        });

        it("should contain no duplicate groups if there is only 1 element", function() {
            var record: Record = {
                aspects: {
                    "dataset-distributions": {
                        distributions: [
                            {
                                aspects: {
                                    "dcat-distribution-strings": {
                                        accessURL: "www.elgoog.com",
                                        downloadURL: "www.elgoog.com"
                                    }
                                }
                            }
                        ]
                    }
                },
                id: "10",
                name: "coolstuff"
            };

            return onRecordFound(record, null).then(function(result) {
                expect(testGroups).to.eql([]);
            });
        });

        it("should contain 1 duplicate group (except for null group) if 1 of accessURL/DownloadURL is null", function() {
            var record: Record;
            var promiseOnRecord: Promise<void>[] = [];

            // test variation 1

            record = {
                aspects: {
                    "dataset-distributions": {
                        distributions: [
                            {
                                aspects: {
                                    "dcat-distribution-strings": {
                                        accessURL: null,
                                        downloadURL: "www.elgoog.com"
                                    }
                                },
                                "id": "0"
                            },
                            {
                                aspects: {
                                    "dcat-distribution-strings": {
                                        accessURL: null,
                                        downloadURL: "www.elgoog.com"
                                    }
                                },
                                "id": "1"
                            }
                        ]
                    }
                },
                id: "10",
                name: "coolstuff"
            };

            promiseOnRecord.push(
                onRecordFound(record, null).then(function(result) {
                    expect(testGroups[0]["ids"]).to.be.length(2) &&
                    expect(testGroups[1]["url"]).to.equal('null') &&
                    expect(testGroups).to.be.length(2);
                })
            );

            //test variation 2
            record = {
                aspects: {
                    "dataset-distributions": {
                        distributions: [
                            {
                                aspects: {
                                    "dcat-distribution-strings": {
                                        downloadURL: null,
                                        accessURL: "www.elgoog.com"
                                    }
                                },
                                id: "0"
                            },
                            {
                                aspects: {
                                    "dcat-distribution-strings": {
                                        downloadURL: null,
                                        accessURL: "www.elgoog.com"
                                    }
                                },
                                id: "1"
                            }
                        ]
                    }
                },
                id: "10",
                name: "coolstuff"
            };

            promiseOnRecord.push(
                onRecordFound(record, null).then(function(result) {
                    expect(testGroups[0]["ids"]).to.be.length(2) &&
                    expect(testGroups[1]["url"]).to.equal('null') &&
                    expect(testGroups).to.be.length(2);
                })
            );

            //test variation 3
            record = {
                aspects: {
                    "dataset-distributions": {
                        distributions: [
                            {
                                aspects: {
                                    "dcat-distribution-strings": {
                                        downloadURL: null,
                                        accessURL: "www.elgoog.com"
                                    }
                                },
                                "id": "0"
                            },
                            {
                                aspects: {
                                    "dcat-distribution-strings": {
                                        accessURL: null,
                                        downloadURL: "www.elgoog.com"
                                    }
                                },
                                "id": "1"
                            }
                        ]
                    }
                },
                id: "10",
                name: "coolstuff"
            };

            promiseOnRecord.push(
                onRecordFound(record, null).then(function(result) {
                    expect(testGroups[0]["ids"]).to.be.length(2) &&
                    expect(testGroups[1]["url"]).to.equal('null') &&
                    expect(testGroups).to.be.length(2);
                })
            );

            return Promise.all(promiseOnRecord);
        });

        it("should return only null group if all urls are falsey", function() {
            var record: Record = {
                aspects: {
                    "dataset-distributions": {
                        distributions: [
                            {
                                aspects: {
                                    "dcat-distribution-strings": {
                                        downloadURL: null,
                                        accessURL: null
                                    }
                                },
                                "id": "0"
                            },
                            {
                                aspects: {
                                    "dcat-distribution-strings": {
                                        accessURL: null,
                                        downloadURL: null
                                    }
                                },
                                "id": "1"
                            }
                        ]
                    }
                },
                id: "10",
                name: "coolstuff"
            };

            return onRecordFound(record, null).then(function(result) {
                expect(testGroups[0]["url"]).to.equal('null');
                expect(testGroups[0]["ids"]).to.be.length(2);
                expect(testGroups).to.be.length(1);
            });
        });

        it("should return 2 duplicates if 2 records have overlapping accessURLs and downloadURLs", function() {
            var record: Record = {
                aspects: {
                    "dataset-distributions": {
                        distributions: [
                            {
                                aspects: {
                                    "dcat-distribution-strings": {
                                        downloadURL: "www.google.com",
                                        accessURL: "www.amazon.com"
                                    }
                                },
                                "id": "0"
                            },
                            {
                                aspects: {
                                    "dcat-distribution-strings": {
                                        accessURL: "www.google.com",
                                        downloadURL: "www.amazon.com"
                                    }
                                },
                                "id": "1"
                            }
                        ]
                    }
                },
                id: "10",
                name: "coolstuff"
            };

            return onRecordFound(
                record,
                null
            ).then(function(result) {
                expect(testGroups).to.be.length(2) && 
                expect(testGroups[0]["url"]).to.not.equal(testGroups[1]["url"]) &&
                expect(testGroups[0]["ids"]).to.be.length(2) &&
                expect(testGroups[1]["ids"]).to.be.length(2);
            })
        });
    });

    describe("#getKeys", function(this: Mocha.ISuiteCallbackContext) {
        it("should return []", function() {
            var stubObject;
            expect(testGetKeys(stubObject)).to.eql([]);
        });
        it("should not dig recursively", function() {
            var stubObject: any = {};
            stubObject.key1 = {};
            stubObject.key1.recursiveKey = {};

            expect(testGetKeys(stubObject)).to.be.length(1);
        });
    });
});
