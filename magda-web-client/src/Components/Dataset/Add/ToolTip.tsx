import React from "react";

import LightBulbIcon from "assets/light-bulb.svg";

import "./ToolTip.scss";

export default function ToolTip(props: any) {
    return (
        <p className="tooltip-root">
            <table>
                <tr>
                    <td>
                        <img
                            src={props.icon ? props.icon : LightBulbIcon}
                            className="tooltip-image"
                        />
                    </td>
                    <td>
                        <span className="tooltip-content">
                            {props.children}
                        </span>
                    </td>
                </tr>
            </table>
        </p>
    );
}
