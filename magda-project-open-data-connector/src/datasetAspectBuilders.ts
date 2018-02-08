import * as fs from "fs";

export default [
    {
        aspectDefinition: {
            id: "project-open-data-dataset",
            name: "Project Open Data (data.json) Dataset",
            jsonSchema: require("@magda/registry-aspects/project-open-data-dataset.schema.json")
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/project-open-data-dataset.js",
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
