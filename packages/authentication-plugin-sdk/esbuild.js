import * as esbuild from "esbuild";

await esbuild.build({
    entryPoints: ["./src/index.ts"],
    bundle: true,
    platform: "node",
    target: ["es2022"],
    outdir: "dist",
    format: "esm",
    external: ["pg"]
});
