import "./FilterExplanation.css";

import React from "react";

export default function FilterExplanation(props) {
    return (
        <div className="filter-explanation">
            <h3 className="filter-explanation-heading">
                Filter by {props.filterType}
            </h3>
            <p className="filter-explanation-para">
                You're now seeing datasets by one{" "}
                <span className="filter-explanation-filter-type">
                    {props.filterType}
                </span>.
            </p>
            <button
                type="button"
                className="filter-explanation-link au-btn au-btn--tertiary"
                onClick={props.dismiss}
            >
                Got it!
            </button>
        </div>
    );
}
