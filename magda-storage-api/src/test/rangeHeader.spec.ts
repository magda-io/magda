import {} from "mocha";
import { expect } from "chai";
import { parseRangeHeader } from "../rangeHeader.js";

describe("parseRangeHeader", () => {
    const total = 1000;

    it("returns null when no range header", () => {
        expect(parseRangeHeader(undefined, total)).to.equal(null);
    });

    it("returns null for a malformed range header", () => {
        expect(parseRangeHeader("chunks=0-10", total)).to.equal(null);
        expect(parseRangeHeader("bytes=abc", total)).to.equal(null);
    });

    it("parses a closed range", () => {
        expect(parseRangeHeader("bytes=0-99", total)).to.deep.equal({
            start: 0,
            end: 99
        });
    });

    it("parses an open-ended range to the last byte", () => {
        expect(parseRangeHeader("bytes=200-", total)).to.deep.equal({
            start: 200,
            end: 999
        });
    });

    it("parses a suffix range (last N bytes)", () => {
        expect(parseRangeHeader("bytes=-50", total)).to.deep.equal({
            start: 950,
            end: 999
        });
    });

    it("clamps an end beyond the object size", () => {
        expect(parseRangeHeader("bytes=990-100000", total)).to.deep.equal({
            start: 990,
            end: 999
        });
    });

    it("returns 'invalid' when start is beyond the object size", () => {
        expect(parseRangeHeader("bytes=1000-1100", total)).to.equal("invalid");
    });

    it("returns 'invalid' when start > end", () => {
        expect(parseRangeHeader("bytes=500-400", total)).to.equal("invalid");
    });

    it("returns null when total size is unknown (NaN)", () => {
        expect(parseRangeHeader("bytes=0-99", NaN)).to.equal(null);
    });
});
