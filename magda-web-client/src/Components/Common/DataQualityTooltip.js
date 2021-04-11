import "./DataQualityTooltip.scss";

import React from "react";
import { Link } from "react-router-dom";

import TooltipWrapper from "./TooltipWrapper";

import { ReactComponent as HelpIcon } from "assets/help-24.svg";

export default function DataQualityTooltip(props) {
    return (
        <TooltipWrapper
            className="data-quality-tooltip no-print"
            launcher={() => (
                <Link to="/page/linked-data-rating">
                    <HelpIcon
                        className="data-quality-tooltip-launcher"
                        aria-label="Calculated using the Linked Data Rating, click for more information"
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
        </TooltipWrapper>
    );
}
