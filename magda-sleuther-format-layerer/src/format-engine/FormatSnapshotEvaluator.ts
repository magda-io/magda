import { SnapshotJudge } from "@magda/typescript-common/src/format/SnapShotEvaluator";
import { Snapshot, Snapshots } from "../../../magda-typescript-common/src/format/MeasureSnapShot";

export class FormatSnapshotJudge extends SnapshotJudge {
    constructor(snapshots: Snapshots) {
        super(snapshots)
    }
    
    public getBestSnapshot(): Snapshot {
        throw new Error("Method not implemented.");
    }
}