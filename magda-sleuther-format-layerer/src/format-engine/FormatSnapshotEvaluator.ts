import { SnapshotEvaluator } from "@magda/typescript-common/src/format/SnapShotEvaluator";
import { Snapshot } from "../../../magda-typescript-common/src/format/MeasureSnapShot";
import { Snapshots } from "../../../magda-typescript-common/src/format/datastores/rawResults";

export class FormatSnapshotEvaluator extends SnapshotEvaluator{
    constructor(snapshots: Snapshots) {
        super(snapshots)
    }
    
    public getBestSnapshot(): Snapshot {
        throw new Error("Method not implemented.");
    }
}