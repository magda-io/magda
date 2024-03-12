import isEqual from "lodash/isEqual.js";

import Registry from "magda-typescript-common/src/registry/AuthorizedRegistryClient.js";

import MinionOptions from "./MinionOptions.js";
import buildWebhookConfig from "./buildWebhookConfig.js";
import getWebhookUrl from "./getWebhookUrl.js";

export default async function isWebhookRegistered(
    options: MinionOptions,
    registry: Registry
): Promise<boolean> {
    const maybeHook = await registry.getHook(options.id);

    if (maybeHook instanceof Error) {
        throw maybeHook;
    }

    const newWebhookConfig = buildWebhookConfig(options);

    return maybeHook
        .map(
            (hook) =>
                isEqual(hook.config, newWebhookConfig) &&
                hook.url === getWebhookUrl(options)
        )
        .valueOr(false);
}
