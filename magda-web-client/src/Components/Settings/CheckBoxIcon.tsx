import React, { FunctionComponent } from "react";
import { MdDone, MdClear } from "react-icons/md";

type PropsType = {
    value: boolean;
};

const CheckBoxIcon: FunctionComponent<PropsType> = (props) =>
    props?.value ? (
        <MdDone className="checkbox-icon" title="YES" aria-label="YES" />
    ) : (
        <MdClear className="checkbox-icon" title="NO" aria-label="NO" />
    );

export default CheckBoxIcon;
