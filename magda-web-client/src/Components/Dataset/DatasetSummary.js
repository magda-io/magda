import React, { Component } from "react";
import MarkdownViewer from "../../UI/MarkdownViewer";
import defined from "../../helpers/defined";
import { parseDataset } from "../../helpers/record";
import QualityIndicator from "../../UI/QualityIndicator";
import "./DatasetSummary.css";
import { Link } from "react-router-dom";
import uniq from "lodash.uniq";
import fileIcon from "../../assets/format-passive-dark.svg";
import Divider from "../../UI/Divider";
import { gapi } from "../../analytics/ga";

export default class DatasetSummary extends Component {
    constructor(props) {
        super(props);
        this.renderDownloads = this.renderDownloads.bind(this);
    }

    renderDownloads(dataset) {
        const formats = uniq(
            dataset.distributions
                .filter(dis => defined(dis.format))
                .map(dis => dis.format)
        );
        return (
            <div className="dataset-summary-downloads">
                <img src={fileIcon} alt="File icon" />{" "}
                {formats.map((f, i) => <span key={i}>{f}</span>)}
            </div>
        );
    }

    render() {
        const dataset = this.props.dataset;
        const parsed = parseDataset({
            aspects: {
                "dcat-dataset-strings": dataset
            }
        });
        const publisher = dataset.publisher && dataset.publisher.name;
        const publisherIdent =
            dataset.publisher && dataset.publisher.identifier;
        const searchText = defined(this.props.searchText)
            ? this.props.searchText
            : "";
        const searchResultNumber = this.props.searchResultNumber;
        return (
            <div className="dataset-summary">
                <h2 className="dataset-summary-title">
                    <Link
                        to={`/dataset/${encodeURIComponent(
                            dataset.identifier
                        )}?q=${searchText}`}
                        onClick={() => {
                            if (searchResultNumber) {
                                gapi.event({
                                    category: "Search and Result Clicked",
                                    action: this.props.searchText,
                                    label: (searchResultNumber + 1).toString()
                                });
                            }
                        }}
                    >
                        {dataset.title}
                    </Link>
                </h2>
                {publisher && (
                    <Link
                        className="dataset-summary-publisher"
                        to={`/organisations/${publisherIdent}`}
                    >
                        {publisher}
                    </Link>
                )}

                <div className="dataset-summary-description">
                    <MarkdownViewer
                        markdown={dataset.description}
                        truncate={true}
                    />
                </div>
                <div className="dataset-summary-meta">
                    {defined(parsed.updatedDate) && (
                        <span className="dataset-summary-updated">
                            Dataset Updated {parsed.updatedDate}
                            <Divider />
                        </span>
                    )}
                    {dataset.hasQuality &&
                        defined(dataset.quality) && (
                            <div className="dataset-summary-quality">
                                <QualityIndicator quality={dataset.quality} />
                                <Divider />
                            </div>
                        )}
                    {defined(
                        dataset.distributions &&
                            dataset.distributions.length > 0
                    ) && this.renderDownloads(dataset)}
                </div>
            </div>
        );
    }
}
