import minion from "@magda/minion-framework/dist/index";
import linkedDataAspectDef from "./linkedDataAspectDef";
import datasetQualityAspectDef from "@magda/minion-framework/dist/common-aspect-defs/datasetQualityAspectDef";
import onRecordFound from "./onRecordFound";
import commonYargs from "@magda/minion-framework/dist/commonYargs";
import { MAGDA_SYSTEM_ID } from "@magda/typescript-common/dist/registry/TenantConsts";

const ID = "minion-linked-data-rating";
const argv = commonYargs(6109, "http://localhost:6109");

function sleuthLinkedData() {
    minion({
        argv,
        id: ID,
        aspects: ["dataset-distributions"],
        optionalAspects: ["dataset-format", "source-link-status"],
        writeAspectDefs: [linkedDataAspectDef, datasetQualityAspectDef],
        tenantId: MAGDA_SYSTEM_ID,
        onRecordFound
    }).catch(e => {
        console.error("Error: " + e.message, e);
        process.exit(1);
    });
}

sleuthLinkedData();
