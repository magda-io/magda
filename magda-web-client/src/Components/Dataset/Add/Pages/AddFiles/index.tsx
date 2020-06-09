import React from "react";
import { connect } from "react-redux";
import { withRouter, RouterProps } from "react-router";
import FileDrop from "react-file-drop";
import moment from "moment";

import ToolTip from "Components/Dataset/Add/ToolTip";
import DatasetFile from "Components/Dataset/Add/DatasetFile";
import AddDatasetLinkSection from "Components/Dataset/Add/AddDatasetLinkSection";
import StorageOptionsSection from "Components/Dataset/Add/StorageOptionsSection";
import { getFiles } from "helpers/readFile";

import {
    State,
    Distribution,
    DistributionState,
    DistributionSource,
    KeywordsLike,
    createId
} from "../../DatasetAddCommon";
import withAddDatasetState from "../../withAddDatasetState";
import uniq from "lodash/uniq";
import { config, MessageSafeConfig } from "config";
import { User } from "reducers/userManagementReducer";
import {
    FileDetails,
    MetadataExtractionOutput
} from "Components/Dataset/MetadataExtraction/types";
import * as Comlink from "comlink";

import "./index.scss";
import "../../DatasetAddCommon.scss";

const ExtractorsWorker = require("worker-loader!../../../MetadataExtraction"); // eslint-disable-line import/no-webpack-loader-syntax

/** The bucket in the storage API where datasets are stored */
const DATASETS_BUCKET = "magda-datasets";
/**
 * The increment / 100 to show for progress once the initial
 * file read is complete
 */
const READ_FILE_PROGRESS_INCREMENT = 20;

type Props = {
    edit: <K extends keyof State>(
        aspectField: K
    ) => (field: string) => (newValue: any) => void;
    setState: <State>(
        state: ((prevState: Readonly<State>) => State) | State,
        callback?: () => void
    ) => void;
    user: User;
    datasetId?: string;
    stateData: State;
    // --- if use as edit page
    isEditView: boolean;
    save: () => Promise<string>;
};

type RunExtractors = (
    input: FileDetails,
    config: MessageSafeConfig,
    update: (progress: number) => void
) => Promise<MetadataExtractionOutput>;

class AddFilesPage extends React.Component<Props & RouterProps> {
    async onBrowse() {
        this.addFiles(await getFiles("*.*"));
    }

    async onDrop(fileList: FileList | null, event: any) {
        if (fileList) {
            this.addFiles(fileList, event);
        }
    }

