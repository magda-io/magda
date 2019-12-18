import minion from "magda-minion-framework/src/index";
import ckanSyncAspectDef from "./ckanSyncAspectDef";
import onRecordFound from "./onRecordFound";
import commonYargs from "magda-minion-framework/src/commonYargs";
import CkanClient from "magda-typescript-common/src/CkanClient";
import partial from "lodash/partial";

const ID = "minion-ckan-sync";
const argv = commonYargs(6121, "http://localhost:6121");

const ckanClient = new CkanClient(
    "https://demo.ckan.org",
    "49f1bfa8-5fa5-4a96-97d9-c86d4e822f5c"
);

minion({
    argv,
    id: ID,
    aspects: ["ckan-sync"],
    optionalAspects: [],
    writeAspectDefs: [ckanSyncAspectDef],
    onRecordFound: partial(onRecordFound, ckanClient)
}).catch(e => {
    console.error("Error: " + e.message, e);
    process.exit(1);
});
