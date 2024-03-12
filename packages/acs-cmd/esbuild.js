import * as esbuild from "esbuild";
import path from "path";
import fse from "fs-extra";
import { requireResolve, require } from "@magda/esm-utils";
const pkg = require("./package.json");

const magdaScriptEntryDir = path.dirname(
    requireResolve("@magda/scripts/acs-cmd/index.js")
);

const entries = (() => {
    const entries = {
        "acs-cmd": path.resolve(magdaScriptEntryDir, "index.js")
    };
    const items = fse.readdirSync(magdaScriptEntryDir, { encoding: "utf8" });
    if (items && items.length) {
        items.forEach((item) => {
            if (path.extname(item) !== ".js") {
                return;
            }
            if (item !== "index.js") {
                entries[item.replace(/\.js$/, "")] = path.join(
                    magdaScriptEntryDir,
                    item
                );
            }
        });
    }
    return entries;
})();

await esbuild.build({
    entryPoints: entries,
    bundle: true,
    platform: "node",
    target: ["es2022"],
    outdir: "./bin",
    format: "esm",
    external: [
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.peerDependencies || {})
    ]
});
