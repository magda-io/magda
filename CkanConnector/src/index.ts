import { AspectDefinition, AspectDefinitionsApi } from './generated/registry/api'
import { Observable } from 'rx'
import retry from './retry'

const aspectDefinitions = [
    {
        id: 'basic',
        name: 'Basic Information',
        jsonSchema: require('../../registry-aspects/basic.schema.json')
    },
    {
        id: 'source',
        name: 'Source',
        jsonSchema: require('../../registry-aspects/source.schema.json')
    }
];

function createAspectDefinitions(aspectDefinitions: AspectDefinition[]) {
    const api = new AspectDefinitionsApi("http://localhost:6100/api/0.1");

    const aspectDefinitionSource = Observable.from(aspectDefinitions).controlled();

    const promise = aspectDefinitionSource.flatMap(aspectDefinition => {
        return api.putById(aspectDefinition.id, aspectDefinition).then(result => {
            aspectDefinitionSource.request(1);
            return result;
        }).catch(e => {
            aspectDefinitionSource.request(1);
            throw e;
        });
    }).toArray().toPromise();

    // Create up to 6 aspect definitions at a time.
    aspectDefinitionSource.request(6);

    return promise;
}

retry(
    () => createAspectDefinitions(aspectDefinitions),
    2, 2,
    (e, retriesLeft) => {
        if (e.response && e.response.statusCode && e.body) {
            console.log(`Failed to create aspect definition, ${retriesLeft} retries left.  Status code: ${e.response.statusCode}, body:\n${JSON.stringify(e.body, null, '  ')}`);
        } else {
            console.log(`Failed to create aspect definition, ${retriesLeft} retries left.  Exception:\n${e.toString()}`);
        }        
    }
).then(createdAspects => {
    console.log(createdAspects);
}).catch(e => {
    console.log('Failed to create ' + JSON.stringify(e));
})
