import * as esbuild from "esbuild";
import { requireResolve } from "@magda/esm-utils";

const magdaScriptEntry = requireResolve(
    "@magda/scripts/create-secrets/index.js"
);

await esbuild.build({
    entryPoints: [magdaScriptEntry],
    bundle: true,
    platform: "node",
    target: ["es2022"],
    outdir: "bin",
    format: "esm"
});
