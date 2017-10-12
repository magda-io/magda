import sleuther from "@magda/sleuther-framework/dist/index";
import linkedDataAspectDef from "./linkedDataAspectDef";
import datasetQualityAspectDef from "./linkedDataAspectDef";
import onRecordFound from "./onRecordFound";
import commonYargs from "@magda/sleuther-framework/dist/commonYargs";

const ID = "sleuther-linked-data-rating";
const argv = commonYargs(ID, 6109, "http://localhost:6109").argv;

function sleuthLinkedData() {
  sleuther({
    argv,
    id: ID,
    aspects: ["dataset-distributions"],
    optionalAspects: [],
    writeAspectDefs: [linkedDataAspectDef, datasetQualityAspectDef],
    onRecordFound
  }).catch(e => {
    console.error("Error: " + e.message, e);
  });
}

sleuthLinkedData();
