import defer from "helpers/defer";
import {
    State,
    Distribution,
    DatasetStateUpdaterType
} from "../../DatasetAddCommon";

/**
 * Retrieve distribution data from state using state updater function and call `func` with retrieved distribution data.
 * It will be safe to update the state in `func`.
 *
 * @param distId
 * @param datasetStateUpdater
 * @param func
 */
const getDistributionFromId = (
    distId: string,
    datasetStateUpdater: DatasetStateUpdaterType,
    func: (dist: Distribution | undefined) => any
): void =>
    datasetStateUpdater<State>((state) => {
        const distData = state.distributions.find((item) => item.id === distId);
        // --- defer the execution to make sure the current updater return earlier so that it will be safe to update state in func
        defer(() => func(distData));
        // --- return the same state to avoid updating state
        return state;
    });

export default getDistributionFromId;
