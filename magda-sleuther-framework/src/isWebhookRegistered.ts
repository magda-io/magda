import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";

import SleutherOptions from "./SleutherOptions";

export default async function isWebhookRegistered(
    options: SleutherOptions,
    registry: Registry
): Promise<boolean> {
    const hook = await registry.getHook(options.id);

    if (hook instanceof Error) {
        throw hook;
    }

    return hook.map(() => true).valueOr(false);
}
