import React, { useState } from "react";
import Moment from "moment";

import { AlwaysEditor } from "Components/Editing/AlwaysEditor";
import { textEditor } from "Components/Editing/Editors/textEditor";
import { dateEditor } from "Components/Editing/Editors/dateEditor";

import FileIcon from "Components/Common/FileIcon";

import humanFileSize from "helpers/humanFileSize";

import { FileState, File, fileStateToText } from "./DatasetAddCommon";

import editIcon from "../../../assets/edit.svg";
import dismissIcon from "../../../assets/dismiss.svg";

import "./DatasetFile.scss";

function FileInProgress({
    file,
    onDelete
}: {
    file: File;
    onDelete: () => void;
}) {
    const progress = file._progress ? file._progress : 0;
    let width = Math.ceil((progress / 100) * 330);
    if (width < 5) width = 5;
    return (
        <div className="dataset-file-root">
            <div className="file-in-progress">
                <button
                    className={`dataset-file-delete-button au-btn au-btn--secondary`}
                    arial-label="Remove file"
                    onClick={() => onDelete()}
                >
                    <img src={dismissIcon} />
                </button>
                <div className="file-icon-area">
                    <FileIcon width="48px" text={file.format} />
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
                        {fileStateToText(file._state)} - {file._progress}%
                        complete
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function DatasetFile({
    file,
    onDelete,
    onChange
}: {
    file: File;
    onDelete: () => void;
    onChange: (file: File) => void;
}) {
    if (file._state !== FileState.Ready) {
        return <FileInProgress file={file} onDelete={onDelete} />;
    }

    const editFormat = (newValue: string | undefined) =>
        onChange({ ...file, format: newValue });
    const editModified = (newValue: Date | undefined) =>
        onChange({ ...file, modified: newValue! });
    const [editMode, setEditMode] = useState(false);

    return (
        <div className="dataset-file-root complete-processing">
            {editMode ? (
                <div>
                    <button
                        className={`au-btn dataset-file-save-button`}
                        arial-label="Save changes"
                        onClick={() => setEditMode(!editMode)}
                    >
                        Save
                    </button>
                    <div>
                        <span>Format: </span>
                        &nbsp;&nbsp;
                        <AlwaysEditor
                            value={file.format}
                            onChange={editFormat}
                            editor={textEditor}
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
            ) : (
                <React.Fragment>
                    <button
                        className={`dataset-file-edit-button au-btn au-btn--secondary`}
                        arial-label="Edit file metadata"
                        onClick={() => setEditMode(!editMode)}
                    >
                        <img src={editIcon} />
                    </button>
                    <button
                        className={`dataset-file-delete-button au-btn au-btn--secondary`}
                        arial-label="Remove file"
                        onClick={() => onDelete()}
                    >
                        <img src={dismissIcon} />
                    </button>
                    <div>
                        <h3 className="dataset-file-file-title">
                            {file.title}
                        </h3>
                        <div className="file-info">
                            <div>Format: {file.format}</div>
                            <div>
                                Size: {humanFileSize(file.byteSize, false)}
                            </div>
                            <div>
                                Last Modified:{" "}
                                {Moment(file.modified).format("DD/MM/YYYY")}
                            </div>
                        </div>
                    </div>
                </React.Fragment>
            )}
        </div>
    );
}
