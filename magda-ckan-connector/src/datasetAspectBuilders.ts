import * as fs from 'fs';

export default [
    {
        aspectDefinition: {
            id: "ckan-dataset",
            name: "CKAN Dataset",
            jsonSchema: require("@magda/registry-aspects/ckan-dataset.schema.json")
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/ckan-dataset.js",
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
        setupFunctionString: fs.readFileSync(
            "aspect-templates/temporal-coverage-setup.js",
            "utf8"
        ),
        builderFunctionString: fs.readFileSync(
            "aspect-templates/temporal-coverage.js",
            "utf8"
        )
    }
];
