import * as yargs from "yargs";
import * as path from "path";
//import compile from "./compile";

const argv = yargs
    .config()
    .help()
    .option("scssVars", {
        describe: "SCSS vars to override. Expect JSON format string.",
        type: "string",
        default: ""
    })
    .option("contentApiUrl", {
        describe: "The base URL of the content API.",
        type: "string",
        default: "http://localhost:6119/v0"
    })
    .option("jwtSecret", {
        describe: "The shared secret for intra-network communication",
        type: "string",
        demand: true,
        default:
            process.env.JWT_SECRET || process.env.npm_package_config_jwtSecret
    })
    .option("userId", {
        describe:
            "The user id to use when making authenticated requests to the registry",
        type: "string",
        demand: true,
        default: process.env.USER_ID || process.env.npm_package_config_userId
    }).argv;

console.log(argv);

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
    console.log(clientRoot);
    /*compile(clientRoot, argv.scssVars)
        .then(result => {
            console.log(result);
        })
        .catch(e => {
            console.error("Error happend when compile SCSS: ", e);
            process.exit(1);
        });*/
} catch (e) {}
