//import * as _ from "lodash";

import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import { FormatAspect } from "./formatAspectDef";
import unionToThrowable from "@magda/typescript-common/src/util/unionToThrowable";

import getDcatMeasureResult from "./format-engine/measures/dcatFormatMeasure";
import getExtensionMeasureResult from "./format-engine/measures/downloadExtensionMeasure";
import getDownloadMeasureResult from "./format-engine/measures/downloadMeasure";

import getDcatProcessedData from "./format-engine/measures/processed-functions/dcatProcessedFns";
import getDownloadProcessedData from "./format-engine/measures/processed-functions/dcatProcessedFns";
import getExtensionProcessedData from "./format-engine/measures/processed-functions/extensionProcessedFns";

import  getBestMeasureResult  from "./format-engine/MeasureEvaluator"
import MeasureEvaluationSet from "src/format-engine/measures/MeasureEvaluationSet";
import MeasureEvalResult from "src/format-engine/MeasureEvalResult";

//import { Snapshot } from "../../magda-typescript-common/src/format/MeasureSnapShot";

export default async function onRecordFound(
    record: Record,
    registry: Registry
) {
    const distributions: Record[] =
        record.aspects["dataset-distributions"] &&
        record.aspects["dataset-distributions"].distributions;

    if (!distributions || distributions.length === 0) {
        return Promise.resolve();
    }

    // 2D array: 1 row per distribution
    const retrievedEvalSets: MeasureEvaluationSet[][] = distributions.map(function (distribution) {
        const dcatSet: MeasureEvaluationSet = {
            measureResult: getDcatMeasureResult(distribution),
            getProcessedData: getDcatProcessedData
        }
        const extensionSet: MeasureEvaluationSet = {
            measureResult: getExtensionMeasureResult(distribution),
            getProcessedData: getExtensionProcessedData
        }
        const downloadSet: MeasureEvaluationSet = {
            measureResult: getDownloadMeasureResult(distribution),
            getProcessedData: getDownloadProcessedData
        }

        return [dcatSet, extensionSet, downloadSet];

    });

    const bestFormatResults: MeasureEvalResult[] = retrievedEvalSets.map(evalSetsPerDist =>
        getBestMeasureResult(evalSetsPerDist)
    );

    bestFormatResults.forEach(function(formatResult) {
        recordFormatAspect(
            registry,
            formatResult.distribution,
            {
                format: formatResult.format.format,
                confidenceLevel: formatResult.absConfidenceLevel
            }
        )
    });
}

function recordFormatAspect(
    registry: Registry,
    distribution: Record,
    aspect: FormatAspect
): Promise<Record> {
    return registry
        .putRecordAspect(distribution.id, "dataset-format", aspect)
        .then(unionToThrowable);
}


