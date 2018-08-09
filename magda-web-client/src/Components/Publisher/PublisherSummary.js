import React from "react";
import { Link } from "react-router-dom";
import "./PublisherSummary.css";

function PublisherSummary(props) {
    const linkTo = {
        pathname:
            "organisations/" + encodeURIComponent(props.publisher.identifier),
        state: {
            showFilterExplanation: true
        }
    };

    return (
        <div className="publisher-summray">
            <h2 className="publisher-title">
                <Link to={linkTo}>{props.publisher.name}</Link>
            </h2>
            <div className="publisher-meta">
                <Link to={linkTo}>
                    {props.publisher.datasetCount
                        ? `${props.publisher.datasetCount} ${
                              props.publisher.datasetCount > 1
                                  ? "datasets"
                                  : "dataset"
                          }`
                        : ""}
                </Link>
            </div>
            <div className="publisher-description">
                {props.publisher.description ? props.publisher.description : ""}
            </div>
        </div>
    );
}

export default PublisherSummary;
