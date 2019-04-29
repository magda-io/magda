import * as fs from "fs";

export default [
    {
        aspectDefinition: {
            id: "csw-distribution",
            name: "OGC Catalogue Service for the Web (CSW) Distribution",
            jsonSchema: require("@magda/registry-aspects/csw-distribution.schema.json"),
            tenantId: "tenant id in number string"
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/csw-distribution.js",
            "utf8"
        )
    },
    {
        aspectDefinition: {
            id: "dcat-distribution-strings",
            name: "DCAT Distribution properties as strings",
            jsonSchema: require("@magda/registry-aspects/dcat-distribution-strings.schema.json"),
            tenantId: "tenant id in number string"
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/dcat-distribution-strings.js",
            "utf8"
        )
    },
    {
        aspectDefinition: {
            id: "source",
            name: "Source",
            jsonSchema: require("@magda/registry-aspects/source.schema.json"),
            tenantId: "tenant id in number string"
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/distribution-source.js",
            "utf8"
        )
    }
];
