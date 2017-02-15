import { AspectDefinition, AspectDefinitionsApi } from '../generated/registry/api'
import { Observable } from 'rx'
import retry from './retry'

const aspectDefinitions = [
    {
        id: 'basic',
        name: 'Basic Information',
        jsonSchema: require('../../../registry-aspects/basic.schema.json')
    },
    {
        id: 'source',
        name: 'Source',
        jsonSchema: require('../../../registry-aspects/source.schema.json')
    }
];

function createAspectDefinitions(aspectDefinitions: AspectDefinition[]) {
    const api = new AspectDefinitionsApi();

    const aspectDefinitionSource = Observable.from(aspectDefinitions).controlled();

    const promise = aspectDefinitionSource.flatMap(aspectDefinition => {
        return api.putById({
            id: aspectDefinition.id,
            aspect: aspectDefinition
        }).then(result => {
            aspectDefinitionSource.request(1);
            return result;
        }).catch(e => {
            aspectDefinitionSource.request(1);
            if (!e.json) {
                throw e;
            } else {
                const throwPromise: Promise<AspectDefinition> = e.json().catch(jsonError => {
                    // If we can't get JSON from the response, rethrow the original error.
                    throw e;
                }).then(json => {
                    // The JSON is our actual error.
                    throw json;
                });
                return throwPromise;
            }
        });
    }).toArray().toPromise();

    // Create up to 6 aspect definitions at a time.
    aspectDefinitionSource.request(6);

    return promise;
}

retry(
    () => createAspectDefinitions(aspectDefinitions),
    2, 2,
    (e, retriesLeft) => console.log(`Failed to create aspect definition, ${retriesLeft} retries left.  Error was:\n${JSON.stringify(e)}`)
).then(createdAspects => {
    console.log(createdAspects);
}).catch(e => {
    console.log('Failed to create ' + JSON.stringify(e));
})
