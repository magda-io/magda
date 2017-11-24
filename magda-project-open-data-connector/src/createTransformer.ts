import AspectBuilder from '@magda/typescript-common/dist/AspectBuilder';
import ProjectOpenDataTransformer from './ProjectOpenDataTransformer';
import * as moment from 'moment';
import * as URI from 'urijs';

export interface CreateTransformerOptions {
    name: string,
    sourceUrl: string,
    datasetAspectBuilders: AspectBuilder[],
    distributionAspectBuilders: AspectBuilder[],
    organizationAspectBuilders: AspectBuilder[]
}

export default function createTransformer({
    name,
    sourceUrl,
    datasetAspectBuilders,
    distributionAspectBuilders,
    organizationAspectBuilders
}: CreateTransformerOptions) {
    return new ProjectOpenDataTransformer({
        datasetAspectBuilders: datasetAspectBuilders,
        distributionAspectBuilders: distributionAspectBuilders,
        organizationAspectBuilders: organizationAspectBuilders,
        libraries: {
            moment: moment,
            URI: URI,
            projectOpenData: Object.freeze({
                name: name,
                url: sourceUrl
            })
        }
    });
}
