import React from "react";
import { File, FileState } from "Components/Dataset/Add/DatasetAddCommon";
import "./DatasetLinkItem.scss";

import { getFormatIcon } from "../View/DistributionIcon";

type Props = {
    file: File;
    editFile: (file: File) => void;
};

const DatasetLinkItemProcessing = (props: { file: File }) => {
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
                        <div className="file-name">{file.datasetTitle}</div>
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

const DatasetLinkItem = (props: Props) => {
    return (
        <div className="dataset-link-item-container">
            {props.file._state !== FileState.Ready ? (
                <DatasetLinkItemProcessing file={props.file} />
            ) : null}
        </div>
    );
};

export default DatasetLinkItem;
