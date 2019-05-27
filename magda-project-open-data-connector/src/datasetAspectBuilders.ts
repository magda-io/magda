import * as fs from "fs";
import { MAGDA_ADMIN_PORTAL_ID } from "@magda/typescript-common/src/registry/TenantConsts";

export default [
    {
        aspectDefinition: {
            id: "project-open-data-dataset",
            name: "Project Open Data (data.json) Dataset",
            jsonSchema: require("@magda/registry-aspects/project-open-data-dataset.schema.json"),
            tenantId: MAGDA_ADMIN_PORTAL_ID
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
            jsonSchema: require("@magda/registry-aspects/dcat-dataset-strings.schema.json"),
            tenantId: MAGDA_ADMIN_PORTAL_ID
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
            tenantId: MAGDA_ADMIN_PORTAL_ID
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
            jsonSchema: require("@magda/registry-aspects/temporal-coverage.schema.json"),
            tenantId: MAGDA_ADMIN_PORTAL_ID
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/temporal-coverage.js",
            "utf8"
        )
    }
];
