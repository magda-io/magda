import "./DataQualityTooltip.css";

import React from "react";
import { Link } from "react-router-dom";

import Tooltip from "./Tooltip";

import helpIcon from "../assets/help-24.svg";

export default function DataQualityTooltip(props) {
    return (
        <Tooltip
            className="data-quality-tooltip"
            launcher={() => (
                <Link to="/page/dataset-quality">
                    <img
                        className="data-quality-tooltip-launcher"
                        src={helpIcon}
                        alt="Calculated using the open data scale, click for more information"
                    />
                </Link>
            )}
            innerElementClassName="data-quality-tooltip-inner"
        >
            {() => (
                <React.Fragment>
                    Calculated using the{" "}
                    <Link to="/page/dataset-quality">Open data scale</Link>
                </React.Fragment>
            )}
        </Tooltip>
    );
}
