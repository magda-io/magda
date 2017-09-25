import AspectBuilder from '@magda/typescript-common/dist/AspectBuilder';
import Ckan from './Ckan';
import CkanConnector from './CkanConnector';
import Registry from '@magda/typescript-common/dist/Registry';
import * as moment from 'moment';
import * as URI from 'urijs';

export interface CreateConnectorOptions {
    name: string,
    sourceUrl: string,
    pageSize?: number,
    ignoreHarvestSources?: string[],
    registryUrl?: string,
    datasetAspectBuilders: AspectBuilder[],
    distributionAspectBuilders: AspectBuilder[],
    organizationAspectBuilders: AspectBuilder[]
}

export default function createConnector({
    name,
    sourceUrl,
    pageSize = 1000,
    ignoreHarvestSources = [],
    registryUrl = 'http://localhost:6101/v0',
    datasetAspectBuilders,
    distributionAspectBuilders,
    organizationAspectBuilders
}: CreateConnectorOptions) {
    const ckan = new Ckan({
        baseUrl: sourceUrl,
        name: name,
        pageSize: pageSize
    });

    const registry = new Registry({
        baseUrl: registryUrl
    });

    return new CkanConnector({
        source: ckan,
        registry: registry,
        ignoreHarvestSources: ignoreHarvestSources,
        datasetAspectBuilders: datasetAspectBuilders,
        distributionAspectBuilders: distributionAspectBuilders,
        organizationAspectBuilders: organizationAspectBuilders,
        libraries: {
            moment: moment,
            URI: URI
        },
    });
}
