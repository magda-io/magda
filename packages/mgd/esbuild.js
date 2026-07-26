import { chmodSync } from "node:fs";
import * as esbuild from "esbuild";

const outfile = "bin/mgd.js";

await esbuild.build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    platform: "node",
    target: ["es2022"],
    format: "esm",
    outfile,
    banner: { js: "#!/usr/bin/env node" },
    external: ["commander"]
});

// Make the bundle executable so `npm link` / direct execution works locally.
// (npm sets the bit on publish/install from the "bin" field, but a bare
// `yarn build` would otherwise leave it 0644.)
chmodSync(outfile, 0o755);
