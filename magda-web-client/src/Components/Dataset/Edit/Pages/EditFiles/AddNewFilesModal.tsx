import React, { FunctionComponent } from "react";
import OverlayBox from "Components/Common/OverlayBox";

import "./AddNewFilesModal.scss";

type PropsType = {};

const AddNewFilesModal: FunctionComponent<PropsType> = (props) => {
    return (
        <OverlayBox className="sss" isOpen={true} title="Example Modal">
            sdsssdsd
        </OverlayBox>
    );
};

export default AddNewFilesModal;
