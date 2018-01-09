import * as _ from "lodash";

import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import { RecordLayer } from "@magda/typescript-common/src/registry-manual/api";
import formatAspectDef, {
    FormatAspect
} from "./formatAspectDef";
import unionToThrowable from "@magda/typescript-common/src/util/unionToThrowable";
import {
    FormatSortedRecords,
    sortRecordsByFormat
} from "@magda/typescript-common/src/util/formatUtils/formatClassifier"

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