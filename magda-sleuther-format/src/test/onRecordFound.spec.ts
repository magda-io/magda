import {} from "mocha";
//import { expect } from 'chai';
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import onRecordFound, { mochaObject } from "../onRecordFound";

describe("onRecordFound", function() {
    before(() => {
        mochaObject.isRunning = true;
    });

    it("", function() {
         onRecordFound(getStub("www.google.com", "pdf"), null);
    });
});

function getStub(downloadURL: string, format: string): Record {
    return {
        aspects: {
            "dataset-distributions": {
                distributions: [
                    {
                        aspects: {
                            "dcat-distribution-strings": {
                                format: format,
                                downloadURL: downloadURL
                            }
                        },
                        id: "1",
                        name: "hello there babe"
                    }
                ]
            }
        },
        id: "0",
        name: "hello there"
    };
}
