import { config, MessageSafeConfig, DATASETS_BUCKET } from "config";
import urijs from "urijs";
import UserVisibleError from "helpers/UserVisibleError";
import {
    State,
    Distribution,
    DistributionState,
    DatasetStateUpdaterType
} from "../../DatasetAddCommon";

import {
    FileDetails,
    MetadataExtractionOutput
} from "Components/Dataset/MetadataExtraction/types";

import moment from "moment";
import * as Comlink from "comlink";

import uploadFile from "./uploadFile";
import translateError from "helpers/translateError";
import promisifySetState from "helpers/promisifySetState";

const ExtractorsWorker = require("worker-loader!../../../MetadataExtraction"); // eslint-disable-line import/no-webpack-loader-syntax

type RunExtractors = (
    input: FileDetails,
    config: MessageSafeConfig,
    update: (progress: number) => void
) => Promise<MetadataExtractionOutput>;

/**
 * The increment / 100 to show for progress once the initial
 * file read is complete
 */
const READ_FILE_PROGRESS_INCREMENT = 20;

function readFileAsArrayBuffer(file: any): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        var fileReader = new FileReader();
        fileReader.onload = function () {
            resolve(this.result as ArrayBuffer);
        };
        fileReader.readAsArrayBuffer(file);
    });
}

// --- update distribution with partial data. If distribution doesn't exist in dataset, create it with initial distribution data before update.
const updateDistPartial = (
    datasetStateUpdater: DatasetStateUpdaterType,
    initDist: Distribution
) => (
    updateFn: (state: Distribution) => Partial<Distribution>
): Promise<Distribution> =>
    new Promise((resolve, reject) => {
        let mergedDist: Distribution;
        datasetStateUpdater(
            (state: State) => {
                try {
                    const distIndex = state.distributions.findIndex(
                        (thisDist) => thisDist.id === initDist.id
                    );
                    const upToDateDist =
                        distIndex !== -1
                            ? state.distributions[distIndex]
                            : initDist;

                    // Clone the existing dist array
                    const newDists = state.distributions.concat();
                    mergedDist = {
                        ...upToDateDist,
                        ...updateFn(upToDateDist)
                    };

                    // If dist already exists
                    if (distIndex >= 0) {
                        // Splice in the updated one
                        newDists.splice(distIndex, 1, mergedDist);
                    } else {
                        // Add the new one
                        newDists.push(mergedDist);
                    }

                    const newState: State = {
                        ...state,
                        distributions: newDists
                    };

                    return newState;
                } catch (e) {
                    reject(e);
                    return state;
                }
            },
            () => resolve(mergedDist)
        );
    });

/**
 * Processes the contents of a file, extracting metadata from it and returning
 * the result. Will also upload the file to the storage API if this is configured.
 *
 * @param thisFile A File to get data out of
 * @param initialDistribution A distribution to modify
 *
 * @returns The modified distribution
 */
