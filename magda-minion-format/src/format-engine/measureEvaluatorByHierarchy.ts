import MeasureEvaluationSet from "./measures/MeasureEvaluationSet";
//import MeasureResult from "./measures/MeasureResult";
import MeasureEvalResult from "./MeasureEvalResult";

/**
 * Evaluates the best MeasureEvalResult
 */
export default function getBestMeasureResult(
    candidates: MeasureEvaluationSet[]
): MeasureEvalResult {
    if (!candidates || candidates.length < 1) {
        return null;
    }

    let sortedCandidates = candidates.sort(candidateSortFn);

    //TODO produce a system that mitigates when all measures return null. What should happen then?
    if (!sortedCandidates[0].measureResult) {
        return null;
    } else {
        return {
            format: sortedCandidates[0].measureResult.formats[0],
            absConfidenceLevel: sortedCandidates[0].getProcessedData()
                .absoluteConfidenceLevel
        };
    }
}

//TODO simplify this function
function candidateSortFn(
    candidate1: MeasureEvaluationSet,
    candidate2: MeasureEvaluationSet
) {
    if (candidate1.measureResult && !candidate2.measureResult) {
        return -1;
    } else if (candidate2.measureResult && !candidate1.measureResult) {
        return 1;
    } else if (
        candidate1.getProcessedData().absoluteConfidenceLevel ===
        candidate2.getProcessedData().absoluteConfidenceLevel
    ) {
        return 0;
    } else if (
        candidate1.getProcessedData().absoluteConfidenceLevel <
        candidate2.getProcessedData().absoluteConfidenceLevel
    ) {
        return 1;
    } else {
        return -1;
    }
}
