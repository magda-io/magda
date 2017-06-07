import AspectBuilder from '@magda/typescript-common/lib/AspectBuilder';
import Ckan from './Ckan';
import CkanConnector from './CkanConnector';
import Registry from '@magda/typescript-common/lib/Registry';
import * as fs from 'fs';
import * as moment from 'moment';
import * as URI from 'urijs';

const ckan = new Ckan({
    baseUrl: 'https://data.gov.au/',
    name: 'Data.gov.au',
    pageSize: 1000
});

const registry = new Registry({
    baseUrl: process.env.REGISTRY_URL || process.env.npm_package_config_registryUrl || 'http://localhost:6100/v0'
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
            id: 'dataset-publisher',
            name: 'Dataset Publisher',
            jsonSchema: require('@magda/registry-aspects/dataset-publisher.schema.json')
        },
        builderFunctionString: fs.readFileSync('aspect-templates/dataset-publisher.js', 'utf8')
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

const organizationAspectBuilders: AspectBuilder[] = [
    {
        aspectDefinition: {
            id: 'source',
            name: 'Source',
            jsonSchema: require('@magda/registry-aspects/source.schema.json')
        },
        builderFunctionString: fs.readFileSync('aspect-templates/organization-source.js', 'utf8')
    },
    {
        aspectDefinition: {
            id: 'organization-details',
            name: 'Organization',
            jsonSchema: require('@magda/registry-aspects/organization-details.schema.json')
        },
        builderFunctionString: fs.readFileSync('aspect-templates/organization-details.js', 'utf8')
    }
];

const connector = new CkanConnector({
    source: ckan,
    registry: registry,
    datasetAspectBuilders: datasetAspectBuilders,
    distributionAspectBuilders: distributionAspectBuilders,
    organizationAspectBuilders: organizationAspectBuilders,
    libraries: {
        moment: moment,
        URI: URI
    },
});

connector.run().then(result => {
    console.log(result.summarize());
});
