import minion from "magda-minion-framework/src/index";
import ckanSyncAspectDef from "./ckanSyncAspectDef";
import onRecordFound from "./onRecordFound";
import commonYargs from "magda-minion-framework/src/commonYargs";
import CkanClient from "magda-typescript-common/src/CkanClient";
import partial from "lodash/partial";

const ID = "minion-ckan-sync";
const argv = commonYargs(6121, "http://localhost:6121", argv =>
    argv
        .option("ckanServerUrl", {
            describe: "the ckan server URL",
            type: "string",
            default:
                process.env.CKAN_SERVER_URL ||
                process.env.npm_package_config_ckanServerUrl
        })
        .option("defaultCkanAPIKey", {
            describe:
                "the default ckan server API key used if sync request users don't have a ckan account",
            type: "string",
            default:
                process.env.CKAN_DEFAULT_API_KEY ||
                process.env.npm_package_config_ckanAPIKey
        })
        .option("externalUrl", {
            describe:
                "the magda web ui external access URL. Used for generating dataset source url",
            type: "string",
            default:
                process.env.EXTERNAL_URL ||
                process.env.npm_package_config_externalUrl
        })
);

const ckanClient = new CkanClient(argv.ckanServerUrl, argv.defaultCkanAPIKey);

minion({
    argv,
    id: ID,
    aspects: ["ckan-sync"],
    optionalAspects: [],
    writeAspectDefs: [ckanSyncAspectDef],
    onRecordFound: partial(onRecordFound, ckanClient, argv.externalUrl)
}).catch(e => {
    console.error("Error: " + e.message, e);
    process.exit(1);
});
