import AspectBuilder from '@magda/typescript-common/dist/AspectBuilder';
import Ckan from './Ckan';
import CkanConnector from './CkanConnector';
import Registry from '@magda/typescript-common/dist/Registry';
import * as fs from 'fs';
import * as moment from 'moment';
import * as URI from 'urijs';
import * as yargs from 'yargs';

const argv = yargs
    .config()
    .help()
    .option('name', {
        describe: 'The name of this connector, to be displayed to users to indicate the source of datasets.',
        type: 'string',
        demandOption: true
    })
    .option('sourceUrl', {
        describe: 'The base URL of the CKAN server, without /api/...',
        type: 'string',
        demandOption: true
    })
    .option('pageSize', {
        describe: 'The number of datasets per page to request from the CKAN server.',
        type: 'number',
        default: 1000
    })
    .option('ignoreHarvestSources', {
        describe: 'An array of harvest sources to ignore.  Datasets from these harvest soures will not be added to the registry.',
        type: 'array',
        default: []
    })
    .option('registryUrl', {
        describe: 'The base URL of the registry to which to write data from CKAN.',
        type: 'string',
        default: 'http://localhost:6101/v0'
    })
    .argv;

const ckan = new Ckan({
    baseUrl: argv.sourceUrl,
    name: argv.name,
    pageSize: argv.pageSize
});

const registry = new Registry({
    baseUrl: argv.registryUrl
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
    ignoreHarvestSources: argv.ignoreHarvestSources,
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
