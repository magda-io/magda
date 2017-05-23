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
    console.log('Aspect Definitions Connected: ' + result.aspectDefinitionsConnected);
    console.log('Datasets Connected: ' + result.datasetsConnected);
    console.log('Distributions Connected: ' + result.distributionsConnected);
    console.log('Organizations Connected: ' + result.organizationsConnected);

    if (result.aspectDefinitionFailures.length > 0) {
        console.log('Aspect Definition Failures:\n' + JSON.stringify(result.aspectDefinitionFailures, undefined, '  '));
    }
    if (result.organizationFailures.length > 0) {
        console.log('Organization Failures:\n' + JSON.stringify(result.organizationFailures, undefined, '  '));
    }
    if (result.datasetFailures.length > 0) {
        console.log('Dataset Failures:\n' + JSON.stringify(result.datasetFailures, undefined, '  '));
    }
    if (result.distributionFailures.length > 0) {
        console.log('Distribution Failures:\n' + JSON.stringify(result.distributionFailures, undefined, '  '));
    }
});
