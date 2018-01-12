import MeasureEvaluationSet from "./measures/MeasureEvaluationSet";
import MeasureResult from "./measures/MeasureResult";
import MeasureEvalResult from "./MeasureEvalResult";

/**
 * Evaluates the best MeasureEvalResult
 */
export default function getBestMeasureResult(
    candidates: MeasureEvaluationSet[]
): MeasureEvalResult {
    let sortedCandidates = candidates.sort(candidateSortFn);

    //todo fix up this if statement so you dont get the .length error when sortedCandidates is null
    if(!sortedCandidates && sortedCandidates.length < 1) {
        return null;
    } else {
        return {
            format: sortedCandidates[0].measureResult.formats[0],
            absConfidenceLevel: sortedCandidates[0].getProcessedData().absoluteConfidenceLevel,
            distribution: sortedCandidates[0].measureResult.distribution
        }
    }
}

function candidateSortFn(
    candidate1: MeasureEvaluationSet,
    candidate2: MeasureEvaluationSet
) {
    if (candidate1.getProcessedData() === candidate2.getProcessedData()) {
        return 0;
    } else if (candidate1.getProcessedData() < candidate2.getProcessedData()) {
        return 1;
    } else {
        return -1;
    }
}
