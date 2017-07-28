import Registry from '@magda/typescript-common/dist/Registry';
import VisualisationSleuther from './VisualisationSleuther';

const registry = new Registry({
    baseUrl: process.env.REGISTRY_URL || process.env.npm_package_config_registryUrl || 'http://localhost:6100/v0'
});

const sleuther = new VisualisationSleuther({
    registry
});

sleuther.run().then(result => {
    console.log(`Distributions checked: ${result.checkedDistributions}`);
    console.log(`Number of CSVs: ${result.csvs}`);
    console.log(`Number of timeserives CSVs: ${result.timeseries}`);
});
