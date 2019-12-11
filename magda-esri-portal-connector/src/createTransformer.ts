import AspectBuilder from "magda-typescript-common/src/AspectBuilder";
import cleanOrgTitle from "magda-typescript-common/src/util/cleanOrgTitle";
import EsriPortalTransformer from "./EsriPortalTransformer";
import EsriPortalUrlBuilder from "./EsriPortalUrlBuilder";
import moment from "moment";
import URI from "urijs";

export interface CreateTransformerOptions {
    name: string;
    id: string;
    sourceUrl: string;
    datasetAspectBuilders: AspectBuilder[];
    distributionAspectBuilders: AspectBuilder[];
    organizationAspectBuilders: AspectBuilder[];
    groupAspectBuilders: AspectBuilder[];
}

export default function createTransformer({
    name,
    id,
    sourceUrl,
    datasetAspectBuilders,
    distributionAspectBuilders,
    organizationAspectBuilders,
    groupAspectBuilders
}: CreateTransformerOptions) {
    return new EsriPortalTransformer({
        sourceId: id,
        datasetAspectBuilders: datasetAspectBuilders,
        distributionAspectBuilders: distributionAspectBuilders,
        organizationAspectBuilders: organizationAspectBuilders,
        groupAspectBuilders: groupAspectBuilders,
        tenantId: 0,
        libraries: {
            cleanOrgTitle: cleanOrgTitle,
            moment: moment,
            URI: URI,
            esriPortal: new EsriPortalUrlBuilder({
                id: id,
                name: name,
                baseUrl: sourceUrl
            })
        }
    });
}
