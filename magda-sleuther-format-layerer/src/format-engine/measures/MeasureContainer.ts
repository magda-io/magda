import MeasureResult from './MeasureResult';
import ProbeResult from './ProbeResult';
import MeasureAspect from './aspects/MeasureAspect';
import {Record} from "@magda/typescript-common/src/generated/registry/api";

export default interface MeasureContainer {
    measure: (record: Record) => MeasureResult;
    getProcessedData: (state?: ProbeResult) => MeasureAspect;
    setProcessedData?: (aspect: MeasureAspect) => void;
}