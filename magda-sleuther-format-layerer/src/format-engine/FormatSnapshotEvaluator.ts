import {
    Snapshot,
    Snapshots
} from "@magda/typescript-common/src/format/MeasureSnapShot";
import {
    SnapshotJudge,
    SnapshotJudgeResult
} from "@magda/typescript-common/src/format/SnapShotEvaluator";
import {
    DownloadMeasure,
    DownloadExtensionMeasure,
    DcatFormatMeasure
} from "./measures";
import * as _ from "lodash";

//TODO replace hierarchy implementation with a proper Machine Learning Implementation
//TODO add unit tests
export class FormatSnapshotJudge extends SnapshotJudge {
    constructor(snapshots: Snapshots) {
        super(snapshots);
    }

    public getBestSnapshot(): SnapshotJudgeResult {
        // turn array into an object:
        // TODO change architecture to make this solution better
        let snapshotDownload: Snapshot;
        let snapshotExtension: Snapshot;
        let snapshotDcat: Snapshot;

        this.snapshots.snapshots.forEach(function(snapshot) {
            if (snapshot.measure.canDeduceFormat) {
                if (snapshot.measure instanceof DownloadMeasure)
                    snapshotDownload = snapshot;
                else if (snapshot.measure instanceof DownloadExtensionMeasure)
                    snapshotExtension = snapshot;
                else if (snapshot.measure instanceof DcatFormatMeasure)
                    snapshotDcat = snapshot;
            }
        });

        if (snapshotDownload) {
            return {
                chosenSnapshot: snapshotDownload,
                confidenceLevel: 90
            };
        } else if (snapshotExtension) {
            return {
                chosenSnapshot: snapshotExtension,
                confidenceLevel: 70
            };
        } else if (snapshotDcat) {
            return {
                chosenSnapshot: snapshotDcat,
                confidenceLevel: 33
            };
        } else return null;
    }
}
