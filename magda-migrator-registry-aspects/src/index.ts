import yargs from "yargs";
import path from "path";
import AuthorizedRegistryClient from "magda-typescript-common/src/registry/AuthorizedRegistryClient";
import addJwtSecretFromEnvVar from "magda-typescript-common/src/session/addJwtSecretFromEnvVar";
import { MAGDA_ADMIN_PORTAL_ID } from "magda-typescript-common/src/registry/TenantConsts";
import fse from "fs-extra";
import ServerError from "magda-typescript-common/src/ServerError";

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
        require.resolve("@magda/registry-aspects/package.json")
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
    console.log(argv);
    const aspectDefs = getAllBuiltInAspectDefs();
    if (!aspectDefs?.length) {
        throw new Error(
            "Cannot locate built-in registry aspect definition files"
        );
    }
    for (let i = 0; i < aspectDefs.length; i++) {
        try {
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
                await registryClient.putAspectDefinition(aspectDefs[i]);
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
