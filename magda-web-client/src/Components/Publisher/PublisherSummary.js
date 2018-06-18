import React from "react";
import { Link } from "react-router-dom";
import "./PublisherSummary.css";

function PublisherSummary(props) {
    const details = "";
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
            <div className="publisher-description" />
        </div>
    );
}

export default PublisherSummary;
