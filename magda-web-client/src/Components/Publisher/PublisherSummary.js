import React from "react";
import { Link } from "react-router-dom";
import "./PublisherSummary.css";

function PublisherSummary(props) {
    const details = props.publisher.aspects["organization-details"];
    return (
        <div className="publisher-summray">
            <h2 className="publisher-title">
                <Link
                    to={
                        "organisations/" +
                        encodeURIComponent(props.publisher.id)
                    }
                >
                    {props.publisher.name}
                </Link>
            </h2>
            <div className="publisher-dataset-count">{`[${
                props.publisher.datasetCount
            }] datasets`}</div>
            <br />
            <div className="publisher-description">
                {details.description &&
                    details.description.slice(0, 200) + "..."}
            </div>
        </div>
    );
}

export default PublisherSummary;
