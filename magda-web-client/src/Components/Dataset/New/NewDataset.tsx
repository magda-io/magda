import React from "react";

import Breadcrumbs from "../../../UI/Breadcrumbs";

import Styles from "./NewDataset.module.scss";

import { Medium } from "../../../UI/Responsive";
import FileDrop from "react-file-drop";

type File = {
    name: string;
};

type State = {
    files: File[];
};

function trimExtension(filename: string) {
    return filename.substr(0, filename.lastIndexOf(".")) || filename;
}

const PUNCTUATION_REGEX = /[-_]+/g;

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
        const newFilesToAdd: File[] = [];
        for (let i = 0; i < fileList.length; i++) {
            const thisFile = fileList.item(i);

            if (thisFile) {
                newFilesToAdd.push({
                    name: toTitleCase(
                        turnPunctuationToSpaces(
                            trimExtension(thisFile.name || "File Name")
                        )
                    ).trim()
                });
            }
        }

        this.setState(state => {
            return {
                files: state.files.concat(newFilesToAdd)
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
                name: newName
            };

            return {
                files: newFiles
            };
        });
    };

    render() {
        return (
            <div className="">
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

                    <div className="col-sm-12">
                        You can add a dataset to your catalogue by uploading all
                        the files within that dataset. Magda's publishing tool
                        will help you check for duplicates and create high
                        quality metadata for your catalogue.
                    </div>

                    <div className="col-sm-8">
                        <FileDrop
                            onDrop={this.onDrop}
                            className={Styles.dropZone}
                        >
                            Drag files here
                        </FileDrop>
                    </div>

                    <div className="col-sm-8">
                        <h2>Files</h2>
                        <div>
                            {this.state.files.map((file, i) => {
                                return (
                                    <div key={i}>
                                        <input
                                            defaultValue={file.name}
                                            onChange={this.editFileName(i)}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}
