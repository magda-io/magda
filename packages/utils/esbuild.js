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
        // should always be esm
        format: "esm"
    });
}

await build();
await build(true);
