import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";

import SleutherOptions from "./SleutherOptions";

export type NeedsCrawl = Promise<boolean>;

export default async function resumeWebhook(
    options: SleutherOptions,
    registry: Registry
) {
    console.info(`Attempting to resume webhook ${options.id}`);

    const resumeResult = await registry.resumeHook(options.id);

    if (resumeResult instanceof Error) {
        throw resumeResult;
    }

    console.info(
        `Successfully resumed webhook - last event id was ${
            resumeResult.lastEventIdReceived
        }`
    );
}
