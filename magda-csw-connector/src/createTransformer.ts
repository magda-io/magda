import AspectBuilder from "@magda/typescript-common/dist/AspectBuilder";
import cleanOrgTitle from "@magda/typescript-common/dist/util/cleanOrgTitle";
import CswTransformer from "./CswTransformer";
import CswUrlBuilder from "./CswUrlBuilder";
import * as moment from "moment";
import * as URI from "urijs";
import * as lodash from "lodash";
import * as jsonpath from "jsonpath";
import cswFuncs from "./cswFuncs";

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
    return new CswTransformer({
        sourceId: id,
        datasetAspectBuilders: datasetAspectBuilders,
        distributionAspectBuilders: distributionAspectBuilders,
        organizationAspectBuilders: organizationAspectBuilders,
        libraries: {
            moment: moment,
            cleanOrgTitle: cleanOrgTitle,
            URI: URI,
            lodash: lodash,
            jsonpath: jsonpath,
            csw: new CswUrlBuilder({
                id: id,
                name: name,
                baseUrl: sourceUrl
            }),
            cswFuncs
        }
    });
}
