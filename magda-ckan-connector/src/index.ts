import AspectBuilder from '@magda/typescript-common/dist/AspectBuilder';
import Ckan from './Ckan';
import createTransformer from './createTransformer';
import JsonConnector from '@magda/typescript-common/dist/JsonConnector';
import Registry from '@magda/typescript-common/dist/Registry';
import * as express from 'express';
import * as fs from 'fs';
import * as request from 'request';
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
    .option('interactive', {
        describe: 'Run the connector in an interactive mode with a REST API, instead of running a batch connection job.',
        type: 'boolean',
        default: false
    })
    .option('listenPort', {
        describe: 'The port on which to run the REST API when in interactive model.',
        type: 'number',
        default: 6112
    })
    .argv;

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

//fs.writeFileSync('datasetAspectBuilders.json', JSON.stringify(datasetAspectBuilders, undefined, '  '), 'utf8');

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

const ckan = new Ckan({
    baseUrl: argv.sourceUrl,
    name: argv.name,
    pageSize: argv.pageSize,
    ignoreHarvestSources: argv.ignoreHarvestSources,
});

const registry = new Registry({
    baseUrl: argv.registryUrl
});

const transformerOptions = {
    name: argv.name,
    sourceUrl: argv.sourceUrl,
    pageSize: argv.pageSize,
    ignoreHarvestSources: argv.ignoreHarvestSources,
    registryUrl: argv.registryUrl,
    datasetAspectBuilders,
    distributionAspectBuilders,
    organizationAspectBuilders
};

const transformer = createTransformer(transformerOptions);

const connector = new JsonConnector({
    source: ckan,
    transformer: transformer,
    registry: registry,
});

if (!argv.interactive) {
    connector.run().then(result => {
        console.log(result.summarize());
    });
} else {
    var app = express();
    app.use(require("body-parser").json());

    app.get('/v0/config', (req, res) => {
        res.send(transformerOptions);
    });

    app.get('/v0/dataset', (req, res) => {
        const packageShowUrl = ckan.urlBuilder.getPackageShowUrl(req.query.id);
        request.get(packageShowUrl, (error, response, body) => {
            const json = JSON.parse(body);
            res.send(json.result);
        });
    });

    app.use('/v0/test-harness.js', express.static('dist/createTransformerForBrowser.js'));
    app.use('/v0/example.html', express.static('example.html'));

    app.listen(argv.listenPort);
}
