import React from "react";
import { withRouter } from "react-router-dom";
import queryString from "query-string";
import AUbuttons from "@gov.au/buttons";
import removePassiveIcon from "../../assets/remove-passive.svg";

const ClearAllButton = ({ location, history }) => {
    const query = queryString.parse(location.search);
    if (
        !query.publisher &&
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
                    <AUbuttons
                        as="secondary"
                        className="btn-facet"
                        onClick={() => {
                            console.log(location);
                            const query = queryString.parse(location.search);
                            const qStr = queryString.stringify({
                                q: query.q ? query.q : ""
                            });
                            history.push({
                                pathname: "/search",
                                search: `?${qStr}`
                            });
                        }}
                    >
                        <img
                            className="facet-icon"
                            src={removePassiveIcon}
                            alt="Clear all button"
                        />
                        <span>Clear All</span>
                    </AUbuttons>
                </div>
            </div>
        </div>
    );
};

export default withRouter(ClearAllButton);
