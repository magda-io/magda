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
                <img
                    className="data-quality-tooltip-launcher"
                    src={helpIcon}
                    alt="Help Link"
                />
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
