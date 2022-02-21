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
        <MdOutlineCheckBox className="checkbox-icon" />
    ) : (
        <MdOutlineCancelPresentation className="checkbox-icon" />
    );

export default CheckBoxIcon;