    updateLastModifyDate() {
        this.props.setState((state: State) => {
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

    private isDirItem(idx: number, event: any) {
        try {
            if (!event) return false;
            // --- access web browser raw API to test whether it's a directory
            const rawItem = event.dataTransfer.items[idx];
            // --- test `getAsEntry` first as it could be the future standard
            const rawEntry = rawItem.getAsEntry
                ? rawItem.getAsEntry()
                : rawItem.webkitGetAsEntry();
            if (rawEntry.isFile === false || rawEntry.isDirectory === true)
                return true;
            else return false;
        } catch (e) {
            // --- If the API is not supported, the web browser must not support drop a directory
            return false;
        }
    }

    baseStorageApiPath = (distId: string) =>
        `${DATASETS_BUCKET}/${this.props.datasetId}/${distId}`;

    addFiles = async (fileList: FileList, event: any = null) => {
        this.props.setState({
            e: undefined
        });

        for (let i = 0; i < fileList.length; i++) {
            const thisFile = fileList.item(i);

            if (!thisFile || this.isDirItem(i, event)) {
                // --- skip the directory item
                continue;
            }

            const distRecordId = createId("dist");

            const dist: Distribution = {
                id: distRecordId,
                datasetTitle: toTitleCase(
                    turnPunctuationToSpaces(
                        trimExtension(thisFile.name || "File Name")
                    )
                ).trim(),
                title: thisFile.name,
                byteSize: thisFile.size,
                modified: new Date(thisFile.lastModified),
                format: fileFormat(thisFile),
                _state: DistributionState.Added,
                license: "world",
                creationSource: DistributionSource.File,
                downloadURL: this.props.stateData.shouldUploadToStorageApi
                    ? `${config.storageApiUrl}${this.baseStorageApiPath(
                          distRecordId
                      )}/${thisFile.name}`
                    : undefined
            };

            try {
                const distAfterProcessing = await this.processFile(
                    thisFile,
                    dist
                );

                this.props.setState((state: State) => {
                    const newState: State = {
                        ...state,
                        distributions: state.distributions.slice(0)
                    };

                    const {
                        dataset,
                        temporalCoverage,
                        spatialCoverage
                    } = state;

                    if (
                        (!dataset.title || dataset.title === "") &&
                        distAfterProcessing?.datasetTitle
                    ) {
                        dataset.title = distAfterProcessing.datasetTitle;
                    }

                    for (let key of ["keywords", "themes"]) {
                        const existing = dataset[key]
                            ? (dataset[key] as KeywordsLike)
                            : {
                                  keywords: [],
                                  derived: false
                              };
                        const fileKeywords: string[] =
                            distAfterProcessing[key] || [];

                        dataset[key] = {
                            keywords: uniq(
                                existing.keywords.concat(fileKeywords)
                            ),
                            derived: existing.derived || fileKeywords.length > 0
                        };
                    }

                    if (distAfterProcessing.spatialCoverage) {
                        Object.assign(
                            spatialCoverage,
                            distAfterProcessing.spatialCoverage
                        );
                    }

                    if (distAfterProcessing.temporalCoverage) {
                        temporalCoverage.intervals = temporalCoverage.intervals.concat(
                            distAfterProcessing.temporalCoverage?.intervals ||
                                []
                        );
                    }

                    if (
                        config.datasetThemes &&
                        config.datasetThemes.length &&
                        newState.dataset &&
                        newState.dataset.keywords &&
                        newState.dataset.keywords.keywords &&
                        newState.dataset.keywords.keywords.length
                    ) {
                        const keywords = newState.dataset.keywords.keywords.map(
                            (item) => item.toLowerCase()
                        );
                        const themesBasedOnKeywords = config.datasetThemes.filter(
                            (theme) =>
                                keywords.indexOf(theme.toLowerCase()) !== -1
                        );
                        if (themesBasedOnKeywords.length) {
                            const existingThemesKeywords = newState.dataset
                                .themes
                                ? newState.dataset.themes.keywords
                                : [];
                            newState.dataset.themes = {
                                keywords: themesBasedOnKeywords.concat(
                                    existingThemesKeywords
                                ),
                                derived: true
                            };
                        }
                    }

                    return newState;
                });

                if (this.props.stateData.shouldUploadToStorageApi) {
                    // Save now so that we don't end up with orphaned uploaded files
                    await this.props.save();
                }
            } catch (e) {
                console.error(e);
                this.props.setState({
                    e
                });
            }
        }
        this.updateLastModifyDate();
    };

    addDistribution = (distribution: Distribution) => {
        this.props.setState((state: State) => {
            const newDistribution = state.distributions.concat(distribution);
            return {
                ...state,
                distributions: newDistribution
            };
        });
    };

    editDistribution = (index: number) => (
        updater: (distribution: Distribution) => Distribution
    ) => {
        this.props.setState((state: State) => {
            const newDistributions = state.distributions.concat();
            newDistributions[index] = updater(newDistributions[index]);
            return {
                ...state,
                distributions: newDistributions
            };
        });
        this.updateLastModifyDate();
    };

    deleteDistribution = (index: number) => () => {
        const removeDist = () => {
            this.props.setState((state: State) => {
                const newDistributions = state.distributions.filter(
                    (item, idx) => {
                        if (idx === index) return false;
                        return true;
                    }
                );
                return {
                    ...state,
                    distributions: newDistributions
                };
            });
        };

        if (this.props.stateData.shouldUploadToStorageApi) {
            const distToDelete = this.props.stateData.distributions[index];
            if (!AddFilesPage.canDeleteFile(distToDelete)) {
                throw new Error(
                    "Tried to delete file that hasn't been fully processed"
                );
            }

            // set deleting
            this.props.setState((state: State) => {
                const newDistributions = state.distributions.concat();
                newDistributions[index] = {
                    ...distToDelete,
                    _state: DistributionState.Deleting,
                    _progress: 50
                };

                return {
                    ...state,
                    distributions: newDistributions
                };
            });

            // warn before closing tab
            this.deleteFile(distToDelete).then(() =>
                // remove dist from state
                removeDist()
            );
        } else {
            removeDist();
        }
    };

    /**
     * Deletes the file belonging to a distribution
     */
    private deleteFile(distToDelete: Distribution) {
        // While delete is in progress, warn the user not to close the tab if they try
        const unloadEventListener = (e: BeforeUnloadEvent) => {
            // Preventing default makes a warning come up in FF
            e.preventDefault();
            // Setting a return value shows the warning in Chrome
            e.returnValue =
                "Closing this page might cause the file not to be fully deleted, are you sure?";
            // The return value is shown inside the prompt in IE
        };

        window.addEventListener("beforeunload", unloadEventListener);

        // fetch to delete distribution - try to delete even if we hadn't completed the initial upload
        // just to be safe
        return fetch(
            `${config.storageApiUrl}${DATASETS_BUCKET}/${this.props.datasetId}/${distToDelete.id}`,
            {
                ...config.credentialsFetchOptions,
                method: "DELETE"
            }
        )
            .then((res) => {
                // Even a delete on a non-existent file returns 200
                if (res.status !== 200) {
                    throw new Error("Could not delete file");
                }
            })
            .catch((err) => {
                this.setState({
                    e: new Error(
                        `Failed to remove file ${distToDelete.title} from Magda's storage. If you removed this ` +
                            `file because it shouldn't be stored on Magda, please contact ${config.defaultContactEmail}` +
                            `to ensure that it's properly removed.`
                    )
                });
                console.error(err);
            })
            .finally(() => {
                window.removeEventListener("beforeunload", unloadEventListener);
            });
    }

    /**
     * Determines whether it's safe to try to delete a distribution's file in the storage API - i.e.
     * it's in a status where it's finished processing.
     */
    private static canDeleteFile(distribution: Distribution) {
        return (
            distribution._state === DistributionState.Ready ||
            distribution._state === DistributionState.Drafting
        );
    }

    renderStorageOption() {
        const state = this.props.stateData;
        const localFiles = state.distributions.filter(
            (file) => file.creationSource === DistributionSource.File
        );

        return (
            <StorageOptionsSection
                files={localFiles}
                shouldUploadToStorageApi={state.shouldUploadToStorageApi}
                setShouldUploadToStorageApi={(value) => {
                    this.props.setState((state: State) => {
                        const newState = {
                            ...state,
                            shouldUploadToStorageApi: value
                        };
                        if (value) {
                            // --- delete dataset location data when upload to storage api is selected
                            const {
                                location: originalLocation,
                                ...newDatasetAccess
                            } = { ...state.datasetAccess };
                            newState.datasetAccess = newDatasetAccess;
                        }
                        return newState;
                    });
                }}
                dataAccessLocation={
                    state.datasetAccess.location
                        ? state.datasetAccess.location
                        : ""
                }
                setDataAccessLocation={(value) =>
                    this.props.setState((state: State) => ({
                        ...state,
                        datasetAccess: {
                            ...state.datasetAccess,
                            location: value
                        }
                    }))
                }
            />
        );
    }

    /**
     * Processes the contents of a file, extracting metadata from it and returning
     * the result. Will also upload the file to the storage API if this is configured.
     *
     * @param thisFile A File to get data out of
     * @param initialDistribution A distribution to modify
     *
     * @returns The modified distribution
     */
    async processFile(
        thisFile: File,
        initialDistribution: Distribution
    ): Promise<Distribution> {
        /** Updates a part of this particular distribution */
        const updateThisDist = this.updateDistPartial(initialDistribution);

        // Show user we're starting to read
        updateThisDist(() => ({
            _state: DistributionState.Reading,
            _progress: 0
        }));

        /** Should we be uploading this file too, or just reading metadata locally? */
        const shouldUpload = this.props.stateData.shouldUploadToStorageApi;

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
            updateThisDist(() => {
                return {
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
                };
            });
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
        const uploadPromise = shouldUpload
            ? this.uploadFile(
                  thisFile,
                  initialDistribution,
                  handleUploadProgress
              )
            : Promise.resolve();

        const arrayBuffer = await readFileAsArrayBuffer(thisFile);
        const input = {
            fileName: thisFile.name,
            arrayBuffer
        };

        // Now we've finished the read, start processing
        updateThisDist((_state) => ({
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
            await uploadPromise;

            // Now we're done!
            updateThisDist((_dist: Distribution) => ({
                _state: DistributionState.Ready
            }));

            return {
                ...initialDistribution,
                format: output.format,
                title: output.datasetTitle || initialDistribution.title,
                modified: moment(output.modified).toDate(),
                keywords: output.keywords,
                equalHash: output.equalHash?.toString(),
                temporalCoverage: output.temporalCoverage,
                spatialCoverage: output.spatialCoverage
            };
        } catch (e) {
            // Something went wrong - remove the distribution and show the error
            console.error(e);

            /** Removes the distribution and displays the error */
            const removeDist = () => {
                this.props.setState((state: State) => {
                    return {
                        ...state,
                        error: e,
                        distributions: state.distributions.filter(
                            (thisDist) => initialDistribution.id !== thisDist.id
                        )
                    };
                });
            };

            if (shouldUpload) {
                // If we tried to upload and something went wrong, make sure we get
                // rid of the file in storage as well if possible
                uploadPromise
                    .catch(() => {})
                    .then(() =>
                        fetch(
                            `${config.storageApiUrl}${this.baseStorageApiPath(
                                initialDistribution.id!
                            )}/${thisFile.name}`,
                            {
                                ...config.credentialsFetchOptions,
                                method: "DELETE"
                            }
                        )
                    )
                    .then((res) => {
                        // 404 is fine because it means the file never got created.
                        if (res.status !== 200 && res.status !== 404) {
                            throw new Error("Could not delete file");
                        }

                        removeDist();
                    })
                    .catch((e) => {
                        console.error(e);

                        // This happens if the DELETE fails, which is really catastrophic.
                        // We need to warn the user that manual cleanup may be required.
                        this.props.setState((state: State) => {
                            return {
                                ...state,
                                error: new Error(
                                    "Adding the file failed, but Magda wasn't able to remove it from the system - if it's important that this file not remain in Magda, contact " +
                                        config.defaultContactEmail
                                ),
                                distributions: state.distributions.filter(
                                    (thisDist) =>
                                        initialDistribution.id !== thisDist.id
                                )
                            };
                        });
                    });
            } else {
                removeDist();
            }

            throw e;
        }
    }

    updateDistPartial = (dist: Distribution) => (
        updateFn: (state: Distribution) => Partial<Distribution>
    ) => {
        this.props.setState((state: State) => {
            const distIndex = state.distributions.findIndex(
                (thisDist) => thisDist.id === dist.id
            );
            const upToDateDist =
                distIndex !== -1 ? state.distributions[distIndex] : dist;

            // Clone the existing dist array
            const newDists = state.distributions.concat();
            const mergedDist = {
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
        });
    };

    uploadFile = async (
        file: File,
        dist: Distribution,
        onProgressUpdate: (progress: number) => void
    ) => {
        // Save first, so that the record id will be present.
        await this.props.save();

        const formData = new FormData();
        formData.append(file.name, file);

        const fetchUrl = `${
            config.storageApiUrl
        }upload/${this.baseStorageApiPath(dist.id!)}?recordId=${
            this.props.datasetId
        }`;

        let uploadProgress = 0;
        const fakeProgressInterval = setInterval(() => {
            uploadProgress += (1 - uploadProgress) / 4;
            onProgressUpdate(uploadProgress);
        }, 1000);

        try {
            const res = await fetch(fetchUrl, {
                ...config.credentialsFetchOptions,
                method: "POST",
                body: formData
            });
            if (res.status !== 200) {
                throw new Error("Could not upload file");
            }
        } finally {
            uploadProgress = 1;
            onProgressUpdate(uploadProgress);
            clearInterval(fakeProgressInterval);
        }
    };

    render() {
        const { stateData: state, isEditView } = this.props;
        const localFiles = state.distributions.filter(
            (file) => file.creationSource === DistributionSource.File
        );

        return (
            <div
                className={`container-fluid dataset-add-file-page ${
                    isEditView ? "is-edit-view" : ""
                }`}
            >
                {isEditView ? null : (
                    <div className="row top-area-row">
                        <div className="col-xs-12 top-text-area">
                            <h1>Add your dataset to pre-populate metadata</h1>
                            <p>
                                Our Publishing Tool can review your dataset
                                contents and pre-populate metadata. Just add all
                                the files or services that make up your dataset.
                            </p>
                            <p>
                                You can upload your dataset as files, add a link
                                to files already hosted online, or add a link to
                                a web service, or any combination of the three.
                            </p>
                            <p>
                                All our processing happens in your internet
                                browser, we only store a copy of your files if
                                you ask us to, and you can edit or delete the
                                metadata at any time.
                            </p>
                            <p>
                                Want to upload your entire data catalogue in one
                                go? Use our <a>Bulk Upload tool</a>
                            </p>
                        </div>
                    </div>
                )}

                <div className="row add-files-heading">
                    <div className="col-xs-12">
                        {isEditView ? (
                            <h3>Your files and distributions</h3>
                        ) : (
                            <h3>Add files</h3>
                        )}
                        {this.renderStorageOption()}
                    </div>

                    {localFiles.length > 0 && (
                        <div className="col-xs-12 tip-area">
                            <ToolTip>
                                We recommend ensuring dataset file names are
                                descriptive so users can easily understand the
                                contents.
                            </ToolTip>
                        </div>
                    )}
                </div>

                <div className="row files-area">
                    <div className="col-xs-12">
                        <div className="row">
                            {localFiles.map((file: Distribution, i) => {
                                let isLastRow;
                                if (localFiles.length % 2) {
                                    isLastRow = i >= localFiles.length - 1;
                                } else {
                                    isLastRow = i >= localFiles.length - 2;
                                }
                                return (
                                    <div
                                        key={i}
                                        className={`col-xs-6 dataset-add-files-fileListItem ${
                                            isLastRow ? "last-row" : ""
                                        }`}
                                    >
                                        <DatasetFile
                                            idx={i}
                                            file={file}
                                            onChange={this.editDistribution(i)}
                                            onDelete={this.deleteDistribution(
                                                i
                                            )}
                                        />
                                    </div>
                                );
                            })}
                        </div>

                        {state.error && (
                            <div className="au-body au-page-alerts au-page-alerts--error">
                                Failed to process file: {state.error?.message}
                            </div>
                        )}

                        {localFiles.length > 0 && (
                            <div className="more-files-to-add-text">
                                More files to add?
                            </div>
                        )}
                    </div>
                </div>

                <div className="row justify-content-center">
                    <div
                        className="col-xs-12"
                        onClick={this.onBrowse.bind(this)}
                    >
                        <FileDrop
                            onDrop={this.onDrop.bind(this)}
                            className="dataset-add-files-dropZone"
                            targetClassName="dataset-add-files-dropTarget"
                        >
                            <button
                                className="au-btn filedrop-zone-button"
                                aria-label="Press enter key to upload files"
                            />
                        </FileDrop>
                    </div>
                </div>

                <AddDatasetLinkSection
                    type={DistributionSource.DatasetUrl}
                    distributions={state.distributions}
                    addDistribution={this.addDistribution}
                    editDistribution={this.editDistribution}
                    deleteDistribution={this.deleteDistribution}
                    setMetadataState={this.props.setState}
                />

                <AddDatasetLinkSection
                    type={DistributionSource.Api}
                    distributions={state.distributions}
                    addDistribution={this.addDistribution}
                    editDistribution={this.editDistribution}
                    deleteDistribution={this.deleteDistribution}
                    setMetadataState={this.props.setState}
                />
            </div>
        );
    }
}

function trimExtension(filename: string) {
    return filename.substr(0, filename.lastIndexOf(".")) || filename;
}

function turnPunctuationToSpaces(filename: string) {
    return filename.replace(PUNCTUATION_REGEX, " ");
}
const PUNCTUATION_REGEX = /[-_]+/g;

function toTitleCase(str: string) {
    return str.replace(/\w\S*/g, function (txt) {
        return (
            txt.charAt(0).toUpperCase() +
            txt
                .substr(1)
                .replace(/([a-z])([A-Z])/g, "$1 $2")
                .toLowerCase()
        );
    });
}

function readFileAsArrayBuffer(file: any): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        var fileReader = new FileReader();
        fileReader.onload = function () {
            resolve(this.result as ArrayBuffer);
        };
        fileReader.readAsArrayBuffer(file);
    });
}
function mapStateToProps(state, old) {
    let dataset = old.match.params.datasetId;
    return {
        dataset
    };
}

function fileFormat(file): string {
    const extensionIndex = file.name.lastIndexOf(".");
    const extensionLength = file.name.length - extensionIndex - 1;
    if (extensionIndex !== -1 && extensionLength > 0 && extensionLength < 5) {
        return file.name.substr(extensionIndex + 1).toUpperCase();
    } else {
        return file.type || "unknown";
    }
}

export default withAddDatasetState<Props>(
    // @ts-ignore
    withRouter(connect(mapStateToProps)(AddFilesPage))
) as React.ComponentType<Props>;
