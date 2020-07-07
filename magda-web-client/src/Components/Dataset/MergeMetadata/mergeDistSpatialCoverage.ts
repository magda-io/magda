import {
    Distribution,
    SpatialCoverage
} from "Components/Dataset/Add/DatasetAddCommon";

// -- Bounding box in order minlon (west), minlat (south), maxlon (east), maxlat (north)
type BoundingBoxType = [number, number, number, number];

function mergeBBoxes(
    b1?: BoundingBoxType,
    b2?: BoundingBoxType
): BoundingBoxType | undefined {
    if (b1?.length !== 4 && b2?.length !== 4) {
        return undefined;
    }
    if (b1?.length !== 4) {
        return b2;
    }
    if (b2?.length !== 4) {
        return b1;
    }

    const newBBox: BoundingBoxType = [...b1] as BoundingBoxType;

    // --- create a bbox cover both bboxes (bigger)
    newBBox[0] = b2[0] < newBBox[0] ? b2[0] : newBBox[0];
    newBBox[1] = b2[1] < newBBox[1] ? b2[1] : newBBox[1];
    newBBox[2] = b2[2] > newBBox[2] ? b2[2] : newBBox[2];
    newBBox[3] = b2[3] > newBBox[3] ? b2[3] : newBBox[3];

    return newBBox;
}

/**
 * Merge all spatialCoverage field of existing distributions to determine dataset spatialCoverage
 *
 * @export
 * @param {Distribution[]} dists
 * @param {SpatialCoverage} [existingSpatialCoverage] Optional
 * @returns {(SpatialCoverage | undefined)}
 */
export default function mergeDistSpatialCoverage(
    dists: Distribution[],
    existingSpatialCoverage?: SpatialCoverage
): SpatialCoverage | undefined {
    let newBBox: BoundingBoxType | undefined;

    dists.forEach((item) => {
        if (item?.spatialCoverage?.bbox?.length === 4) {
            newBBox = mergeBBoxes(newBBox, item.spatialCoverage.bbox);
        }
    });

    if (newBBox?.length !== 4) {
        // --- if no spatial extent found from dists, return existingSpatialCoverage
        return existingSpatialCoverage ? existingSpatialCoverage : undefined;
    } else {
        return {
            spatialDataInputMethod: "bbox",
            bbox: newBBox
        };
    }
}
