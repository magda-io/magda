import AspectBuilder from "magda-typescript-common/src/AspectBuilder";
import cleanOrgTitle from "magda-typescript-common/src/util/cleanOrgTitle";
import CkanTransformer from "./CkanTransformer";
import CkanUrlBuilder from "./CkanUrlBuilder";
import moment from "moment";
import URI from "urijs";

export interface CreateTransformerOptions {
    name: string;
    id: string;
    sourceUrl: string;
    datasetAspectBuilders: AspectBuilder[];
    distributionAspectBuilders: AspectBuilder[];
    organizationAspectBuilders: AspectBuilder[];
    tenantId: number;
}

export default function createTransformer({
    name,
    id,
    sourceUrl,
    datasetAspectBuilders,
    distributionAspectBuilders,
    organizationAspectBuilders,
    tenantId
}: CreateTransformerOptions) {
    return new CkanTransformer({
        sourceId: id,
        datasetAspectBuilders: datasetAspectBuilders,
        distributionAspectBuilders: distributionAspectBuilders,
        organizationAspectBuilders: organizationAspectBuilders,
        tenantId: tenantId,
        libraries: {
            cleanOrgTitle: cleanOrgTitle,
            moment: moment,
            URI: URI,
            ckan: new CkanUrlBuilder({
                id: id,
                name: name,
                baseUrl: sourceUrl
            })
        }
    });
}
