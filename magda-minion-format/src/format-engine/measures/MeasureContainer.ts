import MeasureResult from "./MeasureResult";
import ProbeResult from "./ProbeResult";
import MeasureAspect from "./aspects/MeasureAspect";

export default interface MeasureContainer {
    measure: (record: any) => MeasureResult;
    getProcessedData: (state?: ProbeResult) => MeasureAspect;
    setProcessedData?: (aspect: MeasureAspect) => void;
}
