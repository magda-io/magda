import sleuther from "@magda/sleuther-framework/dist/index";
import onRecordFound from "./onRecordFound";
import summarizeAspectDef from "./formatAspectDef";
import commonYargs from "@magda/sleuther-framework/dist/commonYargs";

const ID = "sleuther-summarizer";

const argv = commonYargs(ID, 6114, "http://localhost:6114");

function sleuthLayerer() {
    return sleuther({
        argv,
        id: ID,
        aspects: ["dataset-distributions"],
        optionalAspects: [],
        async: true,
        writeAspectDefs: [summarizeAspectDef],
        onRecordFound: (record, registry) =>
            onRecordFound(record, registry)
    });
}

sleuthLayerer().catch(e => {
    console.error("Error:" + e.message, e);
    process.exit(1);
});
