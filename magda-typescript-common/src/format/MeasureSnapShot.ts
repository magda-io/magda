import { Measure } from "./Measure";
import { SelectedFormat } from "./formats";
import { Record } from "../generated/registry/api";

export interface Snapshot {
    input: Record,
    measure: Measure,
    output: SelectedFormat
}

export interface Snapshots {
    snapshots: Snapshot[];
}
