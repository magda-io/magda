import AspectBuilder from "@magda/typescript-common/dist/AspectBuilder";
import cleanOrgTitle from "@magda/typescript-common/dist/util/cleanOrgTitle";
import ProjectOpenDataTransformer from "./ProjectOpenDataTransformer";
import * as moment from "moment";
import * as URI from "urijs";
import * as jsonpath from "jsonpath";
import * as lodash from "lodash";

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
            cleanOrgTitle: cleanOrgTitle,
            URI: URI,
            jsonpath,
            lodash,
            projectOpenData: Object.freeze({
                id: id,
                name: name,
                url: sourceUrl
            })
        }
    });
}
