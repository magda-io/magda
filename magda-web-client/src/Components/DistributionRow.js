import React, { Component } from "react";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import type { ParsedDistribution } from "../helpers/record";
import { Link } from "react-router-dom";
import Button from "muicss/lib/react/button";
import { showTopNotification } from "../actions/topNotificationAction";
import "./DistributionRow.css";
import defaultFormatIcon from "../assets/format-passive-dark.svg";
import downloadIcon from "../assets/download.svg";
import newTabIcon from "../assets/external.svg";
import { Medium } from "../UI/Responsive";
import ReactTooltip from "react-tooltip";
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
        regex: /^www:/,
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
        regex: /xlsx|xls/,
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

    determineCategoryFromString(str) {
        let matchedCategory = "default";
        if (!str || typeof str !== "string") return matchedCategory;
        str = str.trim().toLowerCase();
        for (let i = 0; i < CategoryDetermineConfigItems.length; i++) {
            let config = CategoryDetermineConfigItems[i];
            if (str.match(config.regex)) {
                matchedCategory = config.category;
                break;
            }
        }
        return matchedCategory;
    }

    determineFormatIcon() {
        let matchedCategory = this.determineCategoryFromString(
            this.props.distribution.format
        );
        if (
            this.props.distribution.downloadURL &&
            matchedCategory === "default"
        ) {
            matchedCategory = this.determineCategoryFromString(
                this.props.distribution.downloadURL
            );
        }
        return matchedCategory;
    }

    render() {
        const { datasetId, distribution } = this.props;
        let distributionLink;
        if (!distribution.downloadURL && distribution.accessURL)
            distributionLink = distribution.accessURL;
        else
            distributionLink = `/dataset/${encodeURIComponent(
                datasetId
            )}/distribution/${encodeURIComponent(distribution.identifier)}/?q=${
                this.props.searchText
            }`;

        return (
            <div className="distribution-row row">
                <div className="col-sm-9">
                    <div className="row">
                        <Medium>
                            <div className="col-sm-1">
                                <ReactTooltip />
                                <img
                                    className="format-icon"
                                    src={
                                        formatIcons[this.determineFormatIcon()]
                                    }
                                    alt="format icon"
                                    data-tip={this.determineFormatIcon()}
                                    data-place="top"
                                />
                            </div>
                        </Medium>

                        <div className="col-md-11">
                            <div className="distribution-row-link">
                                {!distribution.downloadURL &&
                                distribution.accessURL ? (
                                    <div>
                                        {distribution.title}({
                                            distribution.format
                                        })
                                    </div>
                                ) : (
                                    <Link to={distributionLink}>
                                        {distribution.title}({
                                            distribution.format
                                        })
                                    </Link>
                                )}
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
                    </div>
                </div>
                <div className="col-md-3 button-area">
                    {distribution.downloadURL ? (
                        <Button
                            className="download-button"
                            onClick={() => {
                                if (!distribution.downloadURL) {
                                    this.props.dispatch(
                                        showTopNotification(
                                            "Download link is not available for this data source!",
                                            "Error:",
                                            "error"
                                        )
                                    );
                                    return;
                                }

                                // google analytics download tracking
                                const resource_url = encodeURIComponent(
                                    distribution.downloadURL
                                );
                                if (resource_url && window.ga) {
                                    window.ga("send", {
                                        hitType: "event",
                                        eventCategory: "Resource",
                                        eventAction: "Download",
                                        eventLabel: resource_url
                                    });
                                }
                                window.location = distribution.downloadURL;
                            }}
                        >
                            <img src={downloadIcon} alt="download" />
                            <span className="button-text">Download</span>
                        </Button>
                    ) : null}
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

DistributionRow.propTypes = {
    datasetId: PropTypes.string,
    distribution: PropTypes.object
};

DistributionRow.defaultProps = {
    datasetId: null,
    distribution: null
};

export default connect()(DistributionRow);
