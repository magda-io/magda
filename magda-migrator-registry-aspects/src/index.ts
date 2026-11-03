import yargs from "yargs";
import path from "path";
import AuthorizedRegistryClient from "magda-typescript-common/src/registry/AuthorizedRegistryClient.js";
import addJwtSecretFromEnvVar from "magda-typescript-common/src/session/addJwtSecretFromEnvVar.js";
import { MAGDA_ADMIN_PORTAL_ID } from "magda-typescript-common/src/registry/TenantConsts.js";
import fse from "fs-extra";
import { requireResolve } from "@magda/esm-utils";
import {
    AspectDefItem,
    migrateAspectDefinitions
} from "./migrateAspectDefinitions.js";

const argv = addJwtSecretFromEnvVar(
    yargs
        .config()
        .help()
        .option("registryUrl", {
            describe: "The base url for the registry",
            type: "string",
            default:
                process.env.REGISTRY_URL ||
                process.env.npm_package_config_registryUrl ||
                "http://localhost:6101/v0"
        })
        .option("userId", {
            describe:
                "The user id to use when making authenticated requests to the registry",
            type: "string",
            demand: true,
            default:
                process.env.USER_ID || process.env.npm_package_config_userId
        })
        .option("maxRetries", {
            describe:
                "How many times to retry a failed aspect definition write",
            type: "number",
            default: 10
        })
        .option("secondsBetweenRetries", {
            describe: "Seconds to wait between write retries",
            type: "number",
            default: 10
        }).argv
);

const registryClient = new AuthorizedRegistryClient({
    userId: argv.userId,
    jwtSecret: argv.jwtSecret as string,
    baseUrl: argv.registryUrl,
    tenantId: MAGDA_ADMIN_PORTAL_ID,
    maxRetries: argv.maxRetries,
    secondsBetweenRetries: argv.secondsBetweenRetries
});

const schemaFileNameFilterRegEx = /\.schema.json$/;
const schemaFileNameRegEx = /^([^\.]+)\.schema.json$/;

function getAllBuiltInAspectDefs(): AspectDefItem[] {
    const aspectDefDir = path.dirname(
        requireResolve("@magda/registry-aspects/package.json")
    );
    return fse
        .readdirSync(aspectDefDir)
        .filter((item) => schemaFileNameFilterRegEx.test(item))
        .map((defFile) => {
            const jsonSchema = fse.readJsonSync(
                path.resolve(aspectDefDir, defFile)
            );
            const matches = defFile.match(schemaFileNameRegEx);
            if (matches.length < 2) {
                throw new Error(
                    `Cannot match aspect id, invalid schema file name: ${defFile}`
                );
            }
            const aspectId = matches[1];
            return {
                id: aspectId,
                name: jsonSchema?.title ? jsonSchema.title : aspectId,
                jsonSchema
            };
        });
}

migrateAspectDefinitions(registryClient, getAllBuiltInAspectDefs()).then(
    () => {
        console.log(
            "Registry aspect definitions migration has been completed!"
        );
    },
    (e) => {
        // Fail the Job so Kubernetes retries it and the release does not report
        // success with a definition that was never created or upgraded.
        console.error("Registry aspect definitions migration failed:");
        console.error(e);
        process.exitCode = 1;
    }
);

process.on(
    "unhandledRejection",
    (reason: {} | null | undefined, promise: Promise<any>) => {
        console.error("Unhandled rejection");
        console.error(reason);
        process.exitCode = 1;
    }
);
