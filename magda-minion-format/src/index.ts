import minion from "@magda/minion-framework/dist/index";
import onRecordFound from "./onRecordFound";
import formatAspectDef from "./formatAspectDef";
import commonYargs from "@magda/minion-framework/dist/commonYargs";

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
        onRecordFound
    });
}

sleuthLayerer().catch(e => {
    console.error("Error:" + e.message, e);
    process.exit(1);
});
