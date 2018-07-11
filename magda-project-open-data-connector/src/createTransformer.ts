import AspectBuilder from "@magda/typescript-common/dist/AspectBuilder";
import ProjectOpenDataTransformer from "./ProjectOpenDataTransformer";
import * as moment from "moment";
import * as URI from "urijs";

export interface CreateTransformerOptions {
    id: string;
    name: string;
    sourceUrl: string;
    datasetAspectBuilders: AspectBuilder[];
    distributionAspectBuilders: AspectBuilder[];
    organizationAspectBuilders: AspectBuilder[];
}

export default function createTransformer({
    id,
    name,
    sourceUrl,
    datasetAspectBuilders,
    distributionAspectBuilders,
    organizationAspectBuilders
}: CreateTransformerOptions) {
    return new ProjectOpenDataTransformer({
        sourceId: id,
        datasetAspectBuilders: datasetAspectBuilders,
        distributionAspectBuilders: distributionAspectBuilders,
        organizationAspectBuilders: organizationAspectBuilders,
        libraries: {
            moment: moment,
            URI: URI,
            projectOpenData: Object.freeze({
                id: id,
                name: name,
                url: sourceUrl
            })
        }
    });
}
