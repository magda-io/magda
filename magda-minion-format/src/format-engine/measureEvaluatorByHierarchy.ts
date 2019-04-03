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

    const dcatSet = candidates[0];

    let sortedCandidates = candidates.sort(candidateSortFn);

    //TODO produce a system that mitigates when all measures return null. What should happen then?
    if (!sortedCandidates[0].measureResult) {
        return null;
    } else {
        let finalCandidate = sortedCandidates[0];
        if (dcatSet.measureResult) {
            const sortedFormat = (
                "" + sortedCandidates[0].measureResult.formats[0].format
            )
                .trim()
                .toUpperCase();
            const dcatFormat = ("" + dcatSet.measureResult.formats[0].format)
                .trim()
                .toUpperCase();
            if (
                /**
                 * if sortedFormat is `ZIP` & is different from dcatFormat, we should trust dcatFormat
                 */
                (sortedFormat === "ZIP" && dcatFormat !== sortedFormat) ||
                /**
                 * if sortedFormat is `ESRI REST` & is different from dcatFormat, we should trust dcatFormat
                 * The Regex for testing `ESRI REST` URL cannot be very specific. Thus, should only be used when DcatFormat not present
                 */
                (sortedFormat === "ESRI REST" && dcatFormat !== sortedFormat)
            ) {
                finalCandidate = dcatSet;
            }
        }
        return {
            format: finalCandidate.measureResult.formats[0],
            absConfidenceLevel: finalCandidate.getProcessedData()
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
