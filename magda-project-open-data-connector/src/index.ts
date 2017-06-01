import ProjectOpenDataConnector from './ProjectOpenDataConnector';
import Registry from '@magda/typescript-common/lib/Registry';
import * as moment from 'moment';
import * as URI from 'urijs';
import organizationAspectBuilders from './organizationAspectBuilders';
import datasetAspectBuilders from './datasetAspectBuilders';
import distributionAspectBuilders from './distributionAspectBuilders';

const registry = new Registry({
    baseUrl: process.env.REGISTRY_URL || process.env.npm_package_config_registryUrl || 'http://localhost:6100/v0'
});

const connector = new ProjectOpenDataConnector({
    name: 'Logan City Council',
    url: 'http://data-logancity.opendata.arcgis.com/data.json',
    // name: 'US Department of Energy',
    // url: 'https://www.energy.gov/sites/prod/files/2017/05/f34/doe-pdl-5-19-2017.json',
    source: null,
    registry: registry,
    libraries: {
        moment: moment,
        URI: URI
    },
    organizationAspectBuilders: organizationAspectBuilders,
    datasetAspectBuilders: datasetAspectBuilders,
    distributionAspectBuilders: distributionAspectBuilders
});

connector.run().then(result => {
    console.log(result.summarize());
});
