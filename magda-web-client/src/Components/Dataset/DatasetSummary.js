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
        return formats.length ? (
            <div className="dataset-summary-downloads">
                <img src={fileIcon} alt="File icon" />{" "}
                {formats.map((f, i) => <span key={i}>{f}</span>)}
            </div>
        ) : null;
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

        let datasetSummaryItems = [];

        if (defined(parsed.updatedDate)) {
            datasetSummaryItems.push(
                <div className="dataset-summary-updated">
                    Dataset Updated {parsed.updatedDate}
                </div>
            );
        }

        if (dataset.hasQuality && defined(dataset.quality)) {
            datasetSummaryItems.push(
                <div className="dataset-summary-quality">
                    <QualityIndicator quality={dataset.quality} />
                </div>
            );
        }

        if (
            defined(dataset.distributions) &&
            dataset.distributions.length > 0
        ) {
            const formatIcon = this.renderDownloads(dataset);
            if (formatIcon) {
                datasetSummaryItems.push(formatIcon);
            }
        }

        if (defined(dataset.creation) && defined(dataset.creation.isOpenData)) {
            datasetSummaryItems.push(
                <div className="dataset-summary-type">
                    {dataset.creation.isOpenData ? "Public" : "Private"}
                </div>
            );
        }

        datasetSummaryItems = datasetSummaryItems.reduce(
            (arr, nextSummaryItem, idx) =>
                idx < datasetSummaryItems.length - 1
                    ? [...arr, nextSummaryItem, <Divider />]
                    : [...arr, nextSummaryItem],
            []
        );

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
                    {datasetSummaryItems}
                </div>
            </div>
        );
    }
}
