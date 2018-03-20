import React, { Component } from "react";
import MarkdownViewer from "../../UI/MarkdownViewer";
import defined from "../../helpers/defined";
import getDateString from "../../helpers/getDateString";
import QualityIndicator from "../../UI/QualityIndicator";
import "./DatasetSummary.css";
import { Link } from "react-router-dom";
import uniq from "lodash.uniq";
import helpIcon from "../../assets/help-pink.svg";
import ReactTooltip from "react-tooltip";

export default class DatasetSummary extends Component {
    constructor(props) {
        super(props);
        this.renderDownloads = this.renderDownloads.bind(this);
    }

    renderDownloads(dataset) {
        const formats = uniq(dataset.distributions.map(dis => dis.format));
        return (
            <span className="dataset-summary-downloads">
                {formats.map((f, i) => <span key={i}>{f}</span>)}
            </span>
        );
    }

    render() {
        const dataset = this.props.dataset;
        const publisher = dataset.publisher && dataset.publisher.name;
        debugger;
        return (
            <div className="dataset-summary">
                <h3>
                    <Link
                        className="dataset-summary-title"
                        to={`/dataset/${encodeURIComponent(
                            dataset.identifier
                        )}`}
                    >
                        {dataset.title}
                    </Link>
                </h3>
                {publisher && (
                    <div className="dataset-summary-publisher">{publisher}</div>
                )}

                <div className="dataset-summary-description">
                    <MarkdownViewer
                        markdown={dataset.description}
                        truncate={true}
                    />
                </div>
                <div className="dataset-summary-meta">
                    {defined(dataset.modified) && (
                        <span className="dataset-summary-updated">
                            {" "}
                            Dataset Updated {getDateString(dataset.modified)}
                        </span>
                    )}
                    {defined(
                        dataset.distributions &&
                            dataset.distributions.length > 0
                    ) && this.renderDownloads(dataset)}

                    {defined(dataset.quality) && (
                        <span className="dataset-summary-quality">
                            <QualityIndicator quality={dataset.quality} />
                            <span>
                                <img
                                    src={helpIcon}
                                    alt="help"
                                    className="dataset-summary-quality-help"
                                    data-for={`dataset-quality-tooltip-${
                                        dataset.identifier
                                    }`}
                                    data-tip={dataset.identifier}
                                />
                                <ReactTooltip
                                    type="info"
                                    id={`dataset-quality-tooltip-${
                                        dataset.identifier
                                    }`}
                                    place="top"
                                    effect="solid"
                                    getContent={() => {
                                        return <Link to="/pages/data-quality">{"How is data calculated?"}</Link>;
                                    }}
                                />
                            </span>
                        </span>
                    )}
                </div>
            </div>
        );
    }
}
