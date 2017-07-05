// @flow

import type { Publisher } from '../types';

type PublisherRaw = {
    name: string,
    id: string,
    aspects: {
        'organization-details': {
            name: string,
            title: string,
            imageUrl : string,
            description: string
        }
    }
}


export function parsePublisher(publisherRaw: PublisherRaw) : Publisher{
    const publisher = {
        name: publisherRaw.name,
        description: publisherRaw.aspects['organization-details']['description'] || 'A description of this publisher is not available',
        image_url: publisherRaw.aspects['organization-details']['imageUrl'] || 'http://placehold.it/100x100?text=Image+unavailable',
        id: publisherRaw.id
    }
    return publisher
}
