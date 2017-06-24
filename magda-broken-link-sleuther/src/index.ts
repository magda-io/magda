import Registry from '@magda/typescript-common/dist/Registry';
import BrokenLinkSleuther from './BrokenLinkSleuther';

const registry = new Registry({
    baseUrl: process.env.REGISTRY_URL || process.env.npm_package_config_registryUrl || 'http://localhost:6100/v0'
});

const sleuther = new BrokenLinkSleuther({
    registry
});

sleuther.run().then(result => {
    console.log(`Distributions checked: ${result.checkedDistributions}`);
    console.log(`429 responses: ${result.tooManyRequests}`);
    console.log(`Broken links found: ${result.brokenLinks}`);
});
