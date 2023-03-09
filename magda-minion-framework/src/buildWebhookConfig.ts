import { WebHookConfig } from "magda-typescript-common/src/generated/registry/api";
import MinionOptions from "./MinionOptions";

export default function buildWebhookConfig(
    options: MinionOptions
): WebHookConfig {
    return {
        aspects: options.aspects,
        optionalAspects: options.optionalAspects,
        includeEvents:
            typeof options.includeEvents === "boolean"
                ? options.includeEvents
                : false,
        includeRecords:
            typeof options.includeRecords === "boolean"
                ? options.includeRecords
                : true,
        includeAspectDefinitions:
            typeof options.includeAspectDefinitions === "boolean"
                ? options.includeAspectDefinitions
                : false,
        dereference:
            typeof options.dereference === "boolean"
                ? options.dereference
                : true
    };
}
