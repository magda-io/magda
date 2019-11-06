import React from "react";
import { connect } from "react-redux";
import { withRouter, RouterProps } from "react-router";
import FileDrop from "react-file-drop";

import ToolTip from "Components/Dataset/Add/ToolTip";
import DatasetFile from "Components/Dataset/Add/DatasetFile";

import { getFiles } from "helpers/readFile";

import {
    State,
    File,
    FileState,
    saveState,
    KeywordsLike
} from "./DatasetAddCommon";
import withAddDatasetState from "./withAddDatasetState";
import uniq from "lodash/uniq";
import * as ValidationManager from "../Add/ValidationManager";

import "./DatasetAddFilesPage.scss";
import "./DatasetAddCommon.scss";

class DatasetAddFilesPage extends React.Component<
    { dataset: string; initialState: State } & RouterProps,
    State
> {
    state = this.props.initialState;

    constructor(props) {
        super(props);
        ValidationManager.setStateDataGetter(() => {
            return this.state;
        });
    }

    async onBrowse() {
        this.addFiles(await getFiles("*.*"));
    }

    async onDrop(fileList: FileList | null, event: any) {
        if (fileList) this.addFiles(fileList, event);
    }

    updateLastModifyDate() {
        this.setState(state => {
            const modifiedDates = state.files
                .filter(f => f.modified)
                .map(f => new Date(f.modified))
                .filter(d => !isNaN(d.getTime()))
                .map(d => d.getTime())
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
        for (let i = 0; i < fileList.length; i++) {
            const thisFile = fileList.item(i);

            if (this.isDirItem(i, event)) {
                // --- skip the directory item
                continue;
            }

            if (thisFile) {
                const newFile = {
                    datasetTitle: toTitleCase(
                        turnPunctuationToSpaces(
                            trimExtension(thisFile.name || "File Name")
                        )
                    ).trim(),
                    title: thisFile.name,
                    byteSize: thisFile.size,
                    modified: new Date(thisFile.lastModified),
                    format: fileFormat(thisFile),
                    _state: FileState.Added,
                    license: "world"
                };

                processFile(thisFile, update => {
                    this.setState(state => {
                        let newState = Object.assign({}, state, {
                            files: state.files.slice(0)
                        });
                        Object.assign(newFile, update);
                        return newState;
                    });
                }).then(() => {
                    this.setState(state => {
                        let newState = Object.assign({}, state, {
                            files: state.files.slice(0)
                        });

                        let file: any = newFile;
                        const {
                            dataset,
                            temporalCoverage,
                            spatialCoverage
                        } = state;
                        for (const key in file) {
                            // these fields don't belong in a distribution
                            switch (key) {
                                case "datasetTitle":
                                    if (
                                        !dataset["title"] ||
                                        dataset["title"] === ""
                                    ) {
                                        dataset["title"] = file[key];
                                    }
                                    file[key] = undefined;
                                    break;
                                case "keywords":
                                case "themes":
                                    const existing = dataset[key]
                                        ? (dataset[key] as KeywordsLike)
                                        : {
                                              keywords: [],
                                              derived: false
                                          };
                                    const fileKeywords: string[] =
                                        file[key] || [];

                                    dataset[key] = {
                                        keywords: uniq(
                                            existing.keywords.concat(
                                                fileKeywords
                                            )
                                        ),
                                        derived:
                                            existing.derived ||
                                            fileKeywords.length > 0
                                    };
                                    file[key] = undefined;
                                    break;
                                case "spatialCoverage":
                                    Object.assign(spatialCoverage, file[key]);
                                    file[key] = undefined;
                                    break;
                                case "temporalCoverage":
                                    temporalCoverage.intervals = temporalCoverage.intervals.concat(
                                        file[key].intervals
                                    );
                                    file[key] = undefined;
                                    break;
                            }
                        }

                        return newState;
                    });
                });

                this.setState(state => {
                    let newState = {
                        files: state.files.slice(0)
                    };
                    newState.files.push(newFile);
                    return newState;
                });
            }
        }
        this.updateLastModifyDate();
    };

    editFile = (index: number) => (file: File) => {
        this.setState(state => {
            const newFiles = state.files.concat();
            newFiles[index] = file;
            return {
                files: newFiles
            };
        });
        this.updateLastModifyDate();
    };

    deleteFile = (index: number) => () => {
        this.setState(state => {
            const newFiles = state.files.filter((item, idx) => {
                if (idx === index) return false;
                return true;
            });
            return {
                files: newFiles
            };
        });
    };

    render() {
        return (
            <div className="container-fluid dataset-add-file-page">
                <div className="row top-area-row">
                    <div className="col-xs-12 top-text-area">
                        <h1>Add files to pre-populate metadata</h1>
                        <p>
                            Upload all the files in your dataset so our
                            Publishing Tool can review the file contents and
                            pre-populate metadata.
                        </p>
                        <p>
                            All our processing happens in your internet browser,
                            so do not store a copy of your files, and you can
                            edit or delete the metadata at any time.
                        </p>
                    </div>

                    {this.state.files.length > 0 && (
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
                            {this.state.files.map((file: File, i) => {
                                return (
                                    <div
                                        key={i}
                                        className="col-xs-6 dataset-add-files-fileListItem"
                                    >
                                        <DatasetFile
                                            idx={i}
                                            file={file}
                                            onChange={this.editFile(i)}
                                            onDelete={this.deleteFile(i)}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                        {this.state.files.length > 0 && (
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

                <div
                    className="row next-save-button-row"
                    style={{ marginTop: "6em" }}
                >
                    <div className="col-xs-12">
                        {this.state.files.filter(
                            (file: File) => file._state === FileState.Ready
                        ).length === this.state.files.length && (
                            <React.Fragment>
                                <button
                                    className="au-btn next-button"
                                    onClick={this.reviewMetadata.bind(this)}
                                >
                                    Next: Review Metadata
                                </button>
                                <button
                                    className="au-btn au-btn--secondary save-button"
                                    onClick={this.saveAndExit.bind(this)}
                                >
                                    Save and Exit
                                </button>
                            </React.Fragment>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    saveAndExit() {
        saveState(this.state, this.props.dataset);
        this.props.history.push(`/dataset/list`);
    }

    reviewMetadata() {
        const id = saveState(this.state, this.props.dataset);
        this.props.history.push(`/dataset/add/metadata/${id}/0`);
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
    return str.replace(/\w\S*/g, function(txt) {
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
        fileReader.onload = function() {
            resolve(this.result as ArrayBuffer);
        };
        fileReader.readAsArrayBuffer(file);
    });
}

async function processFile(thisFile: any, update: Function) {
    update({ _state: FileState.Reading });

    const input: any = {
        file: thisFile
    };

    input.arrayBuffer = await readFileAsArrayBuffer(thisFile);
    input.array = new Uint8Array(input.arrayBuffer);

    update({ _state: FileState.Processing });

    const runExtractors = await import("Components/Dataset/MetadataExtraction").then(
        mod => mod.runExtractors
    );

    await runExtractors(input, update);

    update({ _state: FileState.Ready });
}

function mapStateToProps(state, old) {
    let dataset = old.match.params.dataset;
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

export default withAddDatasetState(
    withRouter(connect(mapStateToProps)(DatasetAddFilesPage))
);
