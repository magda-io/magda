import minion from "@magda/minion-framework/dist/index";
import onRecordFound from "./onRecordFound";
import commonYargs from "@magda/minion-framework/dist/commonYargs";
import { MAGDA_SYSTEM_ID } from "@magda/typescript-common/dist/registry/TenantConsts";
const ID = "minion-visualization";
const argv = commonYargs(6311, "http://localhost:6311");

const aspectDefinition = {
    id: "visualization-info",
    name:
        "Information to power smart visualisations for distributions in the front-end",
    jsonSchema: require("@magda/registry-aspects/visualization-info.schema.json"),
    tenantId: "tenant id in number string"
};

minion({
    argv,
    aspects: ["dcat-distribution-strings"],
    async: true,
    id: ID,
    tenantId: MAGDA_SYSTEM_ID,
    onRecordFound,
    optionalAspects: [],
    writeAspectDefs: [aspectDefinition]
}).catch((e: Error) => {
    console.error("Error: " + e.message, e);
    process.exit(1);
});
