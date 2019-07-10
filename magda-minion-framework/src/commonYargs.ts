import * as yargs from "yargs";

import addJwtSecretFromEnvVar from "@magda/typescript-common/dist/session/addJwtSecretFromEnvVar";
import { MAGDA_SYSTEM_ID } from "@magda/typescript-common/dist/registry/TenantConsts";

export type MinionArguments = {
    listenPort: string | number;
    internalUrl: string;
    jwtSecret: string;
    userId: string;
    registryUrl: string;
    tenantUrl: string;
    retries: string | number;
    tenantId: string | number;
};

/**
 * Builds an argv object that will accept command line arguments used by all common argv minions.
 *
 * @param id
 * @param defaultPort
 * @param defaultInternalUrl
 * @param additions
 */
export default function commonYargs<
    T extends MinionArguments = MinionArguments
>(
    defaultPort: number,
    defaultInternalUrl: string,
    additions: (a: yargs.Argv<MinionArguments>) => yargs.Argv<T> = x =>
        x as yargs.Argv<T>
): T {
    const yarr = yargs
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
        .option("tenantUrl", {
            describe: "The base url for the tenant service",
            type: "string",
            default:
                process.env.TENANT_URL ||
                process.env.npm_package_config_tenantUrl ||
                "http://localhost:6130/v0"
        })
        .option("retries", {
            describe: "The number of times to retry calling the registry",
            type: "number",
            default: process.env.RETRIES || 10
        })
        .option("tenantId", {
            describe:
                "The Tenant id to use when making requests to the registry",
            type: "number",
            demand: true,
            default:
                process.env.TENANT_ID ||
                process.env.npm_package_config_tenantId ||
                MAGDA_SYSTEM_ID
        });

    const returnValue = addJwtSecretFromEnvVar(additions(yarr).argv);
    return returnValue;
}
