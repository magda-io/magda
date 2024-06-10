import * as esbuild from "esbuild";
import { require } from "@magda/esm-utils";
const pkg = require("./package.json");

await esbuild.build({
    entryPoints: ["./src/index.ts"],
    bundle: true,
    platform: "node",
    target: ["es2022"],
    outdir: "dist",
    inject: ["../cjs-shim.js"],
    external: [
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.peerDependencies || {})
    ],
    format: "esm"
});
