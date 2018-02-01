import { SelectedFormat } from "../format-engine/formats";
import { Record } from "../../../magda-typescript-common/dist/generated/registry/api";

export default interface MeasureEvalResult {
    format: SelectedFormat;
    absConfidenceLevel: number;
    distribution: Record
}