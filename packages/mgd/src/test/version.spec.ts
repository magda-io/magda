import { expect } from "chai";
import { VERSION } from "../version.js";

describe("version", () => {
    it("exposes the package.json version", () => {
        expect(VERSION).to.match(/^\d+\.\d+\.\d+/);
    });
});
