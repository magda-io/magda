import { WebHook } from "magda-typescript-common/src/generated/registry/api";
import Registry from "magda-typescript-common/src/registry/AuthorizedRegistryClient";

import MinionOptions from "./MinionOptions";
import getWebhookUrl from "./getWebhookUrl";
import buildWebhookConfig from "./buildWebhookConfig";

export type NeedsCrawl = Promise<boolean>;

export default async function registerNewWebhook(
    options: MinionOptions,
    registry: Registry
) {
    console.info("Registering webhook");

    const webHookConfig = buildWebhookConfig(options);

    const newWebHook: WebHook = {
        id: options.id,
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
        enabled: true,
        lastRetryTime: null,
        retryCount: 0,
        isRunning: null,
        isProcessing: null,
        ownerId: undefined,
        createTime: undefined,
        creatorId: undefined,
        editTime: undefined,
        editorId: undefined
    };

    return registry.putHook(newWebHook);
}
