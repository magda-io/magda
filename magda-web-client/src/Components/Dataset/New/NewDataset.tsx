import React from "react";
import FileDrop from "react-file-drop";

import Breadcrumbs from "../../../UI/Breadcrumbs";
import { Medium } from "../../../UI/Responsive";
import Spinner from "../../Spinner";
import getDateString from "../../../helpers/getDateString";

import Styles from "./NewDataset.module.scss";

const PUNCTUATION_REGEX = /[-_]+/g;

// different extractors/processors
import { extractText } from "./extractText";
import { extractEqualHash } from "./extractEqualHash";
import { extractSimilarFingerprint } from "./extractSimilarFingerprint";
import { extractExtents } from "./extractExtents";
import { extractKeywords } from "./extractKeywords";

const extractors = [
    extractText,
    extractEqualHash,
    extractSimilarFingerprint,
    extractExtents,
    extractKeywords
];

type File = {
    filename: string;
    title: string;
    size: number;
    lastModified: Date;
    isEditing?: boolean;
    description?: string;
    author?: string;
    keywords?: string[];
    temporalExtent?: any;
    spatialExtent?: any;
    similarFingerprint?: any;
    equalHash?: string;
};

type State = {
    files: File[];
    processing: boolean;
};

function trimExtension(filename: string) {
    return filename.substr(0, filename.lastIndexOf(".")) || filename;
}

function turnPunctuationToSpaces(filename: string) {
    return filename.replace(PUNCTUATION_REGEX, " ");
}

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

function stringSummarise(item: any, length: number = 100): any {
    let str = typeof item === "object" ? JSON.stringify(item) : item.toString();
    if (str.length > length) {
        str = str.substr(0, length - 3) + "...";
    }
    return str;
}

