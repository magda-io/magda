import Csw from './Csw';
import CswConnector from './CswConnector';
import { forEachAsync } from '@magda/typescript-common/lib/AsyncPage';
import Registry from '@magda/typescript-common/lib/Registry';
import * as moment from 'moment';
import * as URI from 'urijs';
import * as lodash from 'lodash';
import * as jsonpath from 'jsonpath';
import datasetAspectBuilders from './datasetAspectBuilders';

const csw = new Csw({
    baseUrl: 'http://www.bom.gov.au/geonetwork/srv/eng/csw',
    name: 'Australian Bureau of Meteorology'
});

const registry = new Registry({
    baseUrl: process.env.REGISTRY_URL || process.env.npm_package_config_registryUrl || 'http://localhost:6100/v0'
});

const connector = new CswConnector({
    source: csw,
    registry: registry,
    datasetAspectBuilders: datasetAspectBuilders,
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
