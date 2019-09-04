import "./FilterExplanation.scss";

import React from "react";

import ExplanationTooltip from "Components/Common/ExplanationTooltip";

type Props = {
    filterType: string;
    dismiss: () => void;
};

export default function FilterExplanation(props: Props) {
    return (
        <ExplanationTooltip dismiss={props.dismiss}>
            <h3 className="filter-explanation-heading">
                Filter by {props.filterType}
            </h3>
            <p className="filter-explanation-para">
                You're now seeing datasets by one{" "}
                <span className="filter-explanation-filter-type">
                    {props.filterType}
                </span>
                .
            </p>
        </ExplanationTooltip>
    );
}
