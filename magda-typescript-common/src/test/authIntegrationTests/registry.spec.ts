import {} from "mocha";
//import getTestDBConfig from "magda-typescript-common/src/test/db/getTestDBConfig";
import { expect } from "chai";
import AuthServiceRunner from "../AuthServiceRunner";
//const jwt = require("jsonwebtoken");

//const dbConfig = getTestDBConfig();

describe("registry auth integration tests", () => {
    describe("registry auth integration tests", () => {
        let serviceRunner = new AuthServiceRunner();

        before(async () => {
            await serviceRunner.create();
        });

        after(async function () {
            await serviceRunner.destroy();
        });

        it("should", () => {
            expect(1).equal(1);
        });
    });
});
