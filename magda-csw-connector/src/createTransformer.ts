import AspectBuilder from '@magda/typescript-common/dist/AspectBuilder';
import CswTransformer from './CswTransformer';
import CswUrlBuilder from './CswUrlBuilder';
import * as moment from 'moment';
import * as URI from 'urijs';
import * as lodash from 'lodash';
import * as jsonpath from 'jsonpath';

export interface CreateTransformerOptions {
    name: string,
    sourceUrl: string,
    datasetAspectBuilders: AspectBuilder[],
    distributionAspectBuilders: AspectBuilder[],
    organizationAspectBuilders: AspectBuilder[],
}

export default function createTransformer({
    name,
    sourceUrl,
    datasetAspectBuilders,
    distributionAspectBuilders,
    organizationAspectBuilders,
}: CreateTransformerOptions) {
    return new CswTransformer({
        datasetAspectBuilders: datasetAspectBuilders,
        distributionAspectBuilders: distributionAspectBuilders,
        organizationAspectBuilders: organizationAspectBuilders,
        libraries: {
            moment: moment,
            URI: URI,
            lodash: lodash,
            jsonpath: jsonpath,
            csw: new CswUrlBuilder({
                name: name,
                baseUrl: sourceUrl,
                retrievedAt: -1 // not sure when createTransformer will be called, so putting this here
            })
        }
    });
}
