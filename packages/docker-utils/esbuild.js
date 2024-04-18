import * as esbuild from "esbuild";
import { requireResolve, require } from "@magda/esm-utils";
const pkg = require("./package.json");

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
    external: [
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.peerDependencies || {})
    ],
    outdir: "dist",
    format: "esm"
});
