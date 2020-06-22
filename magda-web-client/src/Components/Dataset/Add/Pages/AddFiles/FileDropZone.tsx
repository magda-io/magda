import React, { FunctionComponent } from "react";
import FileDrop from "react-file-drop";
import uniq from "lodash/uniq";
import uniqWith from "lodash/uniqWith";
import partial from "lodash/partial";
import { config } from "config";
import {
    State,
    DatasetStateUpdaterType,
    createId,
    Distribution,
    DistributionState,
    DistributionSource,
    KeywordsLike,
    Interval,
    saveRuntimeStateToStorage
} from "../../DatasetAddCommon";
import baseStorageApiPath from "./baseStorageApiPath";
import processFile from "./processFile";
import UserVisibleError from "helpers/UserVisibleError";
import { getFiles } from "helpers/readFile";
import updateLastModifyDate from "./updateLastModifyDate";

import "./FileDropZone.scss";

type PropsType = {
    stateData: State;
    datasetStateUpdater: DatasetStateUpdaterType;
    datasetId: string;
    initDistProps?: Partial<Distribution>;
};

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

function isDirItem(idx: number, event: any) {
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

const FileDropZone: FunctionComponent<PropsType> = (props) => {
    const { datasetStateUpdater, stateData, datasetId } = props;
    const initDistProps = props.initDistProps ? props.initDistProps : {};

    const onBrowse = async () => {
        addFiles(await getFiles("*.*"));
    };

    const onDrop = async (fileList: FileList | null, event: any) => {
        if (fileList) {
            addFiles(fileList, event);
        }
    };

    const addFiles = async (fileList: FileList, event: any = null) => {
        datasetStateUpdater({
            error: undefined
        });

        for (let i = 0; i < fileList.length; i++) {
            const thisFile = fileList.item(i);

            if (!thisFile || isDirItem(i, event)) {
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
                downloadURL: stateData.shouldUploadToStorageApi
                    ? `${config.storageApiUrl}${baseStorageApiPath(
                          datasetId,
                          distRecordId
                      )}/${thisFile.name}`
                    : undefined,
                // --- allow other component to overwrite distribution status
                ...initDistProps
            };

            try {
                const distAfterProcessing = await processFile(
                    datasetId,
                    thisFile,
                    dist,
                    partial(
                        saveRuntimeStateToStorage,
                        datasetId,
                        datasetStateUpdater
                    ),
                    datasetStateUpdater,
                    stateData.shouldUploadToStorageApi
                );

                datasetStateUpdater((state: State) => {
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

                if (stateData.shouldUploadToStorageApi) {
                    // Save now so that we don't end up with orphaned uploaded files
                    // if the user leaves without saving
                    await saveRuntimeStateToStorage(
                        datasetId,
                        datasetStateUpdater
                    );
                }
            } catch (e) {
                console.error(e);
                if (e instanceof UserVisibleError) {
                    datasetStateUpdater({
                        error: e
                    });
                }
            }
        }
        updateLastModifyDate(datasetStateUpdater);
    };

    return (
        <div className="file-drop-zone row justify-content-center">
            <div className="col-xs-12" onClick={onBrowse}>
                <FileDrop
                    onDrop={onDrop}
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
    );
};

export default FileDropZone;
