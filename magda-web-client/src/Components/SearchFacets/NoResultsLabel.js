import React, { Component } from "react";

import "./NoResultsLabel.css";

export class NoResultsLabel extends Component {
    render() {
        return (
            <button
                type="button"
                className="btn-facet-option-disabled"
                title="No results found"
                disabled
            >
                <span className="btn-facet-option__name">No results</span>
            </button>
        );
    }
}
