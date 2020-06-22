import React, { FunctionComponent } from "react";
import OverlayBox from "Components/Common/OverlayBox";
import FileDropZone from "../../../Add/Pages/AddFiles/FileDropZone";
import {
    State,
    DatasetStateUpdaterType
} from "Components/Dataset/Add/DatasetAddCommon";
import AsyncButton from "Components/Common/AsyncButton";

import "./AddNewFilesModal.scss";

type PropsType = {
    stateData: State;
    datasetStateUpdater: DatasetStateUpdaterType;
    datasetId: string;
};

const AddNewFilesModal: FunctionComponent<PropsType> = (props) => {
    return (
        <OverlayBox
            className="add-new-files-modal"
            isOpen={true}
            title="Select the new content you want to add or replace"
        >
            <div className="small-heading">New files</div>
            <div className="file-items-area"></div>
            <div className="file-drop-area">
                <FileDropZone
                    stateData={props.stateData}
                    datasetId={props.datasetId}
                    datasetStateUpdater={props.datasetStateUpdater}
                />
            </div>

            <div className="small-heading">
                (and/or) New URL of an API or dataset online
            </div>
            <div className="url-items-area"></div>
            <div className="bottom-button-area">
                <AsyncButton>Finish Adding</AsyncButton> &nbsp;&nbsp;&nbsp;
                <AsyncButton isSecondary={true}>Cancel</AsyncButton>
            </div>
        </OverlayBox>
    );
};

export default AddNewFilesModal;
