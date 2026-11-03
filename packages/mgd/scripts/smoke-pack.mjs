#!/usr/bin/env node
/**
 * Packaging smoke test for @magda/mgd.
 *
 * Reproduces the real npm release path: `npm pack` (which runs the `prepack`
 * lifecycle script to build the git-ignored bin/mgd.js bundle), then installs
 * the resulting tarball into a clean, throwaway project and runs the installed
 * `mgd --version`.
 *
 * Guards against regressions of #3723, where a clean release checkout published
 * @magda/mgd without bin/mgd.js, so `npm install -g @magda/mgd` produced no
 * working `mgd` executable even though package.json declared the `mgd` bin.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const pkg = JSON.parse(
    fs.readFileSync(path.join(pkgDir, "package.json"), "utf8")
);
const expectedVersion = pkg.version;

// npm prefixes every path inside a package tarball with "package/".
const REQUIRED_FILES = [
    "package/bin/mgd.js",
    "package/skills/SKILL.md",
    "package/skills/search.md",
    "package/skills/authoring.md",
    "package/skills/publisher.md",
    "package/skills/preview.md",
    "package/skills/dataset-elicitation.md"
];

function run(cmd, args, opts = {}) {
    return execFileSync(cmd, args, {
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 64,
        ...opts
    });
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mgd-smoke-"));
try {
    // 1. Pack. `npm pack` runs the `prepack` script, which builds bin/mgd.js.
    //    The last non-empty stdout line is the produced tarball's filename.
    const packOut = run("npm", ["pack", "--pack-destination", workDir], {
        cwd: pkgDir
    });
    const tarballName = packOut.trim().split("\n").pop().trim();
    const tarball = path.join(workDir, tarballName);
    if (!fs.existsSync(tarball)) {
        throw new Error(`npm pack did not produce a tarball at ${tarball}`);
    }

    // 2. Verify the tarball contains the CLI bundle and the skill files.
    const listing = run("tar", ["-tzf", tarball])
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    for (const required of REQUIRED_FILES) {
        if (!listing.includes(required)) {
            throw new Error(
                `packed tarball is missing ${required}\n` +
                    `tarball contents:\n${listing.join("\n")}`
            );
        }
    }

    // 3. Install the tarball into a clean, throwaway consumer project.
    const projDir = path.join(workDir, "consumer");
    fs.mkdirSync(projDir);
    fs.writeFileSync(
        path.join(projDir, "package.json"),
        JSON.stringify({ name: "mgd-smoke-consumer", private: true }, null, 2)
    );
    run("npm", ["install", "--no-audit", "--no-fund", tarball], {
        cwd: projDir,
        stdio: ["ignore", "inherit", "inherit"]
    });

    // 4. Installing the package must create the `mgd` executable.
    const binPath = path.join(projDir, "node_modules", ".bin", "mgd");
    if (!fs.existsSync(binPath)) {
        throw new Error(`installed package did not create ${binPath}`);
    }

    // 5. The build-time-only common package must not be installed in the clean
    //    consumer, while the bundled reserved-name validation still executes.
    const commonPath = path.join(
        projDir,
        "node_modules",
        "@magda",
        "typescript-common"
    );
    if (fs.existsSync(commonPath)) {
        throw new Error(
            "@magda/typescript-common was installed as an mgd runtime dependency"
        );
    }

    // 6. `mgd --version` must succeed and report the package version.
    const version = run(binPath, ["--version"], { cwd: projDir }).trim();
    if (version !== expectedVersion) {
        throw new Error(
            `mgd --version reported "${version}", expected "${expectedVersion}"`
        );
    }

    // 7. A path imported from the build-time common package must have been
    //    bundled into mgd.js, not left as a runtime import.
    const reservedDraft = path.join(workDir, "python-dependencies");
    fs.mkdirSync(reservedDraft);
    fs.writeFileSync(
        path.join(reservedDraft, "SKILL.md"),
        "---\nname: python-dependencies\ndescription: Reserved test\n---\n\n# Test\n"
    );
    let rejected = false;
    try {
        run(binPath, ["agent-skill", "validate", reservedDraft], {
            cwd: projDir
        });
    } catch (error) {
        rejected = /reserved for a runtime-bundled Agent Skill/.test(
            `${error.stdout || ""}\n${error.stderr || ""}`
        );
    }
    if (!rejected) {
        throw new Error(
            "standalone mgd did not enforce the bundled reserved-name validation"
        );
    }

    console.log(`ok - packaging smoke test passed (mgd ${version})`);
} catch (e) {
    console.error(`FAIL - packaging smoke test: ${e.message}`);
    process.exitCode = 1;
} finally {
    fs.rmSync(workDir, { recursive: true, force: true });
}
