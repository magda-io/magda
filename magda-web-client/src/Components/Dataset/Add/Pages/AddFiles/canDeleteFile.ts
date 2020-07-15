import { Distribution, DistributionState } from "../../DatasetAddCommon";

/**
 * Determines whether it's safe to try to delete a distribution's file in the storage API - i.e.
 * it's in a status where it's finished processing.
 */
export default function canDeleteFile(distribution: Distribution) {
    return (
        distribution._state === DistributionState.Ready ||
        distribution._state === DistributionState.Drafting
    );
}
