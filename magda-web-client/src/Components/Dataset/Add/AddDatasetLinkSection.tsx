import React, { useState } from "react";
import {
    File,
    FileState,
    FileSource
} from "Components/Dataset/Add/DatasetAddCommon";
import "./AddDatasetLinkSection.scss";

import isUrl from "is-url";
import uuid from "uuid";
import DatasetLinkItem from "./DatasetLinkItem";

type Props = {
    files: File[];
    addFile: (file: File) => void;
    editFile: (index: number) => (file: File) => void;
};

const AddDatasetLinkSection = (props: Props) => {
    const [url, setUrl] = useState("");
    const [validationErrorMessage, setValidationErrorMessage] = useState("");
    const files = props.files
        .map((item, idx) => ({ file: item, idx }))
        .filter(item => item.file.creationSource === FileSource.DatasetUrl);

    const fetchUrl = () => {
        if (!isUrl(url)) {
            setValidationErrorMessage("Please input an valid URL!");
        } else {
            setValidationErrorMessage("");
            const newFile: File = {
                id: uuid.v4(),
                downloadURL: url,
                creationSource: FileSource.DatasetUrl,
                title: "",
                modified: new Date(),
                datasetTitle: url,
                format: "",
                _state: FileState.Processing,
                _progress: 50
            };

            props.addFile(newFile);

            setTimeout(() => {
                const fileItem = files.find(
                    item => item.file.id === newFile.id
                );
                if (!fileItem) {
                    return;
                }
                const file = { ...fileItem.file, _state: FileState.Ready };
                props.editFile(fileItem.idx)(file);
            }, 20000);
        }
    };

    return (
        <div className="row add-dataset-link-section">
            <div className="col-sm-12">
                <h2 className="section-heading">
                    (and/or) Link to a dataset already hosted online
                </h2>
                {files.length ? (
                    <>
                        <div className="row link-items-section">
                            <div className="col-sm-12">
                                {files.map(item => (
                                    <DatasetLinkItem
                                        key={item.idx}
                                        file={item.file}
                                        editFile={props.editFile(item.idx)}
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="row link-items-section-heading">
                            <div className="col-sm-12">
                                <h2>More web services to add?</h2>
                            </div>
                        </div>
                    </>
                ) : null}
                <h4>What is the download URL?</h4>

                <div>
                    <span className="au-error-text">
                        {validationErrorMessage}
                    </span>
                </div>

                <input
                    className={`au-text-input ${
                        validationErrorMessage ? "invalid" : ""
                    }`}
                    placeholder="Enter the download URL"
                    onChange={e => setUrl(e.target.value)}
                    value={url}
                />

                <button className="au-btn fetch-button" onClick={fetchUrl}>
                    Fetch
                </button>
            </div>
        </div>
    );
};

export default AddDatasetLinkSection;
