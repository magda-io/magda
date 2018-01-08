import { Snapshot, Snapshots } from "./MeasureSnapShot";
/*
* evaluates what the best snapshot is given a list of snapshots
* Each evaluator should have 1 assumption which is a clearly defined rule(or set of rules) that is used to determine which snapshot is the best.
*/ 
export abstract class SnapshotEvaluator {
    snapshots: Snapshots;
    constructor(snapshots: Snapshots) {
        this.snapshots = snapshots;
    }

    public abstract getBestSnapshot(): Snapshot; 
}