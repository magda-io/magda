import { AspectDefinition, AspectDefinitionsApi } from './generated/registry/api';
import { Observable } from 'rx';
import retry from './retry';
import Ckan from './Ckan';
import CkanConnector, { AspectBuilder } from './CkanConnector';
import Registry from './Registry';
import * as fs from 'fs';

const ckan = new Ckan({
    baseUrl: 'https://data.gov.au/',
    pageSize: 10
});

const registry = new Registry({
    baseUrl: 'http://localhost:6100/'
});

const aspectBuilders: AspectBuilder[] = [
    {
        aspectDefinition: {
            id: 'basic',
            name: 'Basic Information',
            jsonSchema: require('../../registry-aspects/basic.schema.json')
        },
        builderFunctionString: fs.readFileSync('aspect-templates/basic.js', 'utf8')
    },
    {
        aspectDefinition: {
            id: 'source',
            name: 'Source',
            jsonSchema: require('../../registry-aspects/source.schema.json')
        },
        builderFunctionString: fs.readFileSync('aspect-templates/source.js', 'utf8')
    }
];

const connector = new CkanConnector({
    ckan: ckan,
    registry: registry,
    aspectBuilders: aspectBuilders
});

connector.run();

//const registry = new Registry();
//ckan.packageSearch().forEach(dataset => { console.log(dataset.name); })

// const aspectDefinitions = [
//     {
//         id: 'basic',
//         name: 'Basic Information',
//         jsonSchema: require('../../registry-aspects/basic.schema.json')
//     },
//     {
//         id: 'source',
//         name: 'Source',
//         jsonSchema: require('../../registry-aspects/source.schema.json')
//     }
// ];

// function createAspectDefinitions(aspectDefinitions: AspectDefinition[]) {
//     const api = new AspectDefinitionsApi("http://localhost:6100/api/0.1");

//     const aspectDefinitionSource = Observable.from(aspectDefinitions).controlled();

//     const promise = aspectDefinitionSource.flatMap(aspectDefinition => {
//         return api.putById(aspectDefinition.id, aspectDefinition).then(result => {
//             aspectDefinitionSource.request(1);
//             return result;
//         }).catch(e => {
//             aspectDefinitionSource.request(1);
//             throw e;
//         });
//     }).toArray().toPromise();

//     // Create up to 6 aspect definitions at a time.
//     aspectDefinitionSource.request(6);

//     return promise;
// }

// retry(
//     () => createAspectDefinitions(aspectDefinitions),
//     2, 2,
//     (e, retriesLeft) => {
//         if (e.response && e.response.statusCode && e.body) {
//             console.log(`Failed to create aspect definition, ${retriesLeft} retries left.  Status code: ${e.response.statusCode}, body:\n${JSON.stringify(e.body, null, '  ')}`);
//         } else {
//             console.log(`Failed to create aspect definition, ${retriesLeft} retries left.  Exception:\n${e.toString()}`);
//         }        
//     }
// ).then(createdAspects => {
//     console.log(createdAspects);
// }).catch(e => {
//     console.log('Failed to create ' + JSON.stringify(e));
// })