function humanFileSize(bytes, si) {
    var thresh = si ? 1000 : 1024;
    if (Math.abs(bytes) < thresh) {
        return bytes + " B";
    }
    var units = si
        ? ["kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"]
        : ["KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];
    var u = -1;
    do {
        bytes /= thresh;
        ++u;
    } while (Math.abs(bytes) >= thresh && u < units.length - 1);
    return bytes.toFixed(1) + " " + units[u];
}

export default class NewDataset extends React.Component<{}, State> {
    state: State = {
        files: [],
        processing: false
    };

    fileList: FileList | null = null;

    onDrop = async (
        fileList: FileList,
        event: React.DragEvent<HTMLDivElement>
    ) => {
        try {
            this.fileList = fileList;
            this.setState({
                processing: true
            });
        } catch (e) {
            console.error(e);
        }
    };

    componentDidUpdate() {
        if (this.fileList) {
            this.addFiles();
        }
    }

    addFiles = async () => {
        const fileList = this.fileList!;
        this.fileList = null;

        const newFilesToAdd: File[] = [];
        for (let i = 0; i < fileList.length; i++) {
            const thisFile = fileList.item(i);

            if (thisFile) {
                const newFile = {
                    title: toTitleCase(
                        turnPunctuationToSpaces(
                            trimExtension(thisFile.name || "File Name")
                        )
                    ).trim(),
                    filename: thisFile.name,
                    size: thisFile.size,
                    lastModified: new Date(thisFile.lastModified)
                };

                // done it this way to minimise duplicate content reading/processing
                const input: any = {
                    file: thisFile
                };

                input.arrayBuffer = await readFileAsArrayBuffer(thisFile);
                input.array = new Uint8Array(input.arrayBuffer);

                for (const extractor of extractors) {
                    try {
                        await extractor(input, newFile);
                    } catch (e) {
                        // even if one of the modules fail, we keep going
                        console.error(e);
                    }
                }

                newFilesToAdd.push(newFile);
            }
        }

        this.setState(state => {
            return {
                files: state.files.concat(newFilesToAdd),
                processing: false
            };
        });
    };

    editFileName = (index: number) => (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        const newName = event.target.value;
        this.setState(state => {
            const newFiles = state.files.concat();
            newFiles[index] = {
                ...newFiles[index],
                title: newName
            };

            return {
                files: newFiles
            };
        });
    };

    toggleEditingFile = (index: number) => (
        event: React.MouseEvent<HTMLButtonElement>
    ) => {
        this.setState(state => {
            const newFiles = state.files.concat();
            newFiles[index] = {
                ...newFiles[index],
                isEditing: !newFiles[index].isEditing
            };

            return {
                files: newFiles
            };
        });
    };

    render() {
        return (
            <div className={Styles.root}>
                <Medium>
                    <Breadcrumbs
                        breadcrumbs={[
                            <li key="datasets">
                                <span>Datasets</span>
                            </li>,
                            <li key="new dataset">
                                <span>Add</span>
                            </li>
                        ]}
                    />
                </Medium>

                <div className="row">
                    <div className="col-sm-12">
                        <h1>Add a Dataset</h1>
                    </div>
                </div>

                <div className="row">
                    <div className="col-sm-12">
                        You can add a dataset to your catalogue by uploading all
                        the files within that dataset. Magda's publishing tool
                        will help you check for duplicates and create high
                        quality metadata for your catalogue.
                    </div>
                </div>

                <div className="row justify-content-center">
                    <div className="col-sm-12">
                        <FileDrop
                            onDrop={this.onDrop}
                            className={Styles.dropZone}
                            targetClassName={Styles.dropTarget}
                        >
                            {this.state.processing ? (
                                <Spinner width="5em" height="5em" />
                            ) : (
                                <span>Drag files here</span>
                            )}
                        </FileDrop>
                    </div>
                </div>

                <div className="row">
                    <div className="col-sm-8">
                        <h2>Files</h2>
                        <ul>
                            {this.state.files.map((file, i) => {
                                return (
                                    <li key={i}>
                                        <h3>
                                            {file.isEditing ? (
                                                <input
                                                    defaultValue={file.title}
                                                    onChange={this.editFileName(
                                                        i
                                                    )}
                                                />
                                            ) : (
                                                <React.Fragment>
                                                    {file.title}
                                                </React.Fragment>
                                            )}

                                            <button
                                                onClick={this.toggleEditingFile(
                                                    i
                                                )}
                                            >
                                                {file.isEditing
                                                    ? "Save"
                                                    : "Edit"}
                                            </button>
                                        </h3>

                                        <div>
                                            <div>
                                                <strong>Filename: </strong>{" "}
                                                {file.filename}
                                            </div>
                                            <div>
                                                <strong>Size: </strong>{" "}
                                                {humanFileSize(
                                                    file.size,
                                                    false
                                                )}
                                            </div>
                                            <div>
                                                <strong>Last Modified: </strong>{" "}
                                                {getDateString(
                                                    file.lastModified.toString()
                                                )}
                                            </div>
                                            {file.keywords && (
                                                <div>
                                                    <strong>Keywords: </strong>{" "}
                                                    {file.keywords.join(", ")}
                                                </div>
                                            )}
                                            {file.author && (
                                                <div>
                                                    <strong>Author: </strong>{" "}
                                                    {file.author}
                                                </div>
                                            )}
                                            {file.spatialExtent && (
                                                <div>
                                                    <strong>
                                                        Spatial Extent:{" "}
                                                    </strong>{" "}
                                                    Latitude:{" "}
                                                    {file.spatialExtent!.minLat}{" "}
                                                    to{" "}
                                                    {file.spatialExtent!.maxLat}
                                                    , Longitude{" "}
                                                    {file.spatialExtent!.minLng}{" "}
                                                    to{" "}
                                                    {file.spatialExtent!.maxLng}
                                                </div>
                                            )}
                                            {file.temporalExtent && (
                                                <div>
                                                    <strong>
                                                        Time Extent:{" "}
                                                    </strong>{" "}
                                                    {getDateString(
                                                        file.temporalExtent.earliestStart.toString()
                                                    )}{" "}
                                                    to{" "}
                                                    {getDateString(
                                                        file.temporalExtent.latestEnd.toString()
                                                    )}
                                                </div>
                                            )}

                                            <div>
                                                <strong>Exact Hash:</strong>{" "}
                                                {file.equalHash}
                                            </div>

                                            <div>
                                                <strong>Fingerprint</strong>{" "}
                                                {Object.values(
                                                    file.similarFingerprint
                                                )
                                                    .filter(x => x !== 0)
                                                    .join(" ")}
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </div>
            </div>
        );
    }
}
