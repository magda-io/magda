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
            id: 'ckan-dataset',
            name: 'CKAN Dataset',
            jsonSchema: require('../../registry-aspects/ckan-dataset.schema.json')
        },
        builderFunctionString: fs.readFileSync('aspect-templates/ckan-dataset.js', 'utf8')
    },
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

connector.run().then(result => {
    console.log('Datasets Connected: ' + result.datasetsConnected);

    if (result.errors.length > 0) {
        console.log('Errors: ' + result.errors);
    }
});
