//import * as _ from "lodash";

import Registry from "../../magda-typescript-common/dist/registry/AuthorizedRegistryClient";
import { Record } from "../../magda-typescript-common/dist/generated/registry/api";
import { FormatAspect } from "./formatAspectDef";
import unionToThrowable from "../../magda-typescript-common/dist/util/unionToThrowable"

import getDcatMeasureResult from "./format-engine/measures/dcatFormatMeasure";
import getExtensionMeasureResult from "./format-engine/measures/downloadExtensionMeasure";
import getDownloadMeasureResult from "./format-engine/measures/downloadMeasure";

import getDcatProcessedData from "./format-engine/measures/processed-functions/dcatProcessedFns";
import getDownloadProcessedData from "./format-engine/measures/processed-functions/downloadProcessedFns";
import getExtensionProcessedData from "./format-engine/measures/processed-functions/extensionProcessedFns";

import  getBestMeasureResult  from "./format-engine/measureEvaluatorByHierarchy"
import MeasureEvaluationSet from "./format-engine/measures/MeasureEvaluationSet";
import MeasureEvalResult from "./format-engine/MeasureEvalResult";
let synonymObject = require("./format-engine/synonyms.json");

//import { Snapshot } from "../../magda-typescript-common/src/format/MeasureSnapShot";
export let mochaObject = {
    isRunning: true // set to false if not testing this function onRecordFound
}

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

    //TODO delete this piece of code
    console.log("gott after distribution nul check");

    // 2D array: 1 row per distribution
    const retrievedEvalSets: MeasureEvaluationSet[][] = distributions.map(function (distribution) {
        const dcatSet: MeasureEvaluationSet = {
            measureResult: getDcatMeasureResult(distribution, synonymObject),
            getProcessedData: getDcatProcessedData
        }
        const extensionSet: MeasureEvaluationSet = {
            measureResult: getExtensionMeasureResult(distribution, synonymObject),
            getProcessedData: getExtensionProcessedData
        }
        const downloadSet: MeasureEvaluationSet = {
            measureResult: getDownloadMeasureResult(distribution, synonymObject),
            getProcessedData: getDownloadProcessedData
        }

        //TODO delete this
        console.log("the list recieved is: " + [dcatSet, extensionSet, downloadSet].toString() + "for the distribution: " + distribution.id)


        return [dcatSet, extensionSet, downloadSet];

    });

    const bestFormatResults: MeasureEvalResult[] = retrievedEvalSets.map(evalSetsPerDist =>
        getBestMeasureResult(evalSetsPerDist)
    );

    //TODO delete
    console.log("best results obtained" + bestFormatResults.toString());

    bestFormatResults.forEach(function(formatResult) {
        !mochaObject.isRunning ?
        recordFormatAspect(
            registry,
            formatResult.distribution,
            {
                format: formatResult.format.format,
                confidenceLevel: formatResult.absConfidenceLevel
            }
        ) : recordFormatAspectTest(
            registry,
            formatResult.distribution,
            {
                format: formatResult.format.format,
                confidenceLevel: formatResult.absConfidenceLevel
            }
        )
    });

    //TODO delete this piece of code
    console.log("the best results gathered were: " + bestFormatResults.toString());

    return Promise.resolve();
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

function recordFormatAspectTest(
    registry: Registry,
    distribution: Record,
    aspect: FormatAspect
): Promise<Record> {
    console.log(distribution.id + ": aspect is " + aspect.confidenceLevel.toString() + aspect.format.toString());
    return null;
}


