import React from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router";
import FileDrop from "react-file-drop";

import Breadcrumbs from "Components/Common/Breadcrumbs";
import { Medium } from "Components/Common/Responsive";
import ProgressBar2 from "Components/Common/ProgressBar2";

import humanFileSize from "helpers/humanFileSize";
import { getFiles } from "helpers/readFile";

import Styles from "./DatasetAddFilesPage.module.scss";

import { AlwaysEditor } from "Components/Editing/AlwaysEditor";

import { textEditor } from "Components/Editing/Editors/textEditor";

import {
    State,
    File,
    FileState,
    createBlankState,
    loadState,
    saveState
} from "./DatasetAddCommon";

class DatasetAddFilesPage extends React.Component<{ dataset: string }, State> {
    state = createBlankState();

    componentDidMount() {
        this.setState(state =>
            Object.assign({}, state, loadState(this.props.dataset))
        );
    }

    async onBrowse() {
        this.addFiles(await getFiles("*.*"));
    }

    async onDrop(fileList: FileList) {
        this.addFiles(fileList);
    }

    addFiles = async (fileList: FileList) => {
        for (let i = 0; i < fileList.length; i++) {
            const thisFile = fileList.item(i);

            if (thisFile) {
                const newFile = {
                    datasetTitle: toTitleCase(
                        turnPunctuationToSpaces(
                            trimExtension(thisFile.name || "File Name")
                        )
                    ).trim(),
                    title: thisFile.name,
                    byteSize: thisFile.size,
                    modified: new Date(thisFile.lastModified)
                        .toISOString()
                        .substr(0, 10),
                    format: thisFile.type,
                    _state: FileState.Added
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
                                        dataset["title"] === "Untitled"
                                    ) {
                                        dataset["title"] = file[key];
                                    }
                                    file[key] = undefined;
                                    break;
                                case "keywords":
                                case "themes":
                                    let value1: string[] = dataset[key] || [];
                                    let value2: string[] = file[key] || [];
                                    dataset[key] = value1.concat(value2);
                                    file[key] = undefined;
                                    break;

                                case "author":
                                    dataset.contactPoint =
                                        dataset.contactPoint || "";
                                    dataset.contactPoint += file.author;
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
    };

    editFile = (index: number, field: string) => (newName: string) => {
        this.setState(state => {
            const newFiles = state.files.concat();
            newFiles[index][field] = newName;
            return {
                files: newFiles
            };
        });
    };

    render() {
        return (
            <div className="container-fluid">
                <Medium>
                    <Breadcrumbs
                        breadcrumbs={[
                            <li key="datasets">
                                <span>Add data</span>
                            </li>
                        ]}
                    />
                </Medium>

                <div className="row">
                    <div className="col-xs-12">
                        <h1>Upload files to pre-populate metadata</h1>
                        <p>
                            Upload all the files in your dataset so our
                            Publishing Tool can review the file contents and
                            pre-populate metadata at any time.
                        </p>
                        <p>
                            All our processing happens in your internet browser,
                            so do not store a copy of your files, and you can
                            edit or delete the metadata at any time.
                        </p>
                    </div>
                </div>

                <div className="row justify-content-center">
                    <div
                        className="col-xs-12"
                        onClick={this.onBrowse.bind(this)}
                    >
                        <FileDrop
                            onDrop={this.onDrop.bind(this)}
                            className={Styles.dropZone}
                            targetClassName={Styles.dropTarget}
                        >
                            <span>Drag your files or click here</span>
                        </FileDrop>
                    </div>
                </div>

                <div className="row">
                    <div className="col-xs-12">
                        <ul>
                            {this.state.files.map((file: File, i) => {
                                return (
                                    <li key={i}>
                                        <h3>
                                            <AlwaysEditor
                                                value={file.title}
                                                onChange={this.editFile(
                                                    i,
                                                    "title"
                                                )}
                                                editor={textEditor}
                                            />
                                        </h3>

                                        {file._state === FileState.Ready ? (
                                            <div>
                                                <div>
                                                    <strong>Size: </strong>{" "}
                                                    {humanFileSize(
                                                        file.byteSize,
                                                        false
                                                    )}
                                                </div>
                                                <div>
                                                    <strong>
                                                        Last Modified:{" "}
                                                    </strong>{" "}
                                                    {file.modified}
                                                </div>
                                                <div>
                                                    <strong>License: </strong>{" "}
                                                    <AlwaysEditor
                                                        value={file.license}
                                                        onChange={this.editFile(
                                                            i,
                                                            "license"
                                                        )}
                                                        editor={textEditor}
                                                    />
                                                </div>
                                                <div>
                                                    <strong>Format: </strong>{" "}
                                                    <AlwaysEditor
                                                        value={file.format}
                                                        onChange={this.editFile(
                                                            i,
                                                            "format"
                                                        )}
                                                        editor={textEditor}
                                                    />
                                                </div>
                                                {file.equalHash && (
                                                    <div>
                                                        <strong>
                                                            Exact Hash:
                                                        </strong>{" "}
                                                        {file.equalHash}
                                                    </div>
                                                )}

                                                {file.similarFingerprint && (
                                                    <div>
                                                        <strong>
                                                            Fingerprint
                                                        </strong>{" "}
                                                        {Object.values(
                                                            file.similarFingerprint
                                                        )
                                                            .filter(
                                                                x => x !== 0
                                                            )
                                                            .join(" ")}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div>
                                                <ProgressBar2
                                                    progress={file._progress}
                                                    text={
                                                        FileState[file._state]
                                                    }
                                                />
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </div>

                <div className="row" style={{ marginTop: "3em" }}>
                    <div className="col-xs-12">
                        {this.state.files.filter(
                            (file: File) => file._state === FileState.Ready
                        ).length === this.state.files.length && (
                            <React.Fragment>
                                <button
                                    className="au-btn au-btn--secondary"
                                    onClick={this.saveAndExit.bind(this)}
                                >
                                    Save and Exit
                                </button>
                                <button
                                    className="au-btn"
                                    style={{ float: "right" }}
                                    onClick={this.reviewMetadata.bind(this)}
                                >
                                    Next: Review Metadata
                                </button>
                            </React.Fragment>
                        )}
                        <br />
                        <a
                            className="au-btn au-btn--tertiary"
                            href="/dataset/add"
                        >
                            Escape Hatch
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    saveAndExit() {
        saveState(this.state, this.props.dataset);
        window.location.href = `/dataset/list`;
    }

    reviewMetadata() {
        const id = saveState(this.state, this.props.dataset);
        window.location.href = `/dataset/add/metadata/${id}/0`;
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

export default withRouter(connect(mapStateToProps)(DatasetAddFilesPage));
