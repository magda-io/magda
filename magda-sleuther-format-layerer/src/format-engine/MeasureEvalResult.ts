import { SelectedFormat } from "../../../magda-typescript-common/src/format/formats";

export default interface MeasureEvalResult {
    format: SelectedFormat;
    absConfidenceLevel: number;
}