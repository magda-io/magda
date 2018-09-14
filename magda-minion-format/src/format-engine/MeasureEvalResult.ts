import { SelectedFormat } from "../format-engine/formats";
export default interface MeasureEvalResult {
    format: SelectedFormat;
    absConfidenceLevel: number;
    distribution: any;
}
