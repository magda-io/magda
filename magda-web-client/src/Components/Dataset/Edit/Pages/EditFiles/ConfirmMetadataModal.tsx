import React, { FunctionComponent } from "react";
import OverlayBox from "Components/Common/OverlayBox";
import AsyncButton from "Components/Common/AsyncButton";

import "./ConfirmMetadataModal.scss";

type PropsType = {
    isOpen: boolean;
};

const AddNewFilesModal: FunctionComponent<PropsType> = (props) => {
    return (
        <OverlayBox
            className="add-new-files-modal"
            isOpen={props.isOpen}
            title="Select the new content you want to add or replace"
        >
            <div className="content-area">
                <div className="bottom-button-area">
                    <AsyncButton>Confirm</AsyncButton> &nbsp;&nbsp;&nbsp;
                    <AsyncButton isSecondary={true}>Cancel</AsyncButton>
                </div>
            </div>
        </OverlayBox>
    );
};

export default AddNewFilesModal;
