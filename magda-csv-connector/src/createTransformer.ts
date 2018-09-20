import AspectBuilder from "@magda/typescript-common/dist/AspectBuilder";
import cleanOrgTitle from "@magda/typescript-common/dist/util/cleanOrgTitle";
import CsvTransformer from "./CsvTransformer";

import * as fuzzy from "./fuzzyMatch";
import * as dates from "./dates";

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
    return new CsvTransformer({
        sourceId: id,
        datasetAspectBuilders: datasetAspectBuilders,
        distributionAspectBuilders: distributionAspectBuilders,
        organizationAspectBuilders: organizationAspectBuilders,
        libraries: {
            // moment: moment,
            cleanOrgTitle: cleanOrgTitle,
            // URI: URI,
            // lodash: lodash,
            // jsonpath: jsonpath,
            csv: {
                id: id,
                name: name,
                sourceUrl: sourceUrl
            },
            fuzzy,
            dates
        }
    });
}
