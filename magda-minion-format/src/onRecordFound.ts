import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import unionToThrowable from "@magda/typescript-common/dist/util/unionToThrowable";

import { FormatAspect } from "./formatAspectDef";

import getDcatMeasureResult from "./format-engine/measures/dcatFormatMeasure";
import getExtensionMeasureResult from "./format-engine/measures/downloadExtensionMeasure";
import getDownloadMeasureResult from "./format-engine/measures/downloadMeasure";

import getDcatProcessedData from "./format-engine/measures/processed-functions/dcatProcessedFns";
import getDownloadProcessedData from "./format-engine/measures/processed-functions/downloadProcessedFns";
import getExtensionProcessedData from "./format-engine/measures/processed-functions/extensionProcessedFns";

import getBestMeasureResult from "./format-engine/measureEvaluatorByHierarchy";
import MeasureEvaluationSet from "./format-engine/measures/MeasureEvaluationSet";
import MeasureEvalResult from "./format-engine/MeasureEvalResult";
const synonymObject = require("../synonyms.json");

export default async function onRecordFound(
    record: Record,
    registry: Registry
) {
    const retrievedEvalSets: MeasureEvaluationSet[] = getEvaluationSets(record);

    const bestFormatResult: MeasureEvalResult = getBestMeasureResult(
        retrievedEvalSets
    );

    await recordFormatAspect(registry, record, {
        format: bestFormatResult.format.format,
        confidenceLevel: bestFormatResult.absConfidenceLevel
    });
}

function getEvaluationSets(distribution: any) {
    const dcatSet: MeasureEvaluationSet = {
        measureResult: getDcatMeasureResult(distribution, synonymObject),
        getProcessedData: getDcatProcessedData
    };
    const extensionSet: MeasureEvaluationSet = {
        measureResult: getExtensionMeasureResult(distribution, synonymObject),
        getProcessedData: getExtensionProcessedData
    };
    const downloadSet: MeasureEvaluationSet = {
        measureResult: getDownloadMeasureResult(distribution, synonymObject),
        getProcessedData: getDownloadProcessedData
    };

    return [dcatSet, extensionSet, downloadSet];
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
