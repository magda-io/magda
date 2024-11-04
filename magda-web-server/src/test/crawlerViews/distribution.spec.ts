import {} from "mocha";
import { require } from "@magda/esm-utils";
import distributionView from "../../crawlerViews/distribution.js";
const sampleDatasetData = require("./sampleDataset.json");
const sampleDisData = require("./sampleDistribution.json");
import { expect } from "chai";
import fse from "fs-extra";
import path from "path";
import moment from "moment-timezone";
import { getCurrentDirPath } from "@magda/esm-utils";

const __dirname = getCurrentDirPath();

describe("Test crawler view: distribution", () => {
    beforeEach(() => {
        // set default timezone "Australia/Sydney"
        moment.tz.setDefault("Australia/Sydney");
    });

    after(() => {
        // reset
        moment.tz.setDefault();
    });

    it("should match the markdown output given the distribution & dataset record data", () => {
        const content = distributionView(
            sampleDisData as any,
            sampleDatasetData as any,
            "http://test.com/"
        ).replace(/\r\n/g, "\n");
        const targetContent = fse
            .readFileSync(
                path.resolve(__dirname, "./sampleDistributionView.txt"),
                {
                    encoding: "utf-8"
                }
            )
            .replace(/\r\n/g, "\n");
        expect(content).to.equal(targetContent);
    });
});
