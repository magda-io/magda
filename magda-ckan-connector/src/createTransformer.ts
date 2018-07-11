import AspectBuilder from "@magda/typescript-common/dist/AspectBuilder";
import CkanTransformer from "./CkanTransformer";
import CkanUrlBuilder from "./CkanUrlBuilder";
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
    return new CkanTransformer({
        sourceId: id,
        datasetAspectBuilders: datasetAspectBuilders,
        distributionAspectBuilders: distributionAspectBuilders,
        organizationAspectBuilders: organizationAspectBuilders,
        libraries: {
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
