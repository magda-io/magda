import { State, DatasetStateUpdaterType } from "../../DatasetAddCommon";

export default function updateLastModifyDate(
    datasetStateUpdater: DatasetStateUpdaterType
) {
    datasetStateUpdater((state: State) => {
        const modifiedDates = state.distributions
            .filter((f) => f.modified)
            .map((f) => new Date(f.modified))
            .filter((d) => !isNaN(d.getTime()))
            .map((d) => d.getTime())
            .sort((a, b) => b - a);
        return {
            ...state,
            dataset: {
                ...state.dataset,
                modified: modifiedDates.length
                    ? new Date(modifiedDates[0])
                    : new Date()
            }
        };
    });
}
