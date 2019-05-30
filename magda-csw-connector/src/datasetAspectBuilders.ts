import * as fs from "fs";

export default [
    {
        aspectDefinition: {
            id: "csw-dataset",
            name: "OGC Catalogue Service for the Web (CSW) Dataset",
            jsonSchema: require("@magda/registry-aspects/csw-dataset.schema.json")
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/csw-dataset.js",
            "utf8"
        )
    },
    {
        aspectDefinition: {
            id: "dcat-dataset-strings",
            name: "DCAT Dataset properties as strings",
            jsonSchema: require("@magda/registry-aspects/dcat-dataset-strings.schema.json")
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
            jsonSchema: require("@magda/registry-aspects/source.schema.json")
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/dataset-source.js",
            "utf8"
        )
    },
    {
        aspectDefinition: {
            id: "temporal-coverage",
            name: "Temporal Coverage",
            jsonSchema: require("@magda/registry-aspects/temporal-coverage.schema.json")
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/temporal-coverage.js",
            "utf8"
        )
    }
];
