import minion from "magda-minion-framework/src/index";
import linkedDataAspectDef from "./linkedDataAspectDef";
import datasetQualityAspectDef from "./datasetQualityAspectDef";
import onRecordFound from "./onRecordFound";
import commonYargs from "magda-minion-framework/src/commonYargs";

const ID = "minion-linked-data-rating";
const argv = commonYargs(6109, "http://localhost:6109");

function sleuthLinkedData() {
    minion({
        argv,
        id: ID,
        aspects: ["dataset-distributions"],
        optionalAspects: ["dataset-format", "source-link-status"],
        writeAspectDefs: [linkedDataAspectDef, datasetQualityAspectDef],
        onRecordFound
    }).catch(e => {
        console.error("Error: " + e.message, e);
        process.exit(1);
    });
}

sleuthLinkedData();
