import { Snapshot } from "./MeasureSnapShot";
import { Snapshots } from "./datastores/rawResults";

export abstract class SnapshotEvaluator {
    snapshots: Snapshots;
    constructor(snapshots: Snapshots) {
        this.snapshots = snapshots;
    }

    public abstract getBestSnapshot(): Snapshot; 
}