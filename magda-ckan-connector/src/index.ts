import { AspectDefinition, AspectDefinitionsApi } from './generated/registry/api';
import retry from './retry';
import Ckan from './Ckan';
import CkanConnector, { AspectBuilder } from './CkanConnector';
import Registry from './Registry';
import * as fs from 'fs';
import * as request from 'request';
import formatServiceError from './formatServiceError';
import * as URI from 'urijs';
import * as moment from 'moment';

const ckan = new Ckan({
    baseUrl: 'https://data.gov.au/',
    pageSize: 1000,
    name: "Data.gov.au"
});

const registry = new Registry({
    baseUrl: process.env.REGISTRY_URL || 'http://localhost:6100/v0/'
});

const datasetAspectBuilders: AspectBuilder[] = [
    {
        aspectDefinition: {
            id: 'ckan-dataset',
            name: 'CKAN Dataset',
            jsonSchema: require('@magda/registry-aspects/ckan-dataset.schema.json')
        },
        builderFunctionString: fs.readFileSync('aspect-templates/ckan-dataset.js', 'utf8')
    },
    {
        aspectDefinition: {
            id: 'dcat-dataset-strings',
            name: 'DCAT Dataset properties as strings',
            jsonSchema: require('@magda/registry-aspects/dcat-dataset-strings.schema.json')
        },
        builderFunctionString: fs.readFileSync('aspect-templates/dcat-dataset-strings.js', 'utf8')
    },
    {
        aspectDefinition: {
            id: 'source',
            name: 'Source',
            jsonSchema: require('@magda/registry-aspects/source.schema.json')
        },
        builderFunctionString: fs.readFileSync('aspect-templates/dataset-source.js', 'utf8')
    },
    {
        aspectDefinition: {
            id: 'temporal-coverage',
            name: 'Temporal Coverage',
            jsonSchema: require('@magda/registry-aspects/temporal-coverage.schema.json')
        },
        setupFunctionString: fs.readFileSync('aspect-templates/temporal-coverage-setup.js', 'utf8'),
        builderFunctionString: fs.readFileSync('aspect-templates/temporal-coverage.js', 'utf8')
    },
    {
        aspectDefinition: {
            id: 'dataset-distributions',
            name: 'Dataset Distributions',
            jsonSchema: require('@magda/registry-aspects/dataset-distributions.schema.json')
        },
        builderFunctionString: fs.readFileSync('aspect-templates/dataset-distributions.js', 'utf8')
    }
];

const distributionAspectBuilders: AspectBuilder[] = [
    {
        aspectDefinition: {
            id: 'ckan-resource',
            name: 'CKAN Resource',
            jsonSchema: require('@magda/registry-aspects/ckan-resource.schema.json')
        },
        builderFunctionString: fs.readFileSync('aspect-templates/ckan-resource.js', 'utf8')
    },
    {
        aspectDefinition: {
            id: 'dcat-distribution-strings',
            name: 'DCAT Distribution properties as strings',
            jsonSchema: require('@magda/registry-aspects/dcat-distribution-strings.schema.json')
        },
        builderFunctionString: fs.readFileSync('aspect-templates/dcat-distribution-strings.js', 'utf8')
    },
    {
        aspectDefinition: {
            id: 'source',
            name: 'Source',
            jsonSchema: require('@magda/registry-aspects/source.schema.json')
        },
        builderFunctionString: fs.readFileSync('aspect-templates/distribution-source.js', 'utf8')
    }
];

const connector = new CkanConnector({
    ckan: ckan,
    registry: registry,
    datasetAspectBuilders: datasetAspectBuilders,
    distributionAspectBuilders: distributionAspectBuilders
});

connector.run().then(result => {
    console.log('Aspect Definitions Connected: ' + result.aspectDefinitionsConnected);
    console.log('Datasets Connected: ' + result.datasetsConnected);
    console.log('Distributions Connected: ' + result.distributionsConnected);

    if (result.errors.length > 0) {
        console.log('Errors:\n' + JSON.stringify(result.errors, undefined, '  '));
    }
});
