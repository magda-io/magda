import { chmodSync } from "node:fs";
import * as esbuild from "esbuild";

const outfile = "bin/mgd.js";

const result = await esbuild.build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    platform: "node",
    target: ["es2022"],
    format: "esm",
    outfile,
    banner: { js: "#!/usr/bin/env node" },
    external: ["commander", "crc-32", "js-yaml", "yauzl", "yazl"],
    metafile: true
});

const commonInputs = Object.keys(result.metafile.inputs)
    .map((input) => input.replaceAll("\\", "/"))
    .filter((input) => input.includes("magda-typescript-common/"));
if (
    commonInputs.length !== 1 ||
    !commonInputs[0].endsWith("magda-typescript-common/dist/agentSkillNames.js")
) {
    throw new Error(
        `mgd must bundle only the dependency-free Agent Skill name module from @magda/typescript-common; found: ${
            commonInputs.join(", ") || "none"
        }`
    );
}

// Make the bundle executable so `npm link` / direct execution works locally.
// (npm sets the bit on publish/install from the "bin" field, but a bare
// `yarn build` would otherwise leave it 0644.)
chmodSync(outfile, 0o755);
