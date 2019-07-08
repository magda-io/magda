import minion from "@magda/minion-framework/dist/index";
import onRecordFound from "./onRecordFound";
import formatAspectDef from "./formatAspectDef";
import commonYargs from "@magda/minion-framework/dist/commonYargs";
import { MAGDA_SYSTEM_ID } from "@magda/typescript-common/dist/registry/TenantConsts";

const ID = "minion-format";

const argv = commonYargs(6115, "http://localhost:6115");

function sleuthLayerer() {
    return minion({
        argv,
        id: ID,
        aspects: ["dcat-distribution-strings"],
        optionalAspects: [],
        async: false,
        writeAspectDefs: [formatAspectDef],
        tenantId: MAGDA_SYSTEM_ID,
        onRecordFound
    });
}

sleuthLayerer().catch(e => {
    console.error("Error:" + e.message, e);
    process.exit(1);
});
