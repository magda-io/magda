import * as esbuild from "esbuild";

async function build(web = false) {
    const target = web ? "es6" : "es2022";
    const platform = web ? "browser" : "node";
    const entryPoints = web ? ["./src/index-web.ts"] : ["./src/index.ts"];
    console.log(
        `Building for ${entryPoints} ${platform} with target ${target}`
    );
    await esbuild.build({
        entryPoints: entryPoints,
        bundle: true,
        platform: platform,
        target: [target],
        outdir: "dist",
        inject: ["../cjs-shim.js"],
        // should always be esm
        format: "esm"
    });
}

await build();
// disable web build for now (due to registry api code that is not yet compatible with web build)
//await build(true);
