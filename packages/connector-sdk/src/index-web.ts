export {
    Record,
    AspectDefinition
} from "@magda/typescript-common/dist/generated/registry/api.js";
export { default as ConnectorRecordId } from "@magda/typescript-common/dist/ConnectorRecordId.js";
export { default as cleanOrgTitle } from "@magda/typescript-common/dist/util/cleanOrgTitle.js";
export {
    default as JsonTransformer,
    buildersToCompiledAspects,
    JsonTransformerOptions,
    CompiledAspects,
    BuilderSetupFunctionParameters,
    BuilderFunctionParameters
} from "@magda/typescript-common/dist/JsonTransformer.js";
import AspectBuilder from "@magda/typescript-common/dist/AspectBuilder.js";
export { AspectBuilder };
export const TenantConsts = require("@magda/typescript-common/dist/registry/TenantConsts.js");
