import {} from "mocha";
import datasetView from "../../cralwerViews/dataset.js";
import sampleData from "./sampleDataset.json";
import { expect } from "chai";
import fse from "fs-extra";
import path from "path";
import moment from "moment-timezone";
import { getCurrentDirPath } from "@magda/esm-utils";

const __dirname = getCurrentDirPath();

describe("Test cralwer view: dataset", () => {
    beforeEach(() => {
        // set default timezone "Australia/Sydney"
        moment.tz.setDefault("Australia/Sydney");
    });

    after(() => {
        // reset
        moment.tz.setDefault();
    });

    it("should match the markdown output given the dataset record data & baseUrl", () => {
        const content = datasetView(
            sampleData as any,
            "https://test.com/"
        ).replace(/\r\n/g, "\n");
        const targetContent = fse
            .readFileSync(path.resolve(__dirname, "./sampleDatasetView.txt"), {
                encoding: "utf-8"
            })
            .replace(/\r\n/g, "\n");
        expect(content).to.equal(targetContent);
    });
});
