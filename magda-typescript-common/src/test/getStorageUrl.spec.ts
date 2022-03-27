import "mocha";
import { expect } from "chai";
import urijs from "urijs";
import jsc from "./jsverify";
import getStorageUrl, { InvalidCharsRegEx } from "../getStorageUrl";

function generateStr(len: number) {
    if (len <= 0) {
        return "";
    }
    return Array(len)
        .fill(0)
        .map((item) => String.fromCharCode(Math.ceil(Math.random() * 255)))
        .join("");
}

function verifyUrl(
    datasetId: string,
    distId: string,
    fileName: string,
    optionalFurtherCheck?: (url: string) => void
) {
    const storageUrl = getStorageUrl(datasetId, distId, fileName);
    const parts = urijs(storageUrl).segmentCoded();
    const objectKey = parts.join("/");
    expect(objectKey.length).lte(1024);
    expect(parts.length).equal(3);
    parts.forEach((part) =>
        expect(part.replace(InvalidCharsRegEx, "") === part)
    );
    if (optionalFurtherCheck) {
        optionalFurtherCheck(storageUrl);
    }
    return true;
}

describe("getStorageUrl", function () {
    jsc.property(
        "should generate url contains valid s3 object key",
        jsc.string,
        jsc.string,
        jsc.string,
        jsc.string,
        jsc.bool,
        (datasetId, distId, fileName, extName, hasExtName) => {
            const fullFileName = fileName + (hasExtName ? "." : "") + extName;
            return verifyUrl("ds-" + datasetId, "dis-" + distId, fullFileName);
        }
    );

    it("should generate object key less than 1024 char with very long file name", () => {
        return (
            verifyUrl(
                "ds-" + generateStr(32),
                "dis-" + generateStr(32),
                Array(99999).fill("a").join("") + ".exe"
            ) &&
            verifyUrl(
                "ds-" + generateStr(32),
                "dis-" + generateStr(32),
                Array(99999).fill("a").join("") +
                    "." +
                    Array(99999).fill("a").join("")
            ) &&
            verifyUrl(
                "ds-" + generateStr(32),
                "dis-" + generateStr(32),
                Array(99999).fill("a").join("")
            )
        );
    });

    it("should generate object key less than 1024 char with very long dataset or distribution id", () => {
        return (
            verifyUrl(
                "ds-" + Array(99999).fill("a").join(""),
                "dis-" + generateStr(32),
                "test.exe",
                (storageUrl) =>
                    expect(storageUrl.indexOf("test.exe")).not.equal(-1)
            ) &&
            verifyUrl(
                "ds-" + generateStr(32),
                "dis-" + Array(99999).fill("a").join(""),
                "test.exe",
                (storageUrl) =>
                    expect(storageUrl.indexOf("test.exe")).not.equal(-1)
            ) &&
            verifyUrl(
                "ds-" + Array(99999).fill("a").join(""),
                "dis-" + Array(99999).fill("a").join(""),
                "test.exe",
                (storageUrl) =>
                    expect(storageUrl.indexOf("test.exe")).not.equal(-1)
            )
        );
    });
});
