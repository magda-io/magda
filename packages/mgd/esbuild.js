import * as esbuild from "esbuild";

await esbuild.build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    platform: "node",
    target: ["es2022"],
    format: "esm",
    outfile: "bin/mgd.js",
    banner: { js: "#!/usr/bin/env node" },
    external: ["commander"]
});
