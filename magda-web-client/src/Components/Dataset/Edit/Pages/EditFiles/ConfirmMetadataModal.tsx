import React, { FunctionComponent } from "react";
import OverlayBox from "Components/Common/OverlayBox";
import AsyncButton from "Components/Common/AsyncButton";
import {
    State,
    DatasetStateUpdaterType
} from "Components/Dataset/Add/DatasetAddCommon";
import Tooltip from "Components/Dataset/Add/ToolTip";

import "./ConfirmMetadataModal.scss";

type PropsType = {
    isOpen: boolean;
    setIsOpen: (boolean) => void;
    stateData: State;
    datasetStateUpdater: DatasetStateUpdaterType;
};

function retrieveNewMetadataDatasetTitle(state: State) {
    const newDists = state.distributions.filter(
        (item) => item.isReplacementComfired === false
    );
    let newTitle;
    newDists.forEach((item) => {
        if (
            item?.datasetTitle &&
            typeof item.datasetTitle === "string" &&
            item.datasetTitle.trim()
        ) {
            newTitle = item.datasetTitle.trim();
        }
    });
    if (newTitle) {
        return newTitle;
    } else {
        return state.dataset.title;
    }
}

const ConfirmMetadataModal: FunctionComponent<PropsType> = (props) => {
    const { stateData } = props;

    return (
        <OverlayBox
            className="confirm-metadata-modal"
            isOpen={props.isOpen}
            title="Replace the existing automated metadata fields?"
            onClose={() => props.setIsOpen(false)}
        >
            <div className="content-area">
                <Tooltip>
                    You’ve selected to replace the dataset existing content
                    (files and/or API’s) with new content. Some of the metadata
                    we automatically generate for you might change, such as the
                    dataset title, keywords, spatial extent, temporal coverage
                    and creation date. Here you can decide if you want to keep
                    the existing metadata, or replace it with the new,
                    automatically generated metadata.
                </Tooltip>

                <div className="metadata-table-area">
                    <table className="metadata-table">
                        <thead>
                            <tr>
                                <th>Field</th>
                                <th>Existing metadata entry</th>
                                <th>New metadata entry</th>
                                <th>Keep or replace?</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Dataset title</td>
                                <td>{stateData.dataset.title}</td>
                                <td>
                                    {retrieveNewMetadataDatasetTitle(stateData)}
                                </td>
                                <td></td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="bottom-button-area">
                    <AsyncButton>Confirm</AsyncButton> &nbsp;&nbsp;&nbsp;
                    <AsyncButton isSecondary={true}>Cancel</AsyncButton>
                </div>
            </div>
        </OverlayBox>
    );
};

export default ConfirmMetadataModal;
