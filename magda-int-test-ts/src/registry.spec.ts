import {} from "mocha";
//import getTestDBConfig from "magda-typescript-common/src/test/db/getTestDBConfig";
import { expect } from "chai";
import delay from "magda-typescript-common/src/delay";
import ServiceRunner from "./ServiceRunner";
//const jwt = require("jsonwebtoken");

//const dbConfig = getTestDBConfig();

describe("registry auth integration tests", () => {
    describe("registry auth integration tests", function (this) {
        this.timeout(300000);
        let serviceRunner = new ServiceRunner();

        before(async () => {
            await serviceRunner.create();
        });

        after(async () => {
            await serviceRunner.destroy();
        });

        it("should", async () => {
            await delay(1000);
            expect(1).equal(1);
        });
    });
});
