import "mocha";
import { expect } from "chai";
import urijs from "urijs";
import jsc from "jsverify";
import getStorageUrl, {
    InvalidCharsRegEx,
    isValidS3ObjectKey
} from "../getStorageUrl.js";

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

    it("should generate storage url without html entities", () => {
        const fileName =
            "Genotype by environment studies across Australia reveal the importance\nof phenology for chickpea (Cicer arietinum L.) improvement.pdf";
        verifyUrl(
            "ds-" + generateStr(32),
            "dis-" + generateStr(32),
            fileName,
            (url) => {
                expect(url).not.contain("%");
            }
        );
    });
});

describe("isValidS3ObjectKey", () => {
    it("should return false for `sds//sds`", () => {
        expect(isValidS3ObjectKey("sds//sds")).to.be.false;
    });
    it("should return false for `/sds/ss/sds`", () => {
        expect(isValidS3ObjectKey("/sds/ss/sds")).to.be.false;
    });
    it("should return true for `sds/ss/sds`", () => {
        expect(isValidS3ObjectKey("sds/ss/sds")).to.be.true;
    });
    it("should return false for `sds/ss/sds/`", () => {
        expect(isValidS3ObjectKey("sds/ss/sds/")).to.be.false;
    });
    it("should return true for `magda-ds-192f7ca4-f3ad-4f87-9331-941329c616dd/magda-dist-8cd82dfb-61cd-4bb4-b168-85a511e1109d/pdf-test.pdf`", () => {
        expect(
            isValidS3ObjectKey(
                "magda-ds-192f7ca4-f3ad-4f87-9331-941329c616dd/magda-dist-8cd82dfb-61cd-4bb4-b168-85a511e1109d/pdf-test.pdf"
            )
        ).to.be.true;
    });
    it("should return false for `magda-datasets/magda-ds-192f7ca4-f3ad-4f87-9331-941329c616dd/magda-dist-68af523a-9ace-4ef9-b813-599b4c19dfbf/test spatial.csv`", () => {
        expect(
            isValidS3ObjectKey(
                "magda-datasets/magda-ds-192f7ca4-f3ad-4f87-9331-941329c616dd/magda-dist-68af523a-9ace-4ef9-b813-599b4c19dfbf/test spatial.csv"
            )
        ).to.be.false;
    });
    it("should return true for `magda-datasets/magda-ds-192f7ca4-f3ad-4f87-9331-941329c616dd/magda-dist-68af523a-9ace-4ef9-b813-599b4c19dfbf/testspatial.csv`", () => {
        expect(
            isValidS3ObjectKey(
                "magda-datasets/magda-ds-192f7ca4-f3ad-4f87-9331-941329c616dd/magda-dist-68af523a-9ace-4ef9-b813-599b4c19dfbf/testspatial.csv"
            )
        ).to.be.true;
    });
    it("should return false for key longer than 1024", () => {
        expect(isValidS3ObjectKey(Array(1025).fill("a").join(""))).to.be.false;
    });
});
