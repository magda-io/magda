import * as fs from "fs";
import { MAGDA_ADMIN_PORTAL_ID } from "@magda/typescript-common/src/registry/TenantConsts";

export default [
    {
        aspectDefinition: {
            id: "source",
            name: "Source",
            jsonSchema: require("@magda/registry-aspects/source.schema.json"),
            tenantId: MAGDA_ADMIN_PORTAL_ID
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
            tenantId: MAGDA_ADMIN_PORTAL_ID
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/organization-details.js",
            "utf8"
        )
    }
];
