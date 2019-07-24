import { Publisher } from "../helpers/record";
import { emptyPublisher } from "../helpers/record";

export function parsePublisher(publisherRaw?: Publisher): Publisher {
    let error: string | null = null;
    if (publisherRaw && !publisherRaw.id) {
        error = publisherRaw.message || "an error occurred";
    }
    if (!publisherRaw) {
        return emptyPublisher;
    }
    const publisher = {
        name: publisherRaw.name,
        id: publisherRaw.id,
        aspects:
            publisherRaw.aspects && publisherRaw.aspects["organization-details"]
                ? publisherRaw.aspects
                : emptyPublisher.aspects,
        error: error
    };
    return publisher;
}
