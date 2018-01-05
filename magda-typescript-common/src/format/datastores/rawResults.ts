import { Snapshot } from "../MeasureSnapShot";
import { Formats } from "../formats";

// SnapShot records
export class Snapshots {
    /*
    * A list of snapshots in the DB
    */
    snapshots: Snapshot[];
    /*
    * a column that stores the real, true formats of the input specified in the corresponding MeasureSnapShot for training purposes.
    */
    trueFormat: Formats;
} 