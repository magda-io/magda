import * as fs from "fs";

export default [
    {
        aspectDefinition: {
            id: "csv-dataset",
            name: "Spreadsheet sourced dataset",
            jsonSchema: require("@magda/registry-aspects/csv-dataset.schema.json"),
            tenantId: undefined
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/csv-dataset.js",
            "utf8"
        )
    },
    {
        aspectDefinition: {
            id: "dcat-dataset-strings",
            name: "DCAT Dataset properties as strings",
            jsonSchema: require("@magda/registry-aspects/dcat-dataset-strings.schema.json"),
            tenantId: undefined
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/dcat-dataset-strings.js",
            "utf8"
        )
    },
    {
        aspectDefinition: {
            id: "source",
            name: "Source",
            jsonSchema: require("@magda/registry-aspects/source.schema.json"),
            tenantId: undefined
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/dataset-source.js",
            "utf8"
        )
    }
];
