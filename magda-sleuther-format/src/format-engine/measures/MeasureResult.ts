import { SelectedFormat } from "../formats";
import ProbeResult from "./ProbeResult";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";

export default interface MeasureResult {
    formats: SelectedFormat[];
    state?: ProbeResult;
    distribution: Record;
}