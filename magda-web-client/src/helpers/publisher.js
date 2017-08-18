// @flow
import type {Publisher} from '../record';
import {defaultPublisher} from '../helpers/record';

export function parsePublisher(publisherRaw: Publisher) : Publisher{
    let error = null;
    if(publisherRaw && !publisherRaw.id){
      error = publisherRaw.message || 'an error occurred';
    }
    const publisher = {
        name: publisherRaw.name,
        id: publisherRaw.id,
        'aspects': publisherRaw.aspects['organization-details'] ? publisherRaw.aspects : defaultPublisher.aspects,
        error: error
    }
    return publisher
}
