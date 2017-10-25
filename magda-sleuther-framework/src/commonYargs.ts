import * as yargs from "yargs";

export type SleutherArguments = yargs.Arguments;

export interface SleutherArgv extends yargs.Argv {
    argv: SleutherArguments;
}

export default function commonYargs(
    id: string,
    defaultPort: number,
    defaultInternalUrl: string
) {
    return yargs
        .config()
        .help()
        .option("listenPort", {
            describe: "The TCP/IP port on which the gateway should listen.",
            type: "number",
            default: process.env.NODE_PORT || defaultPort
        })
        .option("internalUrl", {
            describe: "The base external URL of the gateway.",
            type: "string",
            default: process.env.INTERNAL_URL || defaultInternalUrl
        })
        .option("jwtSecret", {
            describe: "The shared secret for intra-network communication",
            type: "string",
            demand: true,
            default:
                process.env.JWT_SECRET ||
                process.env.npm_package_config_jwtSecret
        })
        .option("userId", {
            describe:
                "The user id to use when making authenticated requests to the registry",
            type: "string",
            demand: true,
            default:
                process.env.USER_ID || process.env.npm_package_config_userId
        })
        .option("registryUrl", {
            describe: "The base url for the registry",
            type: "string",
            default:
                process.env.REGISTRY_URL ||
                process.env.npm_package_config_registryUrl ||
                "http://localhost:6101/v0"
        })
        .option("retries", {
            describe: "The number of times to retry calling the registry",
            type: "number",
            default: process.env.RETRIES || 10
        }) as SleutherArgv;
}
