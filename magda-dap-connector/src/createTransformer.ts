import AspectBuilder from "magda-typescript-common/src/AspectBuilder";
import DapTransformer from "./DapTransformer";
import DapUrlBuilder from "./DapUrlBuilder";
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
    return new DapTransformer({
        sourceId: id,
        datasetAspectBuilders: datasetAspectBuilders,
        distributionAspectBuilders: distributionAspectBuilders,
        organizationAspectBuilders: organizationAspectBuilders,
        tenantId: tenantId,
        libraries: {
            moment: moment,
            URI: URI,
            dap: new DapUrlBuilder({
                id: id,
                name: name,
                baseUrl: sourceUrl
            })
        }
    });
}
