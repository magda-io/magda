import * as _ from "lodash";

import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import { RecordLayer } from "@magda/typescript-common/src/registry-manual/api";
import summarizeAspectDef, {
    SummarizeAspect,
    RetrieveResult
} from "./summarizeAspectDef";
import VALID_FORMATS from "./validFormats"
//created a separate summary API.js file because make a .d.ts will be much easier with 1 file instead of a whole node-summary repo.
import {getSummaryFromURL} from "./summaryAPI"
import unionToThrowable from "@magda/typescript-common/src/util/unionToThrowable";
/*declare function getSummaryFromContent(title: string, content: string): {
    err: any,
    summary: string
}*/

export default async function onRecordFound(
    record: Record,
    registry: Registry,
) {
    const distributions: Record[] =
        record.aspects["dataset-distributions"] &&
        record.aspects["dataset-distributions"].distributions;

    if (!distributions || distributions.length === 0) {
        return Promise.resolve();
    }


    
}