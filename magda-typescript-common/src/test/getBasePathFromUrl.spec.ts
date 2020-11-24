import "mocha";
import { expect } from "chai";
import getBasePathFromUrl from "../getBasePathFromUrl";

const assertionList: { [key: string]: string } = {
    "": "/",
    "http://example.com": "/",
    "http://example.com/": "/",
    "http://example.com/sss/ss/": "/sss/ss",
    "http://example.com/sss/ss": "/sss/ss"
    //"http://example.com/ss%20%20s/ss": "/ss  s/ss",
};

describe("getBasePathFromUrl", function () {
    Object.keys(assertionList).forEach((key) => {
        it(`Should return "${assertionList[key]}" for url "${key}" `, function () {
            const result = getBasePathFromUrl(key);
            expect(result).to.be.equal(assertionList[key]);
        });
    });
});
