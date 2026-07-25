import "mocha";
import { expect } from "chai";
import fs from "fs";
import os from "os";
import path from "path";
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
        // `prefer` is rejected for a specific reason: libpq silently falls back
        // to plaintext, whereas node-postgres hard-fails. Pin that it is this
        // value being reported, so this test cannot pass for another input.
        expect(() => getPgSslConfigFromEnv({ PGSSLMODE: "prefer" })).to.throw(
            /"prefer"/
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

    describe("PGSSLROOTCERT handling", function () {
        const CA_CONTENTS =
            "-----BEGIN CERTIFICATE-----\nnot-a-real-cert\n-----END CERTIFICATE-----\n";
        let tempDir: string;
        let caFilePath: string;

        before(function () {
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "magda-pg-ca-"));
            caFilePath = path.join(tempDir, "ca.crt");
            fs.writeFileSync(caFilePath, CA_CONTENTS, "utf-8");
        });

        after(function () {
            fs.rmSync(tempDir, { recursive: true, force: true });
        });

        it("should not read the CA file for `require`, even if PGSSLROOTCERT points at a missing file", function () {
            // `require` verifies nothing, so the CA is irrelevant. A stale or
            // not-yet-mounted PGSSLROOTCERT must not stop the service booting.
            const missingPath = path.join(tempDir, "does-not-exist.crt");
            expect(
                getPgSslConfigFromEnv({
                    PGSSLMODE: "require",
                    PGSSLROOTCERT: missingPath
                })
            ).to.deep.equal({ rejectUnauthorized: false });
        });

        it("should read the CA file for `verify-ca`", function () {
            const config = getPgSslConfigFromEnv({
                PGSSLMODE: "verify-ca",
                PGSSLROOTCERT: caFilePath
            });
            expect(config).to.have.property("rejectUnauthorized", true);
            expect(config).to.have.property("ca", CA_CONTENTS);
        });

        it("should read the CA file for `verify-full`", function () {
            const config = getPgSslConfigFromEnv({
                PGSSLMODE: "verify-full",
                PGSSLROOTCERT: caFilePath
            });
            expect(config).to.have.property("rejectUnauthorized", true);
            expect(config).to.have.property("ca", CA_CONTENTS);
        });

        it("should leave `ca` undefined for `verify-full` when PGSSLROOTCERT is unset", function () {
            // Falls back to Node's built-in trust store.
            const config = getPgSslConfigFromEnv({ PGSSLMODE: "verify-full" });
            expect(config).to.have.property("rejectUnauthorized", true);
            expect((config as any).ca).to.equal(undefined);
        });

        it("should report PGSSLROOTCERT and the path when the CA file cannot be read on a verify- mode", function () {
            const missingPath = path.join(tempDir, "does-not-exist.crt");
            expect(() =>
                getPgSslConfigFromEnv({
                    PGSSLMODE: "verify-full",
                    PGSSLROOTCERT: missingPath
                })
            ).to.throw(/PGSSLROOTCERT/);
            expect(() =>
                getPgSslConfigFromEnv({
                    PGSSLMODE: "verify-full",
                    PGSSLROOTCERT: missingPath
                })
            ).to.throw(new RegExp(escapeRegExp(missingPath)));
        });
    });
});

function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
