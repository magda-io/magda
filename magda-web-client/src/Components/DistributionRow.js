import React, { Component } from "react";
import PropTypes from "prop-types";
import type { ParsedDistribution } from "../helpers/record";
import { Link } from "react-router-dom";
import Button from "muicss/lib/react/button";
import "./DistributionRow.css";
import defaultFormatIcon from "../assets/format-passive-dark.svg";
import downloadIcon from "../assets/download.svg";
import newTabIcon from "../assets/newtab.svg";

const formatIcons = {
    default: defaultFormatIcon
};
const dataFormatCategories = [
    "api",
    "archive",
    "document",
    "gis",
    "html",
    "image-raster",
    "image-vector",
    "presentation",
    "spreadsheet",
    "tabular"
];
dataFormatCategories.forEach(item => {
    formatIcons[item] = require(`../assets/data-types/${item}.svg`);
});
const CategoryDetermineConfigItems = [
    {
        regex: /wfs|wms|geojson|kml|kmz|shp|gdb|csv-geo-au|mpk|ArcGIS/,
        category: "gis"
    },
    {
        regex: /api|webservice| web service/,
        category: "api"
    },
    {
        regex: /zip|7z|rar|arj/,
        category: "archive"
    },
    {
        regex: /doc|pdf|docx|txt|plaintext/,
        category: "document"
    },
    {
        regex: /html|htm|web page|web site/,
        category: "html"
    },
    {
        regex: /jpg|gif|jpeg/,
        category: "image-raster"
    },
    {
        regex: /svg|png/,
        category: "image-vector"
    },
    {
        regex: /ppt|pptx/,
        category: "presentation"
    },
    {
        regex: /xlsx|xsl/,
        category: "spreadsheet"
    },
    {
        regex: /csv|tab/,
        category: "tabular"
    }
];

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

    determineFormatIcon() {
        let format = this.props.distribution.format;
        if (!format) return defaultFormatIcon;
        format = format.trim().toLowerCase();
        let matchedCategory = "default";
        for (let i = 0; i < CategoryDetermineConfigItems.length; i++) {
            let config = CategoryDetermineConfigItems[i];
            if (format.match(config.regex)) {
                matchedCategory = config.category;
                break;
            }
        }
        return formatIcons[matchedCategory];
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
                        src={this.determineFormatIcon()}
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
