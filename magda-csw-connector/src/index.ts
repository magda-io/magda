import Csw from './Csw';
import CswConnector from './CswConnector';
import { forEachAsync } from '@magda/typescript-common/lib/AsyncPage';
import Registry from '@magda/typescript-common/lib/Registry';
import * as moment from 'moment';
import * as URI from 'urijs';
import * as lodash from 'lodash';
import * as jsonpath from 'jsonpath';
import datasetAspectBuilders from './datasetAspectBuilders';
import distributionAspectBuilders from './distributionAspectBuilders';
import organizationAspectBuilders from './organizationAspectBuilders';
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
        describe: 'The base URL of the CSW server, including /csw if present, but not including any query parameters.',
        type: 'string',
        demandOption: true
    })
    .option('pageSize', {
        describe: 'The number of datasets per page to request from the CSW server.',
        type: 'number',
        default: 1000
    })
    .option('registryUrl', {
        describe: 'The base URL of the registry to which to write data from CSW.',
        type: 'string',
        default: 'http://localhost:6100/v0'
    })
    .argv;

const csw = new Csw({
    baseUrl: argv.sourceUrl,
    name: argv.name,
    pageSize: argv.pageSize
});

const registry = new Registry({
    baseUrl: argv.registryUrl
});

const connector = new CswConnector({
    source: csw,
    registry: registry,
    datasetAspectBuilders: datasetAspectBuilders,
    distributionAspectBuilders: distributionAspectBuilders,
    organizationAspectBuilders: organizationAspectBuilders,
    libraries: {
        moment: moment,
        URI: URI,
        lodash: lodash,
        jsonpath: jsonpath
    }
});

connector.run().then(result => {
    console.log(result.summarize());
});
