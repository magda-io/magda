import React from "react";
import "./ToggleButton.scss";

function ToggleButton(props) {
    return (
        <button
            className={`${props.className || ""} toggle-button`}
            onClick={props.onClick}
        >
            {props.children}
        </button>
    );
}

export default ToggleButton;
