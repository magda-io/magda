import sleuther from "@magda/sleuther-framework/dist/index";
import onRecordFound from "./onRecordFound";
import formatAspectDef from "./formatAspectDef";
import commonYargs from "@magda/sleuther-framework/dist/commonYargs";

const ID = "sleuther-format";

const argv = commonYargs(ID, 6115, "http://localhost:6115");

function sleuthLayerer() {
    return sleuther({
        argv,
        id: ID,
        aspects: ["dataset-distributions"],
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
