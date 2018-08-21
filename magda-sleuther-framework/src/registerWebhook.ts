import {
    WebHook,
    WebHookConfig
} from "@magda/typescript-common/dist/generated/registry/api";
import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";

import SleutherOptions from "./SleutherOptions";
import getWebhookUrl from "./getWebhookUrl";

export type NeedsCrawl = Promise<boolean>;

export default async function registerNewWebhook(
    options: SleutherOptions,
    registry: Registry
) {
    console.info("Registering webhook");

    const webHookConfig: WebHookConfig = {
        aspects: options.aspects,
        optionalAspects: options.optionalAspects,
        includeEvents: false,
        includeRecords: true,
        includeAspectDefinitions: false,
        dereference: true
    };

    const newWebHook: WebHook = {
        id: options.id,
        userId: 0, // TODO: When this matters
        name: options.id,
        active: true,
        url: getWebhookUrl(options),
        eventTypes: [
            "CreateRecord",
            "CreateAspectDefinition",
            "CreateRecordAspect",
            "PatchRecord",
            "PatchAspectDefinition",
            "PatchRecordAspect"
        ],
        config: webHookConfig,
        lastEvent: null,
        isWaitingForResponse: false,
        lastRetryTime: null,
        retryCount: 0
    };

    return registry.postHook(newWebHook);
}
