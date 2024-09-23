import {} from "mocha";
import contentSanitizer from "../contentSanitizer.js";
import { DatasetMessage } from "../model.js";
import { expect } from "chai";

describe("contentSanitizer", function (this) {
    const test_text = `
            Test email client auto link rendering
            1> app://example.com/sds
            2> msteams://exmaple.com/sdfsd
            3> ftp://exmaple.com/sdfsd
            4> https://example.coms/sds
            5> http://sdfs.com/sdf
            6> sftp://sdfs.com/sdfs
            `;

    const expected_text = `
            Test email client auto link rendering
            1> [URL]example.com/sds
            2> [URL]exmaple.com/sdfsd
            3> [URL]exmaple.com/sdfsd
            4> [URL]example.coms/sds
            5> [URL]sdfs.com/sdf
            6> [URL]sdfs.com/sdfs
            `;

    it("should sanitize urls in text input correctly", function () {
        expect(contentSanitizer(test_text)).to.equal(expected_text);
    });

    it("should sanitize DatasetMessage input correctly", function () {
        const data: DatasetMessage = {
            senderName: test_text,
            message: test_text,
            note: test_text,
            senderEmail: "te'sstUser+001@gmail-011.com.au"
        };
        expect(contentSanitizer(data)).to.deep.equal({
            senderName: expected_text,
            message: expected_text,
            note: expected_text,
            senderEmail: "te'sstUser+001@gmail-011.com.au"
        });
    });
});
