import React from "react";

import Breadcrumbs from "../../../UI/Breadcrumbs";

import Styles from "./NewDataset.module.scss";

import { Medium } from "../../../UI/Responsive";
import FileDrop from "react-file-drop";

const PUNCTUATION_REGEX = /[-_]+/g;

type File = {
    filename: string;
    title: string;
    size: number;
    lastModified: Date;
    isEditing?: boolean;
};

type State = {
    files: File[];
};

function trimExtension(filename: string) {
    return filename.substr(0, filename.lastIndexOf(".")) || filename;
}

function turnPunctuationToSpaces(filename: string) {
    return filename.replace(PUNCTUATION_REGEX, " ");
}

function toTitleCase(str: string) {
    return str.replace(/\w\S*/g, function(txt) {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
}
export default class NewDataset extends React.Component<{}, State> {
    state: State = {
        files: []
    };

    onDrop = (fileList: FileList, event: React.DragEvent<HTMLDivElement>) => {
        try {
            const newFilesToAdd: File[] = [];
            for (let i = 0; i < fileList.length; i++) {
                const thisFile = fileList.item(i);

                if (thisFile) {
                    newFilesToAdd.push({
                        title: toTitleCase(
                            turnPunctuationToSpaces(
                                trimExtension(thisFile.name || "File Name")
                            )
                        ).trim(),
                        filename: thisFile.name,
                        size: thisFile.size,
                        lastModified: new Date(thisFile.lastModified)
                    });
                }
            }

            this.setState(state => {
                return {
                    files: state.files.concat(newFilesToAdd)
                };
            });
        } catch (e) {
            console.error(e);
        }
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
                            <span>Drag files here</span>
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
                                        <div>Filename: {file.filename}</div>
                                        <div>
                                            Last Modified:{" "}
                                            {file.lastModified.toString()}
                                        </div>
                                        <div>Size: {file.size}</div>
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
