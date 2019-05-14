import React, { useState } from "react";
import Moment from "moment";

import { AlwaysEditor } from "Components/Editing/AlwaysEditor";
import { textEditor } from "Components/Editing/Editors/textEditor";
import { dateEditor } from "Components/Editing/Editors/dateEditor";

import { File } from "./DatasetAddCommon";

import humanFileSize from "helpers/humanFileSize";

import Styles from "./DatasetFile.module.scss";

export default function DatasetFile({
    file,
    onChange
}: {
    file: File;
    onChange: (file: File) => void;
}) {
    const editFormat = (newValue: string) =>
        onChange({ ...file, format: newValue });
    const editModified = (newValue: Date) =>
        onChange({ ...file, modified: newValue });
    const [editMode, setEditMode] = useState(false);

    return (
        <section className={Styles.root}>
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
                        <h3 className={Styles.fileTitle}>{file.title}</h3>

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
                            className={`${
                                Styles.editButton
                            } au-btn au-btn--secondary`}
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
