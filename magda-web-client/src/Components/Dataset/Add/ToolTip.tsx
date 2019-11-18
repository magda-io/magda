import React from "react";

import LightBulbIcon from "assets/light-bulb.svg";

import "./ToolTip.scss";

export default function ToolTip(props: any) {
    return (
        <table className="tooltip-root">
            <tbody>
                <tr>
                    <td
                        style={{
                            verticalAlign: "top"
                        }}
                    >
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
            </tbody>
        </table>
    );
}
