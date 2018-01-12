import { SelectedFormat } from "../../../magda-typescript-common/src/format/formats";
import { Record } from "../../../magda-typescript-common/src/generated/registry/api";

export default interface MeasureEvalResult {
    format: SelectedFormat;
    absConfidenceLevel: number;
    distribution: Record
}