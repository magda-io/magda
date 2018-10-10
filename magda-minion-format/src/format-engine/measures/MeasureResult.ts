import { SelectedFormat } from "../formats";
import ProbeResult from "./ProbeResult";

export default interface MeasureResult {
    formats: SelectedFormat[];
    state?: ProbeResult;
    distribution: any;
}
