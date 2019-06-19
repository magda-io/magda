import React, { useState } from "react";
import Moment from "moment";

import { AlwaysEditor } from "Components/Editing/AlwaysEditor";
import { textEditor } from "Components/Editing/Editors/textEditor";
import { dateEditor } from "Components/Editing/Editors/dateEditor";

import { getFormatIcon } from "../View/DistributionIcon";

import humanFileSize from "helpers/humanFileSize";

import { FileState, File, fileStateToText } from "./DatasetAddCommon";

import "./DatasetFile.scss";

function FileInProgress({ file }: { file: File }) {
    const progress = file._progress ? file._progress : 0;
    let width = Math.ceil((progress / 100) * 330);
    if (width < 5) width = 5;
    return (
        <div className="dataset-file-root">
            <div className="file-in-progress">
                <div className="file-icon-area">
                    <img className="format-icon" src={getFormatIcon(file)} />
                    <div className="format-text">{file.format}</div>
                </div>
                <div className="file-info">
                    <div className="file-name">
                        {file.title} ({humanFileSize(file.byteSize, true)})
                    </div>
                    <div
                        className="file-progress-bar"
                        style={{ width: `${width}px` }}
                    >
                        &nbsp;
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
    onChange
}: {
    file: File;
    onChange: (file: File) => void;
}) {
    if (file._state !== FileState.Ready) {
        return <FileInProgress file={file} />;
    }

    const editFormat = (newValue: string | undefined) =>
        onChange({ ...file, format: newValue });
    const editModified = (newValue: Date | undefined) =>
        onChange({ ...file, modified: newValue! });
    const [editMode, setEditMode] = useState(false);

    return (
        <section className="dataset-file-root complete-processing">
            {editMode ? (
                <div>
                    <div>
                        <strong>Format: </strong>{" "}
                        <AlwaysEditor
                            value={file.format}
                            onChange={editFormat}
                            editor={textEditor}
                        />
                    </div>
                    <div>
                        <strong>Size: </strong>{" "}
                        {humanFileSize(file.byteSize, false)}
                    </div>
                    <div>
                        <strong>Last Modified: </strong>{" "}
                        <AlwaysEditor
                            value={file.modified}
                            onChange={editModified}
                            editor={dateEditor}
                        />
                    </div>
                    <div>
                        <button
                            className={`au-btn`}
                            onClick={() => setEditMode(!editMode)}
                        >
                            Save
                        </button>
                    </div>
                </div>
            ) : (
                <React.Fragment>
                    <div>
                        <h3 className="dataset-file-fileTitle">{file.title}</h3>
                        <img src={getFormatIcon(file)} />
                        <div>
                            <strong>Format: </strong> {file.format}
                        </div>
                        <div>
                            <strong>Size: </strong>{" "}
                            {humanFileSize(file.byteSize, false)}
                        </div>
                        <div>
                            <strong>Last Modified: </strong>{" "}
                            {Moment(file.modified).format("DD/MM/YYYY")}
                        </div>
                    </div>
                    <div>
                        <button
                            className={`dataset-file-editButton au-btn au-btn--secondary`}
                            onClick={() => setEditMode(!editMode)}
                        >
                            {/* TODO: Replace with an actual icon */}✎
                        </button>
                    </div>
                </React.Fragment>
            )}
        </section>
    );
}
