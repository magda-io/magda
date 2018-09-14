import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";

import MinionOptions from "./MinionOptions";

export default async function isWebhookRegistered(
    options: MinionOptions,
    registry: Registry
): Promise<boolean> {
    const hook = await registry.getHook(options.id);

    if (hook instanceof Error) {
        throw hook;
    }

    return hook.map(() => true).valueOr(false);
}
