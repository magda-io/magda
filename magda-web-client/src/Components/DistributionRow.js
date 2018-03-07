import React, { Component } from "react";
import PropTypes from "prop-types";
import type { ParsedDistribution } from "../helpers/record";
import { Link } from "react-router-dom";
import Button from "muicss/lib/react/button";
import "./DistributionRow.css";
import formatIcon from "../assets/format-passive-dark.svg";
import downloadIcon from "../assets/download.svg";
import newTabIcon from "../assets/newtab.svg";

export type PropType = {
    datasetId: string,
    distribution: ParsedDistribution
};

class DistributionRow extends Component {
    constructor(props: PropType) {
        super(props);
        this.state = {
            isExpanded: false
        };
    }

    render() {
        const { datasetId, distribution } = this.props;
        const distributionLink = `/dataset/${encodeURIComponent(
            datasetId
        )}/distribution/${encodeURIComponent(distribution.identifier)}`;

        return (
            <div className="distribution-row mui-row">
                <div className="mui-col-sm-1">
                    <img
                        className="format-icon"
                        src={formatIcon}
                        alt="format icon"
                    />
                </div>
                <div className="mui-col-sm-8">
                    <div className="distribution-row-link">
                        <Link to={distributionLink}>
                            {distribution.title}({distribution.format})
                        </Link>
                    </div>

                    <div className="distribution-row-link-license">
                        {distribution.license &&
                            (typeof distribution.license === "string"
                                ? distribution.license
                                : distribution.license.name
                                    ? distribution.license.name
                                    : "")}
                    </div>
                </div>
                <div className="mui-col-sm-3 button-area">
                    <Button
                        className="download-button"
                        onClick={() => {
                            window.location = `${distribution.downloadURL}`;
                        }}
                    >
                        <img src={downloadIcon} alt="download" />
                        <span className="button-text">Download</span>
                    </Button>
                    <Button
                        className="new-tab-button"
                        onClick={() => {
                            window.open(distributionLink, distribution.title);
                        }}
                    >
                        <img src={newTabIcon} alt="new tab" />
                    </Button>
                </div>
            </div>
        );
    }
}

DistributionRow.PropTypes = {
    datasetId: PropTypes.string,
    distribution: PropTypes.object
};

DistributionRow.defaultProps = {
    datasetId: null,
    distribution: null
};

export default DistributionRow;
