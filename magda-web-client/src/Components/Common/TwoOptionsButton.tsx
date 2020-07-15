import React, { FunctionComponent } from "react";
import "./TwoOptionsButton.scss";

type PropsType = {
    yesLabel?: string;
    noLabel?: string;
    value: boolean;
    ariaLabelledby?: string;
    onChange: (boolean) => void;
    disabled?: boolean;
    className?: string;
};

const TwoOptionsButton: FunctionComponent<PropsType> = (props) => {
    const { yesLabel, noLabel } = props;
    const isYesChecked = typeof props.value !== "undefined" && props.value;
    const isNoChecked = typeof props.value !== "undefined" && !props.value;
    const disabled = typeof props.disabled !== "undefined" && props.disabled;
    const ariaLabelledby = props.ariaLabelledby
        ? props.ariaLabelledby
        : "radio button";

    return (
        <div
            className={`radio-button-container ${
                disabled ? "is-disabled" : ""
            } ${props.className ? props.className : ""}`}
            role="radiogroup"
            aria-labelledby={ariaLabelledby}
        >
            <div
                className={`yes-button ${isYesChecked ? "is-checked" : ""}`}
                role="radio"
                aria-checked={isYesChecked}
                onClick={() => !disabled && props.onChange(true)}
            >
                {yesLabel ? yesLabel : "Yes"}
            </div>
            <div
                className={`no-button ${isNoChecked ? "is-checked" : ""}`}
                role="radio"
                aria-checked={isNoChecked}
                onClick={() => !disabled && props.onChange(false)}
            >
                {noLabel ? noLabel : "No"}
            </div>
        </div>
    );
};

export default TwoOptionsButton;