export default async function processFile(
    datasetId: string,
    thisFile: File,
    initialDistribution: Distribution,
    saveDatasetToStorage: () => Promise<string>,
    datasetStateUpdater: DatasetStateUpdaterType,
    shouldUploadToStorageApi: boolean
): Promise<Distribution> {
    /** Updates a part of this particular distribution */
    const updateThisDist = updateDistPartial(
        datasetStateUpdater,
        initialDistribution
    );

    // Show user we're starting to read
    updateThisDist(() => ({
        _state: DistributionState.Reading,
        _progress: 0
    }));

    /** Should we be uploading this file too, or just reading metadata locally? */
    const shouldUpload = shouldUploadToStorageApi;

    /**
     * Progress towards uploading, as a fraction between 0 and 1. Note that this
     * is fake because we can't track upload progress
     */
    let uploadProgress = 0;
    /** Progress of extraction, between 0 and 1 */
    let extractionProgress = 0;

    /**
     * Updates the total progress of file processing, taking into account metadata
     * extraction and uploading if applicable
     */
    const updateTotalProgress = () => {
        updateThisDist(() => ({
            // Progress % = the progress of the initial read +
            // either just the extraction progress, or the average
            // of both extraction and upload progress
            _progress:
                READ_FILE_PROGRESS_INCREMENT +
                Math.round(
                    shouldUpload
                        ? extractionProgress * 40 + uploadProgress * 40
                        : extractionProgress * 80
                )
        }));
    };

    /** Handles a new progress callback from uploading */
    const handleUploadProgress = (progress: number) => {
        uploadProgress = progress;
        updateTotalProgress();
    };

    /** Handles a new progress callback from extraction */
    const handleExtractionProgress = (progress: number) => {
        extractionProgress = progress;
        updateTotalProgress();
    };

    /**
     * Promise tracking the upload of a file if relevant - if upload
     * isn't needed, simply resolves instantly
     */
    const doUpload = async () => {
        if (shouldUpload) {
            await uploadFile(
                datasetId,
                thisFile,
                initialDistribution.id!,
                datasetStateUpdater,
                handleUploadProgress,
                saveDatasetToStorage
            );
        }
    };

    const arrayBuffer = await readFileAsArrayBuffer(thisFile);
    const input = {
        fileName: thisFile.name,
        arrayBuffer
    };

    // Now we've finished the read, start processing
    updateThisDist(() => ({
        _state: DistributionState.Processing,
        _progress: READ_FILE_PROGRESS_INCREMENT
    }));

    /**
     * Function for running all extractors in the correct order, which returns
     * a promise that completes when extraction is complete
     */
    const extractorsWorker = new ExtractorsWorker();
    const extractors = Comlink.wrap(extractorsWorker) as Comlink.Remote<{
        runExtractors: RunExtractors;
    }>;

    try {
        await doUpload();

        // Wait for extractors and upload to finish
        const output = await extractors.runExtractors(
            input,
            (() => {
                const safeConfig = { ...config };
                // We need to delete facets because it has regexs in it,
                // and these cause an error if you try to pass them to
                // the webworker
                delete safeConfig.facets;
                return safeConfig;
            })(),
            Comlink.proxy(handleExtractionProgress)
        );

        const extractedDistData = {
            format: output.format,
            title: output.datasetTitle || initialDistribution.title,
            modified: moment(output.modified).toDate(),
            keywords: output.keywords,
            equalHash: output.equalHash?.toString(),
            temporalCoverage: output.temporalCoverage?.intervals?.length
                ? {
                      intervals: output.temporalCoverage.intervals.map(
                          (item) => ({
                              start: item?.start
                                  ? moment(item.start).toDate()
                                  : item?.start,
                              end: item?.end
                                  ? moment(item.end).toDate()
                                  : item?.end
                          })
                      )
                  }
                : output.temporalCoverage,
            spatialCoverage: output.spatialCoverage
        };

        // Now we're done!
        const newDistData = await updateThisDist(() => ({
            ...extractedDistData,
            _progress: 100,
            _state: DistributionState.Ready
        }));

        return newDistData;
    } catch (e) {
        // Something went wrong - remove the distribution and show the error

        /** Removes the distribution and displays the error */
        const removeDist = async () => {
            await promisifySetState(datasetStateUpdater)((state: State) => {
                return {
                    ...state,
                    error: e,
                    distributions: state.distributions.filter(
                        (thisDist) => initialDistribution.id !== thisDist.id
                    )
                };
            });
            // Save to make sure that we persist the file's removal
            await saveDatasetToStorage();
        };

        if (shouldUpload) {
            // If we tried to upload and something went wrong, make sure we get
            // rid of the file in storage as well if possible
            try {
                await doUpload();
            } catch (e) {
                try {
                    const fetchUri = urijs(config.storageApiUrl);
                    const fetchUrl = fetchUri
                        .segmentCoded([
                            ...fetchUri.segmentCoded(),
                            DATASETS_BUCKET,
                            datasetId,
                            initialDistribution.id!,
                            thisFile.name
                        ])
                        .toString();
                    const res = await fetch(fetchUrl, {
                        ...config.credentialsFetchOptions,
                        method: "DELETE"
                    });

                    // 404 is fine because it means the file never got created.
                    if (res.status !== 200 && res.status !== 404) {
                        throw new Error("Could not delete file");
                    }
                } catch (e) {
                    // This happens if the DELETE fails, which is really catastrophic.
                    // We need to warn the user that manual cleanup may be required.
                    throw new UserVisibleError(
                        "Adding the file failed, but Magda wasn't able to remove it from the system - if it's important that this file not remain in Magda, contact " +
                            config.defaultContactEmail
                    );
                } finally {
                    await removeDist();
                }
            }
        } else {
            await removeDist();
        }

        throw translateError(e);
    }
}
