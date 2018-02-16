//import * as _ from "lodash";

import Registry from "../../magda-typescript-common/dist/registry/AuthorizedRegistryClient";
import { Record } from "../../magda-typescript-common/dist/generated/registry/api";
import { FormatAspect } from "./formatAspectDef";
import unionToThrowable from "../../magda-typescript-common/dist/util/unionToThrowable";

import getDcatMeasureResult from "./format-engine/measures/dcatFormatMeasure";
import getExtensionMeasureResult from "./format-engine/measures/downloadExtensionMeasure";
import getDownloadMeasureResult from "./format-engine/measures/downloadMeasure";

import getBestMeasureResult from "./format-engine/differenceEvaluator";
import MeasureResult from "./format-engine/measures/MeasureResult";
import MeasureEvalResult from "./format-engine/MeasureEvalResult";

let synonymObject = require("./format-engine/synonyms.json");
let formatVec = require("./format2vec.json");

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
    const retrievedResults: MeasureResult[][] = distributions.map(
        function(distribution) {
            let results = [];
            
            const dcatResult: MeasureResult = getDcatMeasureResult(
                distribution, 
                synonymObject,
                3
            );

            const extensionResult: MeasureResult = getExtensionMeasureResult(
                distribution, 
                synonymObject,
                2
            );

            const downloadResult: MeasureResult = getDownloadMeasureResult(
                distribution,
                synonymObject,
                1
            );

            if(dcatResult){
                results.push(dcatResult);
            }

            if(extensionResult){
                results.push(extensionResult);
            }

            if(downloadResult){
                results.push(downloadResult);
            }

            return results;
        }
    );

    const bestFormatResults: MeasureEvalResult[] = retrievedResults.map(
        measureResultsPerDist => getBestMeasureResult(measureResultsPerDist, formatVec)
    );

    bestFormatResults.forEach(function(formatResult) {
        if (!formatResult) {
            console.log("encountered a null format result");
        } else {
            if (!formatResult.distribution) {
                throw new Error("the distribution is null");
            }
            if (!(formatResult.distribution instanceof Record)) {
                throw new Error(
                    "something happened with the measurements and evaluator and now the distribution isn't of type record:" +
                        formatResult.distribution
                );
            }

            recordFormatAspect(registry, formatResult.distribution, {
                format: formatResult.format
            });
        }
    });

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
