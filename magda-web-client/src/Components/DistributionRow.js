import React, { Component } from "react";
import { connect } from "react-redux";
import PropTypes from "prop-types";
import { ParsedDistribution } from "../helpers/record";
import { Link } from "react-router-dom";
import "./DistributionRow.css";
import defaultFormatIcon from "../assets/format-passive-dark.svg";
import downloadIcon from "../assets/download.svg";
import newTabIcon from "../assets/external.svg";
import { Medium } from "../UI/Responsive";
import ga from "../analytics/googleAnalytics";
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
        regex: /wfs|wms|geojson|kml|kmz|shp|gdb|csv-geo-au|mpk|ArcGIS|ESRI REST/i,
        category: "gis"
    },
    {
        regex: /api|webservice| web service/i,
        category: "api"
    },
    {
        regex: /zip|7z|rar|arj/i,
        category: "archive"
    },
    {
        regex: /doc|pdf|docx|txt|plaintext/i,
        category: "document"
    },
    {
        regex: /html|htm|web page|web site/i,
        category: "html"
    },
    {
        regex: /^www:/i,
        category: "html"
    },
    {
        regex: /jpg|gif|jpeg/i,
        category: "image-raster"
    },
    {
        regex: /svg|png/i,
        category: "image-vector"
    },
    {
        regex: /ppt|pptx/i,
        category: "presentation"
    },
    {
        regex: /xlsx|xls/i,
        category: "spreadsheet"
    },
    {
        regex: /csv|tab/i,
        category: "tabular"
    }
];

export type PropType = {
    dataset: Dataset,
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

    /**
     * Replace underscores in links with spaces
     * This stops the text from going off the edge of the screen
     */
    renderDistributionLink = title => {
        if (title.includes("_")) {
            return title.replace(/_/g, " ");
        } else {
            return title;
        }
    };

    render() {
        const { dataset, distribution } = this.props;
        let distributionLink;
        if (!distribution.downloadURL && distribution.accessURL) {
            distributionLink = distribution.accessURL;
        } else {
            distributionLink = `/dataset/${encodeURIComponent(
                dataset.id
            )}/distribution/${encodeURIComponent(distribution.identifier)}/?q=${
                this.props.searchText
            }`;
        }

        return (
            <div
                className="distribution-row row"
                itemProp="distribution"
                itemScope
                itemType="http://schema.org/DataDownload"
            >
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
                                        <span itemProp="name">
                                            {this.renderDistributionLink(
                                                distribution.title
                                            )}
                                        </span>(<span itemProp="fileFormat">
                                            {distribution.format}
                                        </span>)
                                    </div>
                                ) : (
                                    <Link to={distributionLink}>
                                        <span itemProp="name">
                                            {this.renderDistributionLink(
                                                distribution.title
                                            )}
                                        </span>(<span itemProp="fileFormat">
                                            {distribution.format}
                                        </span>)
                                    </Link>
                                )}
                                <a
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    href={distributionLink}
                                    className="new-tab-button"
                                >
                                    <img src={newTabIcon} alt="new tab" />
                                </a>
                            </div>

                            <div
                                className="distribution-row-link-license"
                                itemProp="license"
                            >
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
                    {distribution.downloadURL && (
                        <a
                            className="download-button au-btn au-btn--secondary"
                            target="_blank"
                            rel="noopener noreferrer"
                            href={distribution.downloadURL}
                            onClick={() => {
                                // google analytics download tracking
                                const resource_url = encodeURIComponent(
                                    distribution.downloadURL
                                );
                                if (resource_url) {
                                    // legacy support
                                    ga("send", {
                                        hitType: "event",
                                        eventCategory: "Resource",
                                        eventAction: "Download",
                                        eventLabel: resource_url
                                    });
                                    // new events
                                    ga("send", {
                                        hitType: "event",
                                        eventCategory: "Download by Dataset",
                                        eventAction: dataset.title,
                                        eventLabel: resource_url
                                    });
                                    ga("send", {
                                        hitType: "event",
                                        eventCategory: "Download by Source",
                                        eventAction: dataset.source,
                                        eventLabel: resource_url
                                    });
                                    ga("send", {
                                        hitType: "event",
                                        eventCategory: "Download by Publisher",
                                        eventAction: dataset.publisher.name,
                                        eventLabel: resource_url
                                    });
                                }
                            }}
                        >
                            <img src={downloadIcon} alt="download" /> Download
                        </a>
                    )}
                </div>
            </div>
        );
    }
}

DistributionRow.propTypes = {
    dataset: PropTypes.object,
    distribution: PropTypes.object
};

DistributionRow.defaultProps = {
    dataset: null,
    distribution: null
};

export default connect()(DistributionRow);
