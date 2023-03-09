import React from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router-dom";
import queryString from "query-string";
import { ReactComponent as RemovePassiveIcon } from "assets/remove-passive.svg";
import redirect from "helpers/redirect";

const ClearAllButton = ({ location, history, dispatch }) => {
    const query = queryString.parse(location.search);
    if (
        !query.organisation &&
        !query.format &&
        !query.dateFrom &&
        !query.dateTo &&
        !query.regionId
    )
        return null;

    return (
        <div className="search-facet">
            <div className="facet-wrapper">
                <div className="facet-header">
                    <button
                        className="btn-facet au-btn au-btn--secondary"
                        onClick={() => {
                            const query = queryString.parse(location.search);
                            redirect(history, "/search", {
                                q: query.q ? query.q : ""
                            });
                        }}
                    >
                        <RemovePassiveIcon
                            className="facet-icon"
                            aria-label="Clear all button"
                        />
                        <span>Clear All</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default withRouter(connect()(ClearAllButton));
