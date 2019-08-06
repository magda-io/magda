import React from "react";

import LightBulbIcon from "assets/light-bulb.svg";

import "./ToolTip.scss";

export default function ToolTip(props: any) {
    return (
        <p className="tooltip-root">
            <img
                src={props.icon ? props.icon : LightBulbIcon}
                className="tooltip-image"
            />
            <span>{props.children}</span>
        </p>
    );
}
