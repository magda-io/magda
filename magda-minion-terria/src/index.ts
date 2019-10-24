import { XMLHttpRequest } from "xmlhttprequest-ssl";
const anyGlobal: any = global;
anyGlobal.window = global;
anyGlobal.XMLHttpRequest = XMLHttpRequest;

require("amd-loader");
import commonYargs from "@magda/minion-framework/dist/commonYargs";
import minion from "@magda/minion-framework/dist/index";
import onRecordFound from "./onRecordFound";

const ID = "minion-terria";
const argv = commonYargs(6501, "http://localhost:6501");

const aspectDefinition = {
    id: "terria",
    name: "Terria Catalog Details",
    jsonSchema: require("@magda/registry-aspects/terria.schema.json")
};

minion({
    argv,
    aspects: [],
    async: true,
    id: ID,
    onRecordFound,
    optionalAspects: [
        "terria",
        "group",
        "dcat-dataset-strings",
        "dcat-distribution-strings",
        "dataset-distributions",
        "dataset-format"
    ],
    writeAspectDefs: [aspectDefinition]
}).catch((e: Error) => {
    console.error("Error: " + e.message, e);
    process.exit(1);
});
