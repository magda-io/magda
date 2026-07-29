import "mocha";
import { expect } from "chai";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
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

/**
 * `getPgSslConfigFromEnv` is deliberately duplicated in the
 * `@magda/authentication-plugin-sdk` package (see the comment there): the SDK
 * ships as a self-contained bundle depending only on `pg`, so it cannot import
 * this module. The two copies together define the `sslmode` vocabulary Magda
 * accepts, and if they drift, plugins and core services would interpret the
 * same `PGSSLMODE` differently. Nothing else stops that drift, so this test
 * does: both copies are wrapped in `BEGIN/END shared:pg-ssl` markers and their
 * logic (comments and whitespace excluded) must stay identical.
 */
describe("getPgSslConfigFromEnv source parity with the auth-plugin SDK", function () {
    // Anchor to this test file's own location so the check works whether the
    // suite runs from `src` (ts-node) or `dist` (compiled), then walk up to the
    // monorepo root.
    function findRepoRoot(startDir: string): string {
        let dir = startDir;
        for (let i = 0; i < 12; i++) {
            if (
                fs.existsSync(
                    path.join(dir, "magda-typescript-common")
                ) &&
                fs.existsSync(path.join(dir, "packages"))
            ) {
                return dir;
            }
            const parent = path.dirname(dir);
            if (parent === dir) {
                break;
            }
            dir = parent;
        }
        throw new Error(
            `could not locate the monorepo root starting from ${startDir}`
        );
    }

    // Return the code between the `BEGIN shared:pg-ssl` / `END shared:pg-ssl`
    // marker lines (the marker lines themselves excluded), with comments and
    // runs of whitespace collapsed so only the logic is compared.
    function extractSharedLogic(file: string): string {
        const src = fs.readFileSync(file, "utf-8");
        const beginIdx = src.indexOf("BEGIN shared:pg-ssl");
        const endIdx = src.indexOf("END shared:pg-ssl");
        expect(
            beginIdx,
            `BEGIN shared:pg-ssl marker not found in ${file}`
        ).to.be.greaterThan(-1);
        expect(
            endIdx,
            `END shared:pg-ssl marker not found in ${file}`
        ).to.be.greaterThan(-1);
        const beginLineEnd = src.indexOf("\n", beginIdx);
        const endLineStart = src.lastIndexOf("\n", endIdx);
        const body = src.slice(beginLineEnd + 1, endLineStart);
        return body
            .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
            .replace(/\/\/[^\n]*/g, " ") // line comments
            .replace(/\s+/g, " ") // collapse whitespace
            .trim();
    }

    it("keeps the shared block byte-identical (comments excluded)", function () {
        const repoRoot = findRepoRoot(
            path.dirname(fileURLToPath(import.meta.url))
        );
        const canonical = path.join(
            repoRoot,
            "magda-typescript-common/src/createPgPool.ts"
        );
        const sdkCopy = path.join(
            repoRoot,
            "packages/authentication-plugin-sdk/src/createPool.ts"
        );

        const canonicalLogic = extractSharedLogic(canonical);
        // Sanity check the extraction actually captured the function, so an
        // empty-vs-empty match can never pass vacuously.
        expect(canonicalLogic).to.contain("getPgSslConfigFromEnv");
        expect(canonicalLogic).to.contain("SUPPORTED_SSL_MODES");

        expect(
            extractSharedLogic(sdkCopy),
            "getPgSslConfigFromEnv has drifted between @magda/typescript-common " +
                "(createPgPool.ts) and @magda/authentication-plugin-sdk (createPool.ts). " +
                "Update BOTH copies so the shared:pg-ssl blocks match."
        ).to.equal(canonicalLogic);
    });
});
