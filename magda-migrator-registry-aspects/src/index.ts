import yargs from "yargs";
import path from "path";
import AuthorizedRegistryClient from "magda-typescript-common/src/registry/AuthorizedRegistryClient.js";
import addJwtSecretFromEnvVar from "magda-typescript-common/src/session/addJwtSecretFromEnvVar.js";
import { MAGDA_ADMIN_PORTAL_ID } from "magda-typescript-common/src/registry/TenantConsts.js";
import fse from "fs-extra";
import ServerError from "magda-typescript-common/src/ServerError.js";
import { requireResolve } from "@magda/esm-utils";

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
        }).argv
);

const registryClient = new AuthorizedRegistryClient({
    userId: argv.userId,
    jwtSecret: argv.jwtSecret as string,
    baseUrl: argv.registryUrl,
    tenantId: MAGDA_ADMIN_PORTAL_ID
});

const schemaFileNameFilterRegEx = /\.schema.json$/;
const schemaFileNameRegEx = /^([^\.]+)\.schema.json$/;

type AspectDefItem = {
    id: string;
    name: string;
    jsonSchema: { [key: string]: any };
};

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

(async () => {
    const aspectDefs = getAllBuiltInAspectDefs();
    if (!aspectDefs?.length) {
        throw new Error(
            "Cannot locate built-in registry aspect definition files"
        );
    }
    for (let i = 0; i < aspectDefs.length; i++) {
        try {
            if (aspectDefs[i]?.id?.length > 100) {
                console.log(
                    `Aspect '${aspectDefs[i]?.id}' has a ID over 100 characters. Skipped processing this aspect definition.`
                );
                continue;
            }
            const aspectDef = await registryClient.getAspectDefinition(
                aspectDefs[i].id
            );
            console.log(
                `AspectDef '${aspectDef.id}' exists in registry. Skip definition creation.`
            );
        } catch (e) {
            if (e instanceof ServerError && e.statusCode === 404) {
                console.log(`AspectDef '${aspectDefs[i].id}' not present.`);
                console.log(
                    `Creating aspect definition for '${aspectDefs[i].id}'...`
                );
                const aspectDef = { ...aspectDefs[i] };
                if (aspectDef?.name?.length > 100) {
                    console.log(
                        `Aspect '${aspectDef.id}' has a name over 100 characters. Use aspect ID as name instead.`
                    );
                    aspectDef.name = aspectDef.id;
                }
                await registryClient.putAspectDefinition(aspectDef);
                console.log(
                    `Created aspect definition for '${aspectDefs[i].id}'.`
                );
                continue;
            }
        }
    }
    console.log("Registry aspect definitions migration has been completed!");
})();

process.on(
    "unhandledRejection",
    (reason: {} | null | undefined, promise: Promise<any>) => {
        console.error("Unhandled rejection");
        console.error(reason);
    }
);
