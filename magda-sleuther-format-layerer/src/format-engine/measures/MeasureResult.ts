import { SelectedFormat } from "../../../../magda-typescript-common/src/format/formats";
import ProbeResult from "./ProbeResult";
import { Record } from "@magda/typescript-common/src/generated/registry/api";

export default interface MeasureResult {
    formats: SelectedFormat[];
    state?: ProbeResult;
    distribution: Record;
}