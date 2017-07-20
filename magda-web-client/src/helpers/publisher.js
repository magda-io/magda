// @flow


export type Publisher ={
  name: string,
  description: string,
  id: string,
  image_url: string,
  error: ?string
}


type PublisherRaw = {
    name: string,
    id: string,
    message? : ?string,
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
    let error = null;
    if(publisherRaw && !publisherRaw.id){
      error = publisherRaw.message || 'an error occurred';
    }
    const publisher = {
        name: publisherRaw.name,
        description: publisherRaw.aspects['organization-details']['description'] || 'A description of this publisher is not available',
        image_url: publisherRaw.aspects['organization-details']['imageUrl'] || 'http://placehold.it/100x100?text=Image+unavailable',
        id: publisherRaw.id,
        error: error
    }
    return publisher
}
