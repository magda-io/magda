import * as fs from "fs";

export default [
    {
        aspectDefinition: {
            id: "source",
            name: "Source",
            jsonSchema: require("@magda/registry-aspects/source.schema.json"),
            tenantId: "tenant id in number string"
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/organization-source.js",
            "utf8"
        )
    },
    {
        aspectDefinition: {
            id: "organization-details",
            name: "Organization",
            jsonSchema: require("@magda/registry-aspects/organization-details.schema.json"),
            tenantId: "tenant id in number string"
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/organization-details.js",
            "utf8"
        )
    }
];
