import {} from "mocha";
import distributionView from "../../cralwerViews/distribution";
import sampleDatasetData from "./sampleDataset.json";
import sampleDisData from "./sampleDistribution.json";
import { expect } from "chai";
import fse from "fs-extra";
import path from "path";
import moment from "moment-timezone";

describe("Test cralwer view: distribution", () => {
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
