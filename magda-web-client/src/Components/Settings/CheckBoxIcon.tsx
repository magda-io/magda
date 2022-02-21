import React, { FunctionComponent } from "react";
import {
    MdOutlineCheckBox,
    //MdOutlineCheckBoxOutlineBlank
    MdOutlineCancelPresentation
} from "react-icons/md";

type PropsType = {
    value: boolean;
};

const CheckBoxIcon: FunctionComponent<PropsType> = (props) =>
    props?.value ? (
        <MdOutlineCheckBox
            className="checkbox-icon"
            title="YES"
            aria-label="YES"
        />
    ) : (
        <MdOutlineCancelPresentation
            className="checkbox-icon"
            title="NO"
            aria-label="NO"
        />
    );

export default CheckBoxIcon;
