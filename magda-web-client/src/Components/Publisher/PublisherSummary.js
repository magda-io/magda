import React from "react";
import { Link } from "react-router-dom";
import "./PublisherSummary.css";

function PublisherSummary(props) {
    return (
        <div className="publisher-summray">
            <h2 className="publisher-title">
                <Link
                    to={
                        "organisations/" +
                        encodeURIComponent(props.publisher.identifier)
                    }
                >
                    {props.publisher.name}
                </Link>
            </h2>
            <div className="publisher-meta">
                {props.publisher.datasetCount
                    ? `${props.publisher.datasetCount} dataset`
                    : ""}
            </div>
            <div className="publisher-description">
                {props.publisher.description ? props.publisher.description : ""}
            </div>
        </div>
    );
}

export default PublisherSummary;
