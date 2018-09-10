import * as yargs from "yargs";
import * as path from "path";
import compile from "./compile";

const argv = yargs
    .config()
    .help()
    .option("scssVars", {
        describe: "SCSS vars to override. Expect JSON format string.",
        type: "string",
        default: ""
    }).argv;

const clientRoot = path.resolve(
    require.resolve("@magda/web-client/package.json"),
    ".."
);

// --- parse argv.scssVars
try {
    if (argv.scssVars) {
        const scssVars = JSON.parse(argv.scssVars);
        argv.scssVars = scssVars;
    } else {
        argv.scssVars = {};
    }
} catch (e) {
    console.error("Failed to parse `argv.scssVars`. ", e);
    process.exit(1);
}

try {
    compile(clientRoot, argv.scssVars)
        .then(result => {
            console.log(result);
        })
        .catch(e => {
            console.error("Error happend when compile SCSS: ", e);
            process.exit(1);
        });
} catch (e) {}
