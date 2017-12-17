import sleuther from "@magda/sleuther-framework/dist/index";
import onRecordFound from "./onRecordFound";
import duplicateRecordsAspectDef from "./duplicateRecordsAspectDef";
import datasetQualityAspectDef from "@magda/sleuther-framework/dist/common-aspect-defs/datasetQualityAspectDef";
import commonYargs from "@magda/sleuther-framework/dist/commonYargs";

const ID = "sleuther-duplicate-records";

const argv = commonYargs(ID, 6112, "http://localhost:6112");

function sleuthduplicateRecordss() {
    return sleuther({
        argv,
        id: ID,
        aspects: ["dataset-distributions"],
        optionalAspects: [],
        async: true,
        writeAspectDefs: [duplicateRecordsAspectDef, datasetQualityAspectDef],
        onRecordFound: (record, registry) =>
            onRecordFound(record, registry, argv.retries)
    });
}

sleuthduplicateRecordss().catch(e => {
    console.error("Error: " + e.message, e);
    process.exit(1);
});
