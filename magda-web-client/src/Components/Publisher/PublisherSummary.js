import React from "react";
import { Link } from "react-router-dom";
import "./PublisherSummary.css";

function PublisherSummary(props) {
    const details = props.publisher.aspects["organization-details"];
    return (
        <div className="publisher-summray white-box media">
            <div className="media-body">
                <h2>
                    <Link
                        to={
                            "organisations/" +
                            encodeURIComponent(props.publisher.id)
                        }
                    >
                        {props.publisher.name}
                    </Link>
                </h2>
                <div className="publisher-description">
                    {details.description &&
                        details.description.slice(0, 200) + "..."}
                </div>
            </div>
        </div>
    );
}

export default PublisherSummary;
