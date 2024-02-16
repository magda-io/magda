import minion from "@magda/minion-framework/dist/index.js";
export default minion;

export {
    default as commonYargs,
    MinionArguments
} from "@magda/minion-framework/dist/commonYargs.js";
export {
    default as AuthorizedRegistryClient,
    AuthorizedRegistryOptions
} from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient.js";
export {
    Record,
    AspectDefinition
} from "@magda/typescript-common/dist/generated/registry/api.js";
export {
    default as MinionOptions,
    onRecordFoundType
} from "@magda/minion-framework/dist/MinionOptions.js";
