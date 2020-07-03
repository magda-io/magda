import canDeleteFile from "./canDeleteFile";
import deleteFile from "./deleteFile";
import getDistributionFromId from "./getDistributionFromId";

import {
    State,
    DistributionState,
    DatasetStateUpdaterType,
    DistributionSource,
    saveRuntimeStateToStorage
} from "../../DatasetAddCommon";
import promisifySetState from "helpers/promisifySetState";

const deleteDistribution = (
    datasetId: string,
    datasetStateUpdater: DatasetStateUpdaterType,
    shouldUploadToStorageApi: boolean,
    distId: string
) =>
    new Promise<void>(async (resolve, reject) => {
        try {
            const removeDist = () =>
                promisifySetState(datasetStateUpdater)((state: State) => ({
                    ...state,
                    distributions: state.distributions.filter(
                        (item) => item.id !== distId
                    )
                }));

            if (!shouldUploadToStorageApi) {
                await removeDist();
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
                                        `Cannot locate the distribution data (id: ${distId}) whihle tried to delete distribution`
                                    )
                                );
                                return;
                            }

                            if (
                                distToDelete.creationSource !==
                                DistributionSource.File
                            ) {
                                // --- a distribution created from URL can be removed straight-away.
                                await removeDist();
                                resolve();
                                // --- exit once the distribution is deleted.
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
                            await promisifySetState(datasetStateUpdater)(
                                (state: State) => ({
                                    ...state,
                                    distributions: [...state.distributions].map(
                                        (item) => {
                                            if (item.id === distId) {
                                                return {
                                                    ...item,
                                                    _state:
                                                        DistributionState.Deleting,
                                                    _progress: 50
                                                };
                                            } else {
                                                return item;
                                            }
                                        }
                                    )
                                })
                            );

                            // warn before closing tab
                            await deleteFile(distToDelete);
                            // remove dist from state
                            await removeDist();
                            resolve();
                        } catch (e) {
                            reject(e);
                        }
                    }
                );
            }
        } catch (e) {
            reject(e);
        }
    }).then(async () => {
        await saveRuntimeStateToStorage(datasetId, datasetStateUpdater);
    });

export default deleteDistribution;
