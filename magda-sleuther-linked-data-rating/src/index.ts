import sleuther from "@magda/sleuther-framework/dist/index";
import linkedDataAspectDef from "./linkedDataAspectDef";
import datasetQualityAspectDef from "@magda/sleuther-framework/dist/common-aspect-defs/datasetQualityAspectDef";
import onRecordFound from "./onRecordFound";
import commonYargs from "@magda/sleuther-framework/dist/commonYargs";

const ID = "sleuther-linked-data-rating";
const argv = commonYargs(ID, 6109, "http://localhost:6109");

function sleuthLinkedData() {
    sleuther({
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
