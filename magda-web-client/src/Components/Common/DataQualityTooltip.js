import "./DataQualityTooltip.scss";

import React from "react";
import { Link } from "react-router-dom";

import Tooltip from "./Tooltip";

import helpIcon from "assets/help-24.svg";

export default function DataQualityTooltip(props) {
    return (
        <Tooltip
            className="data-quality-tooltip no-print"
            launcher={() => (
                <Link to="/page/linked-data-rating">
                    <img
                        className="data-quality-tooltip-launcher"
                        src={helpIcon}
                        alt="Calculated using the Linked Data Rating, click for more information"
                    />
                </Link>
            )}
            innerElementClassName="data-quality-tooltip-inner"
        >
            {() => (
                <React.Fragment>
                    Calculated using the{" "}
                    <Link to="/page/linked-data-rating">
                        Linked Data Rating
                    </Link>
                </React.Fragment>
            )}
        </Tooltip>
    );
}
