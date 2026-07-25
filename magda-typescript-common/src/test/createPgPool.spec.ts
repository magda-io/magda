import "mocha";
import { expect } from "chai";
import { getPgSslConfigFromEnv } from "../createPgPool.js";

describe("getPgSslConfigFromEnv", function () {
    it("should return false when PGSSLMODE is unset (local dev / tests)", function () {
        expect(getPgSslConfigFromEnv({})).to.equal(false);
    });

    it("should return false when PGSSLMODE is an empty string", function () {
        expect(getPgSslConfigFromEnv({ PGSSLMODE: "" })).to.equal(false);
    });

    it("should return false for `disable`", function () {
        expect(getPgSslConfigFromEnv({ PGSSLMODE: "disable" })).to.equal(false);
    });

    it("should encrypt without verifying for `require`", function () {
        expect(getPgSslConfigFromEnv({ PGSSLMODE: "require" })).to.deep.equal({
            rejectUnauthorized: false
        });
    });

    it("should verify the chain but not the hostname for `verify-ca`", function () {
        const config = getPgSslConfigFromEnv({ PGSSLMODE: "verify-ca" });
        expect(config).to.have.property("rejectUnauthorized", true);
        expect(config)
            .to.have.property("checkServerIdentity")
            .that.is.a("function");
        expect((config as any).checkServerIdentity()).to.equal(undefined);
    });

    it("should verify chain and hostname for `verify-full`", function () {
        const config = getPgSslConfigFromEnv({ PGSSLMODE: "verify-full" });
        expect(config).to.have.property("rejectUnauthorized", true);
        expect(config).to.not.have.property("checkServerIdentity");
    });

    it("should be case insensitive and tolerate surrounding whitespace", function () {
        expect(getPgSslConfigFromEnv({ PGSSLMODE: " REQUIRE " })).to.deep.equal(
            {
                rejectUnauthorized: false
            }
        );
    });

    it("should throw for `prefer` rather than silently downgrading", function () {
        expect(() => getPgSslConfigFromEnv({ PGSSLMODE: "prefer" })).to.throw(
            /Unsupported PGSSLMODE/
        );
    });

    it("should throw for an unknown value", function () {
        expect(() => getPgSslConfigFromEnv({ PGSSLMODE: "banana" })).to.throw(
            /Unsupported PGSSLMODE/
        );
    });

    it("should default to process.env when no env is supplied", function () {
        const original = process.env.PGSSLMODE;
        try {
            process.env.PGSSLMODE = "require";
            expect(getPgSslConfigFromEnv()).to.deep.equal({
                rejectUnauthorized: false
            });
        } finally {
            if (original === undefined) {
                delete process.env.PGSSLMODE;
            } else {
                process.env.PGSSLMODE = original;
            }
        }
    });
});
