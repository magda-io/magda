import AspectBuilder from "@magda/typescript-common/dist/AspectBuilder";
import cleanOrgTitle from "@magda/typescript-common/dist/util/cleanOrgTitle";
import EsriPortalTransformer from "./EsriPortalTransformer";
import EsriPortalUrlBuilder from "./EsriPortalUrlBuilder";
import * as moment from "moment";
import * as URI from "urijs";

export interface CreateTransformerOptions {
    name: string;
    id: string;
    sourceUrl: string;
    datasetAspectBuilders: AspectBuilder[];
    distributionAspectBuilders: AspectBuilder[];
    organizationAspectBuilders: AspectBuilder[];
}

export default function createTransformer({
    name,
    id,
    sourceUrl,
    datasetAspectBuilders,
    distributionAspectBuilders,
    organizationAspectBuilders
}: CreateTransformerOptions) {
    return new EsriPortalTransformer({
        sourceId: id,
        datasetAspectBuilders: datasetAspectBuilders,
        distributionAspectBuilders: distributionAspectBuilders,
        organizationAspectBuilders: organizationAspectBuilders,
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
