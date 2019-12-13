import minion from "magda-minion-framework/src/index";
import ckanSyncAspectDef from "./ckanSyncAspectDef";
import onRecordFound from "./onRecordFound";
import commonYargs from "magda-minion-framework/src/commonYargs";

const ID = "minion-linked-data-rating";
const argv = commonYargs(6121, "http://localhost:6121");

minion({
    argv,
    id: ID,
    aspects: ["ckan-sync"],
    optionalAspects: [],
    writeAspectDefs: [ckanSyncAspectDef],
    onRecordFound
}).catch(e => {
    console.error("Error: " + e.message, e);
    process.exit(1);
});
