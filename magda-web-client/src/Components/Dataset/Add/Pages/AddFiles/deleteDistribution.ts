import canDeleteFile from "./canDeleteFile";
import deleteFile from "./deleteFile";
import getDistributionFromId from "./getDistributionFromId";

import {
    State,
    DistributionState,
    DatasetStateUpdaterType
} from "../../DatasetAddCommon";

const deleteDistribution = (
    datasetId: string,
    datasetStateUpdater: DatasetStateUpdaterType,
    shouldUploadToStorageApi: boolean,
    distId: string
) =>
    new Promise<void>((resolve, reject) => {
        const removeDist = () => {
            datasetStateUpdater((state: State) => ({
                ...state,
                distributions: state.distributions.filter(
                    (item) => item.id !== distId
                )
            }));
        };

        if (!shouldUploadToStorageApi) {
            removeDist();
            resolve();
        } else {
            getDistributionFromId(
                distId,
                datasetStateUpdater,
                async (distToDelete) => {
                    try {
                        if (!distToDelete) {
                            reject(
                                new Error(
                                    `Cannot locate the file (id: ${distId}) whihle tried to delete file`
                                )
                            );
                            return;
                        }

                        if (!canDeleteFile(distToDelete)) {
                            reject(
                                new Error(
                                    "Tried to delete file that hasn't been fully processed"
                                )
                            );
                            return;
                        }

                        // set deleting
                        datasetStateUpdater((state: State) => ({
                            ...state,
                            distributions: [...state.distributions].map(
                                (item) => {
                                    if (item.id === distId) {
                                        return {
                                            ...item,
                                            _state: DistributionState.Deleting,
                                            _progress: 50
                                        };
                                    } else {
                                        return item;
                                    }
                                }
                            )
                        }));

                        // warn before closing tab
                        await deleteFile(datasetId, distToDelete);
                        // remove dist from state
                        removeDist();
                        resolve();
                    } catch (e) {
                        reject(e);
                    }
                }
            );
        }
    });

export default deleteDistribution;
