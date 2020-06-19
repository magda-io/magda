import React from "react";
import FileDrop from "react-file-drop";

import DatasetFile from "Components/Dataset/Add/DatasetFile";
import AddDatasetLinkSection from "Components/Dataset/Add/AddDatasetLinkSection";
import StorageOptionsSection from "Components/Dataset/Add/StorageOptionsSection";
import { getFiles } from "helpers/readFile";

import {
    State,
    saveState,
    Distribution,
    DistributionState,
    DistributionSource,
    DatasetStateUpdaterType,
    KeywordsLike,
    createId,
    Interval
} from "../../../Add/DatasetAddCommon";
import uniq from "lodash/uniq";
import { uniqWith } from "lodash";
import { config } from "config";
import { User } from "reducers/userManagementReducer";
import baseStorageApiPath from "../../../Add/Pages/AddFiles/baseStorageApiPath";

import "./index.scss";
import "../../../Add/DatasetAddCommon.scss";
import UserVisibleError from "helpers/UserVisibleError";
import processFile from "../../../Add/Pages/AddFiles/processFile";
import deleteDistribution from "../../../Add/Pages/AddFiles/deleteDistribution";

type Props = {
    edit: <K extends keyof State>(
        aspectField: K
    ) => (field: string) => (newValue: any) => void;
    setState: DatasetStateUpdaterType;
    user: User;
    datasetId: string;
    stateData: State;
    // --- if use as edit page
    isEditView: boolean;
};

class AddFilesPage extends React.Component<Props> {
    async onBrowse() {
        this.addFiles(await getFiles("*.*"));
    }

    async onDrop(fileList: FileList | null, event: any) {
        if (fileList) {
            this.addFiles(fileList, event);
        }
    }

    async saveStateToStorage() {
        return await saveState(this.props.stateData, this.props.datasetId);
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
                license: "No license",
                creationSource: DistributionSource.File,
                downloadURL: this.props.stateData.shouldUploadToStorageApi
                    ? `${config.storageApiUrl}${baseStorageApiPath(
                          this.props.datasetId,
                          distRecordId
                      )}/${thisFile.name}`
                    : undefined
            };

            try {
                const distAfterProcessing = await processFile(
                    this.props.datasetId,
                    thisFile,
                    dist,
                    this.saveStateToStorage.bind(this),
                    this.props.setState,
                    this.props.stateData.shouldUploadToStorageApi
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
                        let uniqTemporalCoverage = uniqWith(
                            temporalCoverage.intervals,
                            (arrVal: Interval, othVal: Interval) => {
                                return (
                                    arrVal.start?.getTime() ===
                                        othVal.start?.getTime() &&
                                    arrVal.end?.getTime() ===
                                        othVal.end?.getTime()
                                );
                            }
                        );
                        temporalCoverage.intervals = uniqTemporalCoverage;
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
                    // if the user leaves without saving
                    await this.saveStateToStorage();
                }
            } catch (e) {
                console.error(e);
                if (e instanceof UserVisibleError) {
                    this.props.setState({
                        error: e
                    });
                }
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

    editDistribution = (distId: string) => (
        updater: (distribution: Distribution) => Distribution
    ) => {
        this.props.setState((state: State) => ({
            ...state,
            distributions: [...state.distributions].map((item) =>
                item.id === distId ? updater(item) : item
            )
        }));
        this.updateLastModifyDate();
    };

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

    render() {
        const { stateData: state } = this.props;
        const readyDistributions = state.distributions.filter(
            (item) => item._state === DistributionState.Ready
        );

        const deleteDistributionHandler = (distId: string) => () => {
            deleteDistribution(
                this.props.datasetId,
                this.props.setState,
                this.props.stateData.shouldUploadToStorageApi,
                distId
            ).catch((e) => {
                console.error(e);
                if (e instanceof UserVisibleError) {
                    this.props.setState({
                        error: e
                    });
                }
            });
        };

        return (
            <div
                className={`container-fluid dataset-add-file-page is-edit-view`}
            >
                <div className="row add-files-heading">
                    <div className="col-xs-12">
                        <h3>Your files and distributions</h3>
                        <h4>Storage and location</h4>
                        {this.renderStorageOption()}
                    </div>
                </div>

                <h4 className="dataset-contents-heading">Dataset contents</h4>
                <div className="dataset-contents-sub-heading">
                    Existing contents:
                </div>

                <div className="row files-area">
                    <div className="col-xs-12">
                        <div className="row">
                            {readyDistributions.map((file: Distribution, i) => {
                                let isLastRow;
                                if (readyDistributions.length % 2) {
                                    isLastRow =
                                        i >= readyDistributions.length - 1;
                                } else {
                                    isLastRow =
                                        i >= readyDistributions.length - 2;
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
                                            onChange={this.editDistribution(
                                                file.id!
                                            )}
                                            onDelete={deleteDistributionHandler(
                                                file.id!
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

                        {readyDistributions.length > 0 && (
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
                    deleteDistribution={deleteDistributionHandler}
                    setMetadataState={this.props.setState}
                />

                <AddDatasetLinkSection
                    type={DistributionSource.Api}
                    distributions={state.distributions}
                    addDistribution={this.addDistribution}
                    editDistribution={this.editDistribution}
                    deleteDistribution={deleteDistributionHandler}
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

function fileFormat(file): string {
    const extensionIndex = file.name.lastIndexOf(".");
    const extensionLength = file.name.length - extensionIndex - 1;
    if (extensionIndex !== -1 && extensionLength > 0 && extensionLength < 5) {
        return file.name.substr(extensionIndex + 1).toUpperCase();
    } else {
        return file.type || "unknown";
    }
}

export default AddFilesPage;
