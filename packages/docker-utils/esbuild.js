import * as esbuild from "esbuild";
import { requireResolve } from "@magda/esm-utils";

const entries = {
    "create-docker-context-for-node-component": requireResolve(
        "@magda/scripts/create-docker-context-for-node-component.js"
    ),
    "retag-and-push": requireResolve("@magda/scripts/retag-and-push.js"),
    "docker-util": requireResolve("@magda/scripts/docker-util.js")
};
await esbuild.build({
    entryPoints: entries,
    bundle: true,
    platform: "node",
    target: ["es2022"],
    outdir: "dist",
    format: "esm"
});
