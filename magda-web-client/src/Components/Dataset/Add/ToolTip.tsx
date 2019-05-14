import React from "react";

import LightBulbIcon from "assets/light-bulb.svg";

import Styles from "./ToolTip.module.scss";

export default function ToolTip(props: any) {
    return (
        <p className={Styles.root}>
            <img src={LightBulbIcon} className={Styles.image} />
            {props.children}
        </p>
    );
}
