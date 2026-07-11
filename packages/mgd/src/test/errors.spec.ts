import { expect } from "chai";
import { MgdApiError, UsageError, exitCodeFor } from "../errors.js";

describe("exitCodeFor", () => {
    it("maps auth failures to 3", () => {
        expect(
            exitCodeFor(new MgdApiError("nope", 401, "unauthorized"))
        ).to.equal(3);
        expect(exitCodeFor(new MgdApiError("nope", 403, "forbidden"))).to.equal(
            3
        );
    });
    it("maps 404 to 4", () => {
        expect(exitCodeFor(new MgdApiError("gone", 404, "not-found"))).to.equal(
            4
        );
    });
    it("maps usage errors to 2", () => {
        expect(exitCodeFor(new UsageError("bad flag"))).to.equal(2);
    });
    it("maps everything else to 1", () => {
        expect(exitCodeFor(new Error("boom"))).to.equal(1);
        expect(
            exitCodeFor(new MgdApiError("server", 500, "server-error"))
        ).to.equal(1);
    });
});
