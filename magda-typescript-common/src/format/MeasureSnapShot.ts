import { Measure } from "./Measure";
import { SelectedFormats } from "./formats";
import { Record } from "../generated/registry/api";

export interface Snapshot {
    input: Record,
    measure: Measure,
    output: SelectedFormats
}
