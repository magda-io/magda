import React, { useState } from "react";
import { useAsync } from "react-async-hook";
import defer from "helpers/defer";
import moment from "moment";
import { File, FileState } from "Components/Dataset/Add/DatasetAddCommon";
import "./DatasetLinkItem.scss";

import { AlwaysEditor } from "Components/Editing/AlwaysEditor";
import { dateEditor } from "Components/Editing/Editors/dateEditor";
import { getFormatIcon } from "../View/DistributionIcon";
import editIcon from "../../../assets/edit.svg";

import SlimTextInputWithValidation from "../Add/SlimTextInputWithValidation";
import * as ValidationManager from "./ValidationManager";
import ValidationRequiredLabel from "../../Dataset/Add/ValidationRequiredLabel";
import { MultilineTextEditor } from "Components/Editing/Editors/textEditor";

type Props = {
    file: File;
    idx: number;
    editFile: (updater: (file: File) => File) => void;
    className?: string;
};

type ProcessingProps = {
    file: File;
};

type EditViewProps = {
    file: File;
    idx: number;
    editFile: (updater: (file: File) => File) => void;
    editMode: boolean;
    setEditMode: (editMode: boolean) => void;
};

type CompleteViewProps = {
    file: File;
    editMode: boolean;
    setEditMode: (editMode: boolean) => void;
};

const DatasetLinkItemComplete = (props: CompleteViewProps) => {
    const file = props.file;

    const setEditMode = props.setEditMode;
    const editMode = props.editMode;

    return (
        <div className="dataset-link-item-complete">
            <button
                className={`edit-button au-btn au-btn--secondary`}
                arial-label="Edit file metadata"
                onClick={() => setEditMode(!editMode)}
            >
                <img src={editIcon} />
            </button>
            <div>
                <h3 className="link-item-title">{file.title}</h3>
                <div className="link-item-details">
                    <div>
                        <b>Format:</b> {file.format ? file.format : "N/A"}
                    </div>
                    <div>
                        <b>Last Modified:</b>{" "}
                        {moment(file.modified).format("DD/MM/YYYY")}
                    </div>
                    <div>
                        <b>URL:</b> {file.downloadURL}
                    </div>
                    <div>
                        <b>Service description:</b>{" "}
                        {file.description ? file.description : "N/A"}
                    </div>
                </div>
            </div>
        </div>
    );
};

const DatasetLinkItemProcessing = (props: ProcessingProps) => {
    const file = props.file;

    const progress = file._progress ? file._progress : 0;
    let width = Math.ceil((progress / 100) * 330);
    if (width < 5) width = 5;

    return (
        <div className="processing-item">
            <div className="file-in-progress">
                <div className="file-icon-area">
                    <img
                        className="format-icon"
                        src={getFormatIcon(
                            {
                                downloadURL: file.downloadURL
                            },
                            "gis"
                        )}
                    />
                    <div className="format-text">{file.format}</div>
                </div>
                <div className="file-info">
                    <div className="file-name">
                        <div className="file-name">{file.title}</div>
                    </div>
                    <div className="file-progress-bar">
                        <div
                            className="file-progress-bar-content"
                            style={{ width: `${width}px` }}
                        >
                            &nbsp;
                        </div>
                        <div
                            className="file-progress-bar-box"
                            style={{ width: `${width}px` }}
                        >
                            &nbsp;
                        </div>
                    </div>
                    <div className="file-status">
                        Reviewing service - {file._progress}% complete
                    </div>
                </div>
            </div>
        </div>
    );
};

const DatasetLinkItemEditing = (props: EditViewProps) => {
    const { idx, setEditMode, editMode, file, editFile } = props;

    const editFormat = (newValue: string | undefined) =>
        editFile(file => ({ ...file, format: newValue }));
    const editTitle = (newValue: string | undefined) =>
        editFile(file => ({ ...file, title: newValue ? newValue : "" }));
    const editModified = (newValue: Date | undefined) =>
        editFile(file =>
            typeof newValue === "undefined"
                ? file
                : { ...file, modified: newValue }
        );
    const editDescription = (newValue: string | undefined) =>
        editFile(file => ({
            ...file,
            description: newValue ? newValue : ""
        }));

    return (
        <div className="dataset-link-item-edit">
            <button
                className={`au-btn link-item-save-button`}
                arial-label="Save changes"
                onClick={() => {
                    if (
                        ValidationManager.validateFields([
                            `$.files[${idx}].title`,
                            `$.files[${idx}].format`
                        ])
                    ) {
                        setEditMode(!editMode);
                    }
                }}
            >
                Save
            </button>
            <div className="row">
                <div className="col-sm-6 title-field-input-area">
                    <span>
                        Title:&nbsp;&nbsp;{" "}
                        <ValidationRequiredLabel
                            validationFieldPath={`$.files[${idx}].title`}
                        />
                    </span>
                    &nbsp;&nbsp;
                    <SlimTextInputWithValidation
                        validationFieldLabel="Title"
                        validationFieldPath={`$.files[${idx}].title`}
                        value={file.title}
                        onChange={editTitle}
                        placeholder="Please enter title..."
                    />
                </div>
                <div className="col-sm-6 format-field-input-area">
                    <span>
                        Format:{" "}
                        <ValidationRequiredLabel
                            validationFieldPath={`$.files[${idx}].format`}
                        />
                    </span>
                    &nbsp;&nbsp;
                    <SlimTextInputWithValidation
                        validationFieldLabel="Format"
                        validationFieldPath={`$.files[${idx}].format`}
                        value={file.format}
                        onChange={editFormat}
                        placeholder="Please enter format..."
                    />
                </div>
            </div>
            <div className="row">
                <div className="col-sm-12">
                    <span>Last Modified: </span>
                    &nbsp;&nbsp;
                    <AlwaysEditor
                        value={file.modified}
                        onChange={editModified}
                        editor={dateEditor}
                    />
                </div>
            </div>
            <div className="row">
                <div className="col-sm-12 description-input-area">
                    <MultilineTextEditor
                        validationFieldPath={`$.files[${idx}].description`}
                        validationFieldLabel="Service Description"
                        value={file.description}
                        placeholder="Enter service description text..."
                        onChange={editDescription}
                    />
                </div>
            </div>
        </div>
    );
};

const DatasetLinkItem = (props: Props) => {
    const [editMode, setEditMode] = useState(false);

    useAsync(async () => {
        await defer(2000);
        props.editFile(file => ({ ...file, _state: FileState.Ready }));
        return {};
    }, [props.file.id]);

    if (props.file._state !== FileState.Ready) {
        return (
            <div
                className={`dataset-link-item-container ${
                    props.className ? props.className : ""
                }`}
            >
                <DatasetLinkItemProcessing file={props.file} />
            </div>
        );
    } else if (editMode) {
        return (
            <div className="dataset-link-item-container">
                <DatasetLinkItemEditing
                    idx={props.idx}
                    file={props.file}
                    editFile={props.editFile}
                    setEditMode={setEditMode}
                    editMode={editMode}
                />
            </div>
        );
    } else {
        return (
            <div className="dataset-link-item-container">
                <DatasetLinkItemComplete
                    file={props.file}
                    setEditMode={setEditMode}
                    editMode={editMode}
                />
            </div>
        );
    }
};

export default DatasetLinkItem;
