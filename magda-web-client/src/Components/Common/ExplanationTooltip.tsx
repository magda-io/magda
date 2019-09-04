import "./ExplanationTooltip.scss";

import React from "react";

type Props = {
    children: React.ReactNode;
    dismiss: () => void;
};

export default function ExplanationTooltip(props: Props) {
    return (
        <div className="explanation-tooltip">
            <div>{props.children}</div>
            <button
                type="button"
                className="explanation-tooltip__link au-btn au-btn--tertiary"
                onClick={props.dismiss}
            >
                Got it!
            </button>
        </div>
    );
}
