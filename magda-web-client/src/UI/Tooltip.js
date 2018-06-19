import "./Tooltip.css";

import React from "react";
import { Link } from "react-router-dom";

import helpIcon from "../assets/help-24.svg";

/**
 * @description Return a information tooltip, on hover show calculation method.
 * @returns { div }
 */
const Tooltip = () => {
    return (
        <div className="tooltip">
            <img src={helpIcon} alt="Help Link" />
            <span className="tooltiptext">
                Calculated on online availability, machine readability, open
                formats, use of references and contextual information. More on
                the <Link to="/page/dataset-quality">open data scale</Link>.
            </span>
        </div>
    );
};

export default Tooltip;
