import MeasureResult from "./MeasureResult";
import ProbeResult from "./ProbeResult";
import MeasureAspect from "./aspects/MeasureAspect";

/**
 * Contains the result of a measure, and also functions for recording and getting the performance and reliability of the corresponding Measure
 */
export default interface MeasureEvaluationSet {
    measureResult: MeasureResult;
    getProcessedData: (state?: ProbeResult) => MeasureAspect;
    setProcessedData?: (aspect: MeasureAspect) => void;
};
