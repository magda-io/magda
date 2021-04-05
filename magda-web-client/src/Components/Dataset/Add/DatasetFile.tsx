import React, { useState } from "react";
import Moment from "moment";

import { AlwaysEditor } from "Components/Editing/AlwaysEditor";
import { dateEditor } from "Components/Editing/Editors/dateEditor";

import { getFormatIcon } from "../View/DistributionIcon";

import humanFileSize from "helpers/humanFileSize";

import {
    Distribution,
    DistributionState,
    distributionStateToText,
    DistributionCreationMethod
} from "./DatasetAddCommon";

import editIcon from "../../../assets/edit.svg";
import dismissIcon from "../../../assets/dismiss.svg";
import SlimTextInputWithValidation from "../Add/SlimTextInputWithValidation";
import * as ValidationManager from "./ValidationManager";

import TooltipWrapper from "Components/Common/TooltipWrapper";
import helpIcon from "assets/help.svg";

import ValidationRequiredLabel from "../../Dataset/Add/ValidationRequiredLabel";

import "./DatasetFile.scss";

function FileInProgress({
    file,
    className
}: {
    file: Distribution;
    className?: string;
}) {
    const progress = file._progress ? file._progress : 0;
    let width = Math.ceil((progress / 100) * 330);
    if (width < 5) {
        width = 5;
    }
    return (
        <div className={`dataset-file-root ${className ? className : ""}`}>
            <div className="file-in-progress">
                <div className="file-icon-area">
                    <img
                        alt="format icon"
                        className="format-icon"
                        src={getFormatIcon(file)}
                    />
                    <div className="format-text">{file.format}</div>
                </div>
                <div className="file-info">
                    <div className="file-name-size">
                        <div className="file-name">{file.title}</div>
                        <div className="file-size">
                            ({humanFileSize(file.byteSize, true)})
                        </div>
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
                        {distributionStateToText(file._state)} - {progress}%
                        complete
                    </div>
                </div>
            </div>
        </div>
    );
}

const FileEditView = ({
    idx,
    file,
    onChange,
    editMode,
    setEditMode
}: {
    idx: number;
    file: Distribution;
    onChange: (updater: (file: Distribution) => Distribution) => void;
    editMode: boolean;
    setEditMode: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
    const editFormat = (newValue: string | undefined) =>
        onChange((file) => ({ ...file, format: newValue }));
    const editTitle = (newValue: string | undefined) =>
        onChange((file) => ({ ...file, title: newValue ? newValue : "" }));
    const editModified = (newValue: Date | undefined) =>
        onChange((file) =>
            typeof newValue === "undefined"
                ? file
                : { ...file, modified: newValue }
        );

    return (
        <div>
            <button
                className={`au-btn dataset-file-save-button`}
                arial-label="Save changes"
                onClick={() => {
                    if (
                        ValidationManager.validateFields([
                            `$.distributions[${idx}].title`,
                            `$.distributions[${idx}].format`
                        ])
                    ) {
                        setEditMode(!editMode);
                        if (file?._state !== DistributionState.Ready) {
                            onChange((file) => ({
                                ...file,
                                _state: DistributionState.Ready
                            }));
                        }
                    }
                }}
            >
                Save
            </button>
            <div>
                <span>
                    Name:&nbsp;&nbsp;{" "}
                    <ValidationRequiredLabel
                        validationFieldPath={`$.distributions[${idx}].title`}
                    />
                </span>
                &nbsp;&nbsp;
                <SlimTextInputWithValidation
                    validationFieldLabel="File Name"
                    validationFieldPath={`$.distributions[${idx}].title`}
                    value={file.title}
                    onChange={editTitle}
                    placeholder="Please enter file name..."
                />
            </div>
            <div>
                <span>
                    Format:{" "}
                    <ValidationRequiredLabel
                        validationFieldPath={`$.distributions[${idx}].format`}
                    />
                </span>
                &nbsp;&nbsp;
                <SlimTextInputWithValidation
                    validationFieldLabel="File Format"
                    validationFieldPath={`$.distributions[${idx}].format`}
                    value={file.format}
                    onChange={editFormat}
                    placeholder="Please enter file format..."
                />
            </div>
            <div>
                <span>Last Modified: </span>
                &nbsp;&nbsp;
                <AlwaysEditor
                    value={file.modified}
                    onChange={editModified}
                    editor={dateEditor}
                />
            </div>
        </div>
    );
};

type Props = {
    distribution: Distribution;
    idx?: number;
    className?: string;
    onDelete?: () => any;
    onChange?: (updater: (file: Distribution) => Distribution) => void;
};

export default function DatasetFile({
    idx,
    distribution,
    className,
    onDelete,
    onChange
}: Props) {
    const [editMode, setEditMode] = useState(
        distribution?.creationMethod === DistributionCreationMethod.Manual &&
            distribution?._state === DistributionState.Drafting
    );
    const canEdit =
        typeof idx !== "undefined" && typeof onChange === "function";
    const canDelete = typeof onDelete === "function";

    const file = distribution;

    if (
        file._state !== DistributionState.Ready &&
        file._state !== DistributionState.Drafting
    ) {
        return <FileInProgress file={file} className={className} />;
    }

    return (
        <div
            className={`dataset-file-root complete-processing ${
                !canEdit && !canDelete ? "read-only" : ""
            } ${className ? className : ""}`}
        >
            {editMode && canEdit ? (
                <FileEditView
                    idx={idx!}
                    file={file}
                    onChange={onChange!}
                    editMode={editMode}
                    setEditMode={setEditMode}
                />
            ) : (
                <React.Fragment>
                    {canEdit ? (
                        <button
                            className={`dataset-file-edit-button au-btn au-btn--secondary`}
                            arial-label="Edit file metadata"
                            onClick={() => setEditMode(!editMode)}
                        >
                            <img src={editIcon} alt="edit icon" />
                        </button>
                    ) : null}

                    {canDelete ? (
                        <button
                            className={`dataset-file-delete-button au-btn au-btn--secondary`}
                            arial-label="Remove file"
                            onClick={() => onDelete!()}
                        >
                            <img src={dismissIcon} alt="delete icon" />
                        </button>
                    ) : null}

                    <div>
                        <h3 className="dataset-file-file-title">
                            {file.title}
                        </h3>
                        <div className="file-info">
                            <div>
                                <b>Format:</b> {file.format}
                            </div>
                            <div>
                                <b>Size:</b>{" "}
                                {humanFileSize(file.byteSize, false)}
                                <span className="tooltip-container">
                                    <TooltipWrapper
                                        className="tooltip tooltip-human-file-size"
                                        launcher={() => (
                                            <div className="tooltip-launcher-icon help-icon">
                                                <img
                                                    src={helpIcon}
                                                    alt="Note: 1 KiB = 1024 Bytes, 1 MiB = 1024 KiB"
                                                />
                                            </div>
                                        )}
                                        innerElementClassName="inner"
                                    >
                                        {() => {
                                            return (
                                                <div>
                                                    <div>
                                                        Note: 1 KiB = 1024 Bytes
                                                    </div>
                                                    <div>1 MiB = 1024 KiB</div>
                                                </div>
                                            );
                                        }}
                                    </TooltipWrapper>
                                </span>
                            </div>
                            <div>
                                <b>Last Modified:</b>{" "}
                                {Moment(file.modified).format("DD/MM/YYYY")}
                            </div>
                        </div>
                    </div>
                </React.Fragment>
            )}
        </div>
    );
}
